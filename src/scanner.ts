import { ethers } from 'ethers';
import { CONFIG } from './config';
import { ArbOpportunity, DexType, SwapLeg, WatchPair } from './types';
import { Logger } from './logger';
import { RateLimiter } from './rate-limiter';
import { WalletManager } from './wallet';

// --- ABIs ---
const UNI_V3_POOL_ABI = [
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];
const UNI_V3_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
  'function poolByPair(address tokenA, address tokenB) view returns (address pool)'
];
const UNI_V3_QUOTER_ABI = ['function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)'];
const UNI_V3_QUOTER_V2_ABI = [
  'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

const AERO_POOL_ABI = ['event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'];
const AERO_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, bool stable) external view returns (address pool)',
  'function getPair(address tokenA, address tokenB, bool stable) external view returns (address pair)'
];
const AERO_ROUTER_ABI = ['function getAmountsOut(uint256 amountIn, tuple(address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)'];

const UNI_V2_POOL_ABI = ['event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)', 'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'];
const UNI_V2_FACTORY_ABI = ['function getPair(address tokenA, address tokenB) view returns (address pair)'];

const ERC20_ABI = ['function decimals() view returns (uint8)'];

// --- State ---
const PRICE_CACHE: Map<string, Map<string, number>> = new Map(); // dexName => (tokenAddr => priceInUSDC)
const MULTICALL3_ADDR = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MULTICALL3_ABI = [
  'function tryAggregate(bool requireSuccess, (address target, bytes callData)[] calls) external view returns ((bool success, bytes returnData)[])'
];
const ARB_BOT_ABI = [
  'function startArbitrage(address asset, uint256 amount, address dex1, address dex2, address tokenOut, uint24 fee) external'
];

const DECIMALS_CACHE: Map<string, number> = new Map();

export class Scanner {
  private opportunityCallback?: (opp: ArbOpportunity) => void;
  private poolContracts: Map<string, ethers.Contract> = new Map();
  private cycleCount = 0;
  private highestGapSeen = 0;
  private lastReportTime = Date.now();
  private hitsToday = 0;
  private multicall: ethers.Contract;
  private botContract: ethers.Contract;
  private quoteQueue: any[] = [];
  private isProcessingQueue = false;

  constructor(private wallet: WalletManager, private logger: Logger, private rateLimiter: RateLimiter) {
    this.multicall = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, this.wallet.provider);
    this.botContract = new ethers.Contract(CONFIG.wallet.contractAddress, ARB_BOT_ABI, this.wallet.provider);

    // Heartbeat every 60 seconds
    setInterval(() => {
      if (this.poolContracts.size > 0) {
        this.logger.info('Scanner', `Heartbeat: Active monitoring of ${this.poolContracts.size} pools ✓`);
      }
    }, 60000);

    // Start background processor for quote queue
    setInterval(() => this.processQuoteQueue(), 100); // Process every 100ms
  }

  onOpportunity(cb: (opp: ArbOpportunity) => void): void {
    this.opportunityCallback = cb;
  }

  async start(): Promise<void> {
    this.logger.info('Scanner', 'Initializing multi-DEX monitor...');

    for (const pair of CONFIG.scanner.watchPairs) {
      // For each token we watch, initialize pools on all DEXes
      await this.initDexPools(pair);
    }

    this.logger.success('Scanner', `Watching ${this.poolContracts.size} pools across ${CONFIG.chain.name}`);
    this.startReconnectWatchdog();
  }

  private async initDexPools(pair: WatchPair): Promise<void> {
    const dexConfigs: any[] = [];
    
    // Dynamically build dexConfigs from CONFIG.dexes
    for (const [key, value] of Object.entries(CONFIG.dexes)) {
      if (key.endsWith('Factory')) {
        const baseName = key.replace('Factory', '');
        const factoryInfo = value as any;
        const routerInfo = (CONFIG.dexes as any)[`${baseName}Router`];
        
        let type = DexType.UNISWAP_V2;
        if (factoryInfo.dexType === 'uniswapV3' || factoryInfo.dexType === 'ramses') type = DexType.UNISWAP_V3;
        else if (factoryInfo.dexType === 'camelotV3') type = DexType.ALGEBRA;
        else if (factoryInfo.dexType === 'aerodrome') type = DexType.SOLIDLY;

        dexConfigs.push({
          name: baseName,
          type: type,
          factory: factoryInfo.address,
          router: routerInfo.address
        });
      }
    }

    for (const dex of dexConfigs) {
      try {
        let poolAddr = ethers.ZeroAddress;
        
        if (dex.type === DexType.UNISWAP_V3 || dex.type === DexType.ALGEBRA) {
          const factory = new ethers.Contract(dex.factory, UNI_V3_FACTORY_ABI, this.wallet.provider);
          
          // Try specific fee first
          poolAddr = await factory.getPool(pair.baseToken, pair.tokenOut, pair.fee);
          
          if (!poolAddr || poolAddr === ethers.ZeroAddress) {
            // Try common fees as fallback
            for (const f of [500, 3000, 10000]) {
              if (f === pair.fee) continue;
              poolAddr = await factory.getPool(pair.baseToken, pair.tokenOut, f);
              if (poolAddr && poolAddr !== ethers.ZeroAddress) break;
            }
          }
        } 
        else if (dex.type === DexType.SOLIDLY) {
          const factory = new ethers.Contract(dex.factory, AERO_FACTORY_ABI, this.wallet.provider);
          try {
            poolAddr = await factory.getPool(pair.baseToken, pair.tokenOut, false);
            if (poolAddr === ethers.ZeroAddress) {
              poolAddr = await factory.getPool(pair.baseToken, pair.tokenOut, true);
            }
          } catch {
            poolAddr = await factory.getPair(pair.baseToken, pair.tokenOut, false);
            if (poolAddr === ethers.ZeroAddress) {
              poolAddr = await factory.getPair(pair.baseToken, pair.tokenOut, true);
            }
          }
        } 
        else { // V2
          const factory = new ethers.Contract(dex.factory, UNI_V2_FACTORY_ABI, this.wallet.provider);
          poolAddr = await factory.getPair(pair.baseToken, pair.tokenOut);
        }

        if (poolAddr && poolAddr !== ethers.ZeroAddress) {
          const isV3 = dex.type === DexType.UNISWAP_V3 || dex.type === DexType.ALGEBRA;
          const typeLabel = isV3 ? (dex.type === DexType.ALGEBRA ? 'Algebra' : 'V3 Pool') : 'V2/Solidly';
          this.logger.info('Scanner', `Initialized ${dex.name} for ${pair.name} (${typeLabel})`);
          
          // --- Liquidity Check ---
          let liquidityBase = 0;

          if (isV3) {
            // Bypass liquidity check for V3 — tick-based liquidity is complex
            const isUsdc = pair.baseToken.toLowerCase() === CONFIG.tokens.USDC.toLowerCase();
            liquidityBase = (isUsdc ? CONFIG.arb.flashLoanAmountUsdc : CONFIG.arb.flashLoanAmountWeth) * 100;
          } else if (dex.type === DexType.UNISWAP_V2 || dex.type === DexType.SOLIDLY) {
            const v2pool = new ethers.Contract(poolAddr, [
              'function token0() view returns (address)',
              'function token1() view returns (address)',
              'function getReserves() view returns (uint112, uint112, uint32)'
            ], this.wallet.provider);
            const t0 = await v2pool.token0();
            const t1 = await v2pool.token1();
            const [r0, r1] = await v2pool.getReserves();
            
            const decBase = await this.getDecimals(pair.baseToken);
            const resBase = t0.toLowerCase() === pair.baseToken.toLowerCase() ? r0 : (t1.toLowerCase() === pair.baseToken.toLowerCase() ? r1 : 0n);
            liquidityBase = Number(ethers.formatUnits(resBase, decBase));
          }

          const isUsdc = pair.baseToken.toLowerCase() === CONFIG.tokens.USDC.toLowerCase();
          const flashAmount = isUsdc ? CONFIG.arb.flashLoanAmountUsdc : CONFIG.arb.flashLoanAmountWeth;

          if (liquidityBase < flashAmount * 2) {
            this.logger.warn('Scanner', `Skipping ${dex.name} for ${pair.name}: Insufficient liquidity ($${liquidityBase.toLocaleString()} ${isUsdc ? 'USDC' : 'WETH'})`);
            continue;
          }

          this.setupPoolSubscription(dex.name, dex.type, poolAddr, pair);
          const price = await this.fetchPrice(dex.name, dex.type, poolAddr, pair.tokenOut, pair.baseToken);
          if (price) {
            this.updatePriceCache(dex.name, pair.tokenOut, price);
            const liquidityStr = isV3 ? 'V3 Pool' : `$${liquidityBase.toLocaleString()} ${pair.baseToken === CONFIG.tokens.USDC ? 'USDC' : 'WETH'}`;
            this.logger.success('Scanner', `Initialized ${dex.name} for ${pair.name} (${liquidityStr})`);
          }
        }
      } catch (e: any) {
        this.logger.warn('Scanner', `Failed to init ${dex.name} for ${pair.name}: ${e.message}`);
      }
    }
  }

  private setupPoolSubscription(dexName: string, type: DexType, poolAddr: string, pair: WatchPair): void {
    const abi = type === DexType.UNISWAP_V3 ? UNI_V3_POOL_ABI : (type === DexType.SOLIDLY ? AERO_POOL_ABI : UNI_V2_POOL_ABI);
    const contract = new ethers.Contract(poolAddr, abi, this.wallet.provider);
    this.poolContracts.set(`${dexName}_${pair.tokenOut}`, contract);

    const topic = (type === DexType.UNISWAP_V3 || type === DexType.ALGEBRA)
      ? ethers.id('Swap(address,address,int256,int256,uint160,uint128,int24)')
      : (type === DexType.SOLIDLY
        ? ethers.id('Swap(address,address,uint256,uint256,uint256,uint256)')
        : ethers.id('Swap(address,uint256,uint256,uint256,uint256,address)'));

    this.wallet.provider.on({ address: poolAddr, topics: [topic] }, async () => {
      try {
        const price = await this.fetchPrice(dexName, type, poolAddr, pair.tokenOut, pair.baseToken);
        if (price) {
          const oldPrice = PRICE_CACHE.get(dexName)?.get(pair.tokenOut);
          if (price !== oldPrice) {
            this.updatePriceCache(dexName, pair.tokenOut, price);
            this.checkSurfaces(pair.tokenOut);
          }
        }
      } catch (err: any) {
        this.logger.error('Scanner', `Price Update Error [${dexName}]: ${err.message}`);
      }
    });
  }

  private updatePriceCache(dexName: string, tokenAddr: string, price: number): void {
    if (!PRICE_CACHE.has(dexName)) PRICE_CACHE.set(dexName, new Map());
    PRICE_CACHE.get(dexName)!.set(tokenAddr, price);
  }

  private async checkSurfaces(tokenOut: string): Promise<void> {
    this.cycleCount++;
    const pair = CONFIG.scanner.watchPairs.find((p: WatchPair) => p.tokenOut.toLowerCase() === tokenOut.toLowerCase());
    if (!pair) return;

    for (const surface of CONFIG.scanner.surfaces) {
      if (surface.baseAsset.toLowerCase() === tokenOut.toLowerCase()) continue; // Skip if tokenOut is the base asset
      
      const price1 = PRICE_CACHE.get(surface.dex1)?.get(tokenOut);
      const price2 = PRICE_CACHE.get(surface.dex2)?.get(tokenOut);

      if (price1 && price2) {
        await this.evaluateGap(pair, surface, price1, price2, surface.baseAsset);
      }
    }
  }

  private async evaluateGap(pair: WatchPair, surface: any, price1: number, price2: number, baseAsset: string): Promise<void> {
    const gap1to2 = ((price2 - price1) / price1) * 10000; // buy1 sell2
    const gap2to1 = ((price1 - price2) / price2) * 10000; // buy2 sell1

    const bestGap = Math.max(gap1to2, gap2to1);
    const direction = gap1to2 > gap2to1 ? 1 : 2; // 1: buy on dex1, sell on dex2; 2: buy on dex2, sell on dex1

    // Diagnostic tracking
    if (bestGap > this.highestGapSeen) this.highestGapSeen = bestGap;
    
    // Cyclical Report every 500 checks or 5 mins
    if (this.cycleCount % 500 === 0 || (Date.now() - this.lastReportTime > 300000)) {
      if (this.highestGapSeen > 0) {
        this.logger.info('Scanner', `Performance Report: High Gap seen in last period: ${this.highestGapSeen.toFixed(1)}bps (Cycles: ${this.cycleCount})`);
        this.highestGapSeen = 0;
        this.lastReportTime = Date.now();
      }
    }

    // Estimate net gap (fees)
    const buyDexName = direction === 1 ? surface.dex1 : surface.dex2;
    const sellDexName = direction === 1 ? surface.dex2 : surface.dex1;
    const fee1 = this.getDexFeeBps(buyDexName);
    const fee2 = this.getDexFeeBps(sellDexName);
    const netGap = bestGap - fee1 - fee2 - 5; // -5bps for flash loan

    if (bestGap > 500) return; // Skip outlier

    if (netGap >= CONFIG.arb.minProfitBps) {
      this.logger.info('Scanner', `Ratio Gap: ${pair.name} | ${buyDexName} → ${sellDexName} | ${netGap.toFixed(1)}bps. Queueing for verification...`);
      
      const leg1 = this.buildSwapLeg(buyDexName, pair.tokenOut, pair.fee);
      const leg2 = this.buildSwapLeg(sellDexName, pair.tokenOut, pair.fee);

      this.quoteQueue.push({ pair, surface, direction, leg1, leg2, netGap, baseAsset });
    }
  }

  private async batchGetQuotes(requests: any[]): Promise<any[]> {
    const calls: any[] = [];
    
    for (const req of requests) {
      if (req.dexName.includes('V3') || (req.dexName.includes('camelot') && CONFIG.chain.chainId === 42161) || (req.dexName.includes('ramses') && CONFIG.chain.chainId === 42161)) {
        const quoterAddr = (CONFIG.dexes as any).uniswapV3QuoterV2.address;
        const quoter = new ethers.Interface(UNI_V3_QUOTER_V2_ABI);
        const calldata = quoter.encodeFunctionData('quoteExactInputSingle', [{
          tokenIn: req.tokenIn,
          tokenOut: req.tokenOut,
          amountIn: req.amountIn,
          fee: req.fee,
          sqrtPriceLimitX96: 0
        }]);
        calls.push({ target: quoterAddr, callData: calldata });
      } else if (req.dexName.includes('aerodrome') || req.dexName.includes('ramses')) {
        const routerAddr = (CONFIG.dexes as any)[`${req.dexName}Router`].address;
        const factoryAddr = (CONFIG.dexes as any)[`${req.dexName}Factory`].address;
        const router = new ethers.Interface(AERO_ROUTER_ABI);
        const calldata = router.encodeFunctionData('getAmountsOut', [req.amountIn, [{
          from: req.tokenIn,
          to: req.tokenOut,
          stable: false,
          factory: factoryAddr
        }]]);
        calls.push({ target: routerAddr, callData: calldata });
      } else {
        const routerAddr = (CONFIG.dexes as any)[`${req.dexName}Router`].address;
        const router = new ethers.Interface(['function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)']);
        const calldata = router.encodeFunctionData('getAmountsOut', [req.amountIn, [req.tokenIn, req.tokenOut]]);
        calls.push({ target: routerAddr, callData: calldata });
      }
    }

    try {
      const results = await this.multicall.tryAggregate.staticCall(false, calls);
      return results.map((res: any, i: number) => {
        if (!res.success || res.returnData === '0x') return null;
        const req = requests[i];
        if (req.dexName.includes('V3') || (req.dexName.includes('camelot') && CONFIG.chain.chainId === 42161) || (req.dexName.includes('ramses') && CONFIG.chain.chainId === 42161)) {
          const quoter = new ethers.Interface(UNI_V3_QUOTER_V2_ABI);
          const decoded = quoter.decodeFunctionResult('quoteExactInputSingle', res.returnData);
          return decoded.amountOut;
        } else {
          const router = new ethers.Interface(['function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)']);
          const decoded = router.decodeFunctionResult('getAmountsOut', res.returnData);
          const amounts = decoded.amounts;
          return amounts[amounts.length - 1];
        }
      });
    } catch (e: any) {
      this.logger.error('Scanner', `Multicall Failed: ${e.message}`);
      return requests.map(() => null);
    }
  }

  private async processQuoteQueue(): Promise<void> {
    if (this.isProcessingQueue || this.quoteQueue.length === 0) return;
    this.isProcessingQueue = true;

    try {
      const batchSize = 10;
      const batch = this.quoteQueue.splice(0, batchSize);
      
      const leg1Requests = batch.map(q => {
        const isUsdc = q.baseAsset.toLowerCase() === CONFIG.tokens.USDC.toLowerCase();
        const flashAmount = isUsdc ? CONFIG.arb.flashLoanAmountUsdc : CONFIG.arb.flashLoanAmountWeth;
        return {
          dexName: q.direction === 1 ? q.surface.dex1 : q.surface.dex2,
          tokenIn: q.baseAsset,
          tokenOut: q.pair.tokenOut,
          amountIn: ethers.parseUnits(flashAmount.toString(), isUsdc ? 6 : 18),
          fee: q.pair.fee
        }
      });

      const leg1Quotes = await this.batchGetQuotes(leg1Requests);

      // Step 2: Filter valid ones and batch for second legs
      const validForLeg2 = batch.map((q, i) => ({ ...q, quote1: leg1Quotes[i] })).filter(q => q.quote1);
      
      if (validForLeg2.length > 0) {
        const leg2Requests = validForLeg2.map(q => ({
          dexName: q.direction === 1 ? q.surface.dex2 : q.surface.dex1,
          tokenIn: q.pair.tokenOut,
          tokenOut: q.baseAsset,
          amountIn: q.quote1,
          fee: q.pair.fee
        }));

        const leg2Quotes = await this.batchGetQuotes(leg2Requests);

        // Step 3: Final evaluation & Parallel Dynamic Search 🔍⚡
        for (let i = 0; i < validForLeg2.length; i++) {
          const q = validForLeg2[i];
          const isUsdc = q.baseAsset.toLowerCase() === CONFIG.tokens.USDC.toLowerCase();
          const baseDecimals = await this.getDecimals(q.baseAsset);
          
          const sizeFactors = [1.0, 0.5, 0.25]; // Common sizes to check in parallel
          
          const results = await Promise.all(sizeFactors.map(async (factor) => {
            try {
              const currentFlashAmount = (isUsdc ? CONFIG.arb.flashLoanAmountUsdc : CONFIG.arb.flashLoanAmountWeth) * factor;
              let finalBaseAssetAfterSwap = BigInt(0);

              if (factor === 1.0) {
                finalBaseAssetAfterSwap = leg2Quotes[i];
              } else {
                const amountInBig = ethers.parseUnits(currentFlashAmount.toString(), isUsdc ? 6 : 18);
                const q1 = await this.getOnChainQuote(q.direction === 1 ? q.surface.dex1 : q.surface.dex2, q.baseAsset, q.pair.tokenOut, amountInBig, q.pair.fee);
                if (!q1) return null;
                const q2 = await this.getOnChainQuote(q.direction === 1 ? q.surface.dex2 : q.surface.dex1, q.pair.tokenOut, q.baseAsset, q1, q.pair.fee);
                if (!q2) return null;
                finalBaseAssetAfterSwap = q2;
              }

              const realProfit = Number(ethers.formatUnits(finalBaseAssetAfterSwap, baseDecimals)) - currentFlashAmount;
              const realGapBps = (realProfit / currentFlashAmount) * 10000;

              if (realProfit >= CONFIG.arb.minProfitUsdc) {
                const opp: ArbOpportunity = {
                  tokenOut: q.pair.tokenOut,
                  tokenName: q.pair.name,
                  leg1: q.leg1,
                  leg2: q.leg2,
                  gapBps: Math.round(realGapBps),
                  flashAmount: currentFlashAmount,
                  estimatedProfit: realProfit,
                  timestamp: Date.now(),
                  flashAsset: q.baseAsset
                };

                const isSuccess = await this.simulateOpportunity(opp);
                if (isSuccess) return { opp, factor, realProfit };
              }
              return null;
            } catch {
              return null;
            }
          }));

          // Pick the result with the highest absolute profit
          const bestResult = results
            .filter(r => r !== null)
            .sort((a, b) => b!.realProfit - a!.realProfit)[0];

          if (bestResult) {
            const sizeLabel = bestResult.factor === 1.0 ? 'FULL' : `${bestResult.factor * 100}%`;
            this.logger.success('Scanner', `🎯 Optimal Size [${sizeLabel}]: ${q.pair.name} | $${bestResult.realProfit.toFixed(2)} (${bestResult.opp.gapBps}bps)`);
            this.hitsToday++;
            this.logger.opportunity(bestResult.opp);
            if (this.opportunityCallback) this.opportunityCallback(bestResult.opp);
          } else {
            // Log rejection if the full size was a candidate but failed
            const fullSizeResult = results[0]; // results[0] is factor 1.0
            if (!fullSizeResult) {
               // We only log "Phantom" if it looked good on paper but failed simulation
               // Use initial ratio check to decide if it's worth logging as phantom
               this.logger.debug('Scanner', `Skipping ${q.pair.name}: No successful size found.`);
            }
          }
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  private async simulateOpportunity(opp: ArbOpportunity): Promise<boolean> {
    try {
      const amount = ethers.parseUnits(opp.flashAmount.toString(), opp.flashAsset.toLowerCase() === CONFIG.tokens.USDC.toLowerCase() ? 6 : 18);

      // We use staticCall to simulate the transaction for $0 gas
      await this.botContract.startArbitrage.staticCall(
        opp.flashAsset,
        amount,
        opp.leg1.router,
        opp.leg2.router,
        opp.tokenOut,
        opp.leg1.fee
      );

      return true; // If staticCall doesn't throw, it's a success
    } catch (e: any) {
      return false;
    }
  }

  private buildSwapLeg(dexName: string, tokenOut: string, defaultFee: number): SwapLeg {
    const config = (CONFIG.dexes as any);
    const factoryInfo = config[`${dexName}Factory`];
    const routerInfo = config[`${dexName}Router`];

    if (dexName.includes('V3') || dexName.includes('camelot')) {
      return {
        router: routerInfo.address,
        dexType: (dexName.includes('camelot') || factoryInfo.dexType === 'camelotV3') ? DexType.ALGEBRA : DexType.UNISWAP_V3,
        fee: defaultFee,
        stable: false,
        factory: ethers.ZeroAddress
      };
    } else if (dexName.includes('aerodrome') || dexName.includes('ramses')) {
      return {
        router: routerInfo.address,
        dexType: DexType.SOLIDLY,
        fee: 0,
        stable: false, 
        factory: factoryInfo.address
      };
    } else { // V2
      return {
        router: routerInfo.address,
        dexType: DexType.UNISWAP_V2,
        fee: 0,
        stable: false,
        factory: ethers.ZeroAddress
      };
    }
  }

  private getDexFeeBps(dexName: string): number {
    if (dexName.toLowerCase().includes('v3') || dexName.toLowerCase().includes('camelot')) return 30; // 0.3% default
    if (dexName.toLowerCase().includes('aerodrome') || dexName.toLowerCase().includes('ramses')) return 20; // 0.2% volatile
    return 30; // V2 default
  }

  private async getOnChainQuote(dexName: string, tokenIn: string, tokenOut: string, amountIn: bigint | number, fee: number): Promise<bigint | null> {
    try {
      const amountInBig = typeof amountIn === 'bigint' ? amountIn : ethers.parseUnits(amountIn.toString(), tokenIn === CONFIG.tokens.USDC ? 6 : (DECIMALS_CACHE.get(tokenIn) || 18));
      
      if (dexName.includes('V3') || (dexName.includes('camelot') && CONFIG.chain.chainId === 42161) || (dexName.includes('ramses') && CONFIG.chain.chainId === 42161)) {
        const quoterAddr = (CONFIG.dexes as any).uniswapV3QuoterV2.address;
        const quoter = new ethers.Contract(quoterAddr, UNI_V3_QUOTER_V2_ABI, this.wallet.provider);
        const params = {
          tokenIn,
          tokenOut,
          amountIn: amountInBig,
          fee: fee,
          sqrtPriceLimitX96: 0
        };
        const quote = await quoter.quoteExactInputSingle.staticCall(params);
        return quote.amountOut;
      } 
      else if (dexName.includes('aerodrome') || dexName.includes('ramses')) {
        const routerAddr = (CONFIG.dexes as any)[`${dexName}Router`].address;
        const factoryAddr = (CONFIG.dexes as any)[`${dexName}Factory`].address;
        const router = new ethers.Contract(routerAddr, AERO_ROUTER_ABI, this.wallet.provider);
        const routes = [{
          from: tokenIn,
          to: tokenOut,
          stable: false,
          factory: factoryAddr
        }];
        const amounts = await router.getAmountsOut(amountInBig, routes);
        return amounts[amounts.length - 1];
      }
      else { // V2 fallback using getAmountsOut
        const config = (CONFIG.dexes as any);
        const routerAddr = config[`${dexName}Router`].address;
        const router = new ethers.Contract(routerAddr, ['function getAmountsOut(uint256 amountIn, address[] path) view returns (uint256[] amounts)'], this.wallet.provider);
        const amounts = await router.getAmountsOut(amountInBig, [tokenIn, tokenOut]);
        return amounts[amounts.length - 1];
      }
    } catch (e: any) {
      this.logger.debug('Scanner', `Quote failed for ${dexName}: ${e.message}`);
      return null;
    }
  }

  private async fetchPrice(dexName: string, type: DexType, poolAddr: string, tokenOut: string, baseToken: string): Promise<number | null> {
    try {
      const decOut = await this.getDecimals(tokenOut);
      const decBase = await this.getDecimals(baseToken);

      if (type === DexType.UNISWAP_V3 || type === DexType.ALGEBRA) {
        const v3pool = new ethers.Contract(poolAddr, UNI_V3_POOL_ABI, this.wallet.provider);
        const slot0 = await v3pool.slot0();
        const sqrtPriceX96 = slot0[0];
        const token0 = await v3pool.token0();

        const Q96 = BigInt(2) ** BigInt(96);
        const p = Number(sqrtPriceX96) / Number(Q96);
        const rate = p * p; // token1 per token0

        if (token0.toLowerCase() === baseToken.toLowerCase()) {
          // token0 is base (USDC/WETH), token1 is quote (ARB/DEGEN)
          // rate is quote per base. Price (base per quote) = 1/rate
          const adjustedRate = rate * (10 ** (Number(decBase) - Number(decOut)));
          return 1 / adjustedRate;
        } else {
          // token1 is base, token0 is quote
          // rate is base per quote.
          const adjustedRate = rate * (10 ** (Number(decOut) - Number(decBase)));
          return adjustedRate;
        }
      }
      else if (type === DexType.SOLIDLY) {
        const routerAddr = (CONFIG.dexes as any)[`${dexName}Router`].address;
        const factoryAddr = (CONFIG.dexes as any)[`${dexName}Factory`].address;
        const router = new ethers.Contract(routerAddr, AERO_ROUTER_ABI, this.wallet.provider);
        const amountIn = ethers.parseUnits('1', decOut);
        const routes = [{
          from: tokenOut,
          to: baseToken,
          stable: false,
          factory: factoryAddr
        }];
        const amounts = await router.getAmountsOut(amountIn, routes);
        return Number(ethers.formatUnits(amounts[amounts.length - 1], Number(decBase)));
      }
      else if (type === DexType.UNISWAP_V2) {
        const v2pool = new ethers.Contract(poolAddr, [
          'function token0() view returns (address)',
          'function getReserves() view returns (uint112, uint112, uint32)'
        ], this.wallet.provider);
        const token0 = await v2pool.token0();
        const [r0, r1] = await v2pool.getReserves();

        if (token0.toLowerCase() === baseToken.toLowerCase()) {
          // r0 is base, r1 is quote. Price = r0/r1
          return (Number(r0) / Number(r1)) * (10 ** (Number(decOut) - Number(decBase)));
        } else {
          // r1 is base, r0 is quote. Price = r1/r0
          return (Number(r1) / Number(r0)) * (10 ** (Number(decOut) - Number(decBase)));
        }
      }
      return null;
    } catch (e: any) {
      this.logger.debug('Scanner', `Price fetch failed for ${dexName}: ${e.message}`);
      return null;
    }
  }

  private async getDecimals(token: string): Promise<number> {
    if (token.toLowerCase() === CONFIG.tokens.USDC.toLowerCase()) return 6;
    if (token.toLowerCase() === CONFIG.tokens.WETH.toLowerCase()) return 18;
    if (DECIMALS_CACHE.has(token)) return DECIMALS_CACHE.get(token)!;
    const contract = new ethers.Contract(token, ERC20_ABI, this.wallet.provider);
    const d = await contract.decimals();
    DECIMALS_CACHE.set(token, Number(d));
    return Number(d);
  }

  private startReconnectWatchdog(): void {
    setInterval(async () => {
      try {
        await this.wallet.provider.getBlockNumber();
      } catch {
        this.logger.warn('Scanner', 'WS disconnected — reconnecting...');
        this.wallet.reconnectWs();
        await this.start();
      }
    }, 30000);
  }
}
