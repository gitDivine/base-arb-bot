// scanner.ts — BIGGEST EDIT
// BEFORE: polls prices every 60 seconds via Jupiter HTTP API
// AFTER:  listens to Uniswap V3 Swap events in real-time via WebSocket
//         + quotes Aerodrome via DexScreener on each event
//         Response time: <50ms instead of up to 60,000ms

import { ethers } from 'ethers';
import axios from 'axios';
import { CONFIG } from './config';
import { ArbOpportunity, PriceQuote, WatchPair } from './types';
import { Logger } from './logger';
import { RateLimiter } from './rate-limiter';
import { WalletManager } from './wallet';

// Uniswap V3 Pool ABI — only the Swap event + slot0 for price
const UNI_POOL_ABI = [
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
];

// Aerodrome Pool ABI for Swap Event
const AERO_POOL_ABI = [
  'event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)'
];

const UNI_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
];

const AERO_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, bool stable) external view returns (address pool)',
];

const AERO_PRICE_CACHE: Map<string, number> = new Map(); // tokenOut => price in token/USDC
const DECIMALS_CACHE: Map<string, bigint> = new Map();

export class Scanner {
  private wallet: WalletManager;
  private logger: Logger;
  private rateLimiter: RateLimiter;
  private poolContracts: Map<string, ethers.Contract> = new Map();
  private opportunityCallback?: (opp: ArbOpportunity) => void;
  private cycleCount = 0;
  private hitsToday = 0;

  constructor(wallet: WalletManager, logger: Logger, rateLimiter: RateLimiter) {
    this.wallet = wallet;
    this.logger = logger;
    this.rateLimiter = rateLimiter;
  }

  // Called by index.ts — registers callback for when an opportunity is found
  onOpportunity(cb: (opp: ArbOpportunity) => void): void {
    this.opportunityCallback = cb;
  }

  // ── Main start: subscribe to all watched pair pools ────────
  async start(): Promise<void> {
    this.logger.info('Scanner', 'Resolving Uniswap V3 pool addresses...');

    const factory = new ethers.Contract(
      CONFIG.dexes.uniswapV3Factory,
      UNI_FACTORY_ABI,
      this.wallet.provider
    );
    const aeroFactory = new ethers.Contract(
      CONFIG.dexes.aerodromeFactory,
      AERO_FACTORY_ABI,
      this.wallet.provider
    );

    for (const pair of CONFIG.scanner.watchPairs) {
      const poolAddr: string = await factory.getPool(
        CONFIG.tokens.USDC,
        pair.tokenOut,
        pair.fee
      );

      if (!poolAddr || poolAddr === ethers.ZeroAddress) {
        this.logger.warn('Scanner', `No pool found for ${pair.name} fee=${pair.fee}`);
        continue;
      }

      const pool = new ethers.Contract(poolAddr, UNI_POOL_ABI, this.wallet.provider);
      this.poolContracts.set(pair.name, pool);

      // Subscribe to Uniswap Swap events
      this.wallet.provider.on(
        { address: poolAddr, topics: [ethers.id('Swap(address,address,int256,int256,uint160,uint128,int24)')] },
        async () => {
          try {
            console.log(`[UNI] SWAP EVENT: ${pair.name} - ${poolAddr.slice(0, 10)}...`);
            await this.handleSwapEvent(pair, poolAddr);
          } catch (err: any) {
            this.logger.error('Scanner', `Uni Swap Callback Rejected: ${err.message}`);
          }
        }
      );

      this.logger.info('Scanner', `Listening Uni: ${pair.name} pool ${poolAddr.slice(0, 10)}...`);

      // ── Aerodrome Pool Resolution & Subscription ──
      // Aerodrome pools are identified by stable: true/false not by fee tier like Uniswap.
      let aeroPoolAddr: string = ethers.ZeroAddress;

      const tryGetAeroPool = async (stable: boolean) => {
        try {
          return await aeroFactory.getPool(CONFIG.tokens.USDC, pair.tokenOut, stable);
        } catch {
          return ethers.ZeroAddress;
        }
      };

      // Try stable=false first (volatile pool), then stable=true
      aeroPoolAddr = await tryGetAeroPool(false);
      if (!aeroPoolAddr || aeroPoolAddr === ethers.ZeroAddress) {
        aeroPoolAddr = await tryGetAeroPool(true);
      }

      if (aeroPoolAddr && aeroPoolAddr !== ethers.ZeroAddress) {
        const aeroPool = new ethers.Contract(aeroPoolAddr, AERO_POOL_ABI, this.wallet.provider);
        this.poolContracts.set(`AERO_${pair.name}`, aeroPool);

        // Fetch initial price immediately so we don't have to wait for the first swap
        try {
          const initialPrice = await this.getAerodromePrice(pair);
          if (initialPrice) AERO_PRICE_CACHE.set(pair.tokenOut, initialPrice);
        } catch (e) {
          // Ignore
        }

        // Subscribe to Aerodrome Swap events just to keep price cache updated
        this.wallet.provider.on(
          { address: aeroPoolAddr, topics: [ethers.id('Swap(address,address,uint256,uint256,uint256,uint256)')] },
          async () => {
            try {
              console.log(`[AERO] SWAP EVENT: ${pair.name} - ${aeroPoolAddr}...`);
              // On Aero swap, update the price cache
              const price = await this.getAerodromePrice(pair);
              if (price) AERO_PRICE_CACHE.set(pair.tokenOut, price);

              // We also run the gap check here, because an Aero swap might have opened the gap!
              await this.handleSwapEvent(pair, poolAddr);
            } catch (err: any) {
              this.logger.error('Scanner', `Aero Swap Callback Rejected: ${err.message}`);
            }
          }
        );
        this.logger.info('Scanner', `Listening Aero: ${pair.name} pool ${aeroPoolAddr}`);
      } else {
        this.logger.warn('Scanner', `No Aerodrome pool found for ${pair.name}`);
      }
    }

    this.logger.success('Scanner', `Watching ${this.poolContracts.size} pools via WebSocket`);

    // Setup WebSocket reconnection watchdog
    this.startReconnectWatchdog();
  }

  // ── Called on every DEX swap event — this is where speed matters
  private async handleSwapEvent(pair: WatchPair, poolAddr: string): Promise<void> {
    this.cycleCount++;
    const now = Date.now();

    try {
      // 1. Get current Uniswap price from on-chain slot0
      const uniPrice = await this.getUniswapPrice(pair, poolAddr);
      if (!uniPrice) return;

      // 2. Get current Aerodrome price from on-chain cache (updated by WS events)
      const aeroPrice = AERO_PRICE_CACHE.get(pair.tokenOut);
      if (!aeroPrice) return;

      // 3. Cross-validate prices — reject obvious decode errors
      const priceRatio = Math.max(uniPrice / aeroPrice, aeroPrice / uniPrice);
      if (priceRatio > 2) {
        this.logger.warn('Scanner', `${pair.name} | price mismatch (${priceRatio.toFixed(1)}x) — Uni: ${uniPrice.toFixed(6)} vs Aero: ${aeroPrice.toFixed(6)} — skipping`);
        return;
      }

      // 4. Calculate gap in both directions
      // Direction 1: buy on Uni (lower price), sell on Aero (higher price)
      // Direction 2: buy on Aero (lower price), sell on Uni (higher price)

      const gapBuyUniSellAero = ((aeroPrice - uniPrice) / uniPrice) * 10000; // in bps
      const gapBuyAeroSellUni = ((uniPrice - aeroPrice) / aeroPrice) * 10000;

      const bestGap = Math.max(gapBuyUniSellAero, gapBuyAeroSellUni);
      const bestDirection = gapBuyUniSellAero > gapBuyAeroSellUni ? 1 : 2;

      const UNI_FEE_BPS = pair.fee / 100;
      const AERO_FEE_BPS = 20; // volatile pool fee
      const AAVE_FEE_BPS = 5;  // 0.05% flash loan fee
      const netGap = bestGap - UNI_FEE_BPS - AERO_FEE_BPS - AAVE_FEE_BPS;

      console.log(`${pair.name} | Uni: ${uniPrice} | Aero: ${aeroPrice} | raw gap: ${bestGap?.toFixed(1)}bps | net gap: ${netGap?.toFixed(1)}bps`);

      if (bestGap > 500) {
        this.logger.warn('Scanner', `${pair.name} | gap ${bestGap.toFixed(0)}bps rejected — likely price decode error`);
        return;
      }

      if (netGap >= CONFIG.arb.minProfitBps) {
        // Get REAL quote with actual trade size — accounts for slippage
        const realOut = await this.getActualUniswapQuote(
          pair.tokenOut,
          CONFIG.arb.flashLoanAmount,
          pair.fee
        );
        let realProfit = 0;

        if (!realOut) {
          // Quoter failed — use event price as fallback, apply extra slippage buffer
          const adjustedGap = bestGap - 5; // subtract 5bps safety buffer
          console.log(`Quoter failed for ${pair.name}. Adjusted event gap: ${adjustedGap.toFixed(1)}bps`);

          if (adjustedGap >= CONFIG.arb.minProfitBps) {
            const opp: ArbOpportunity = {
              tokenOut: pair.tokenOut,
              tokenName: pair.name,
              uniPoolFee: pair.fee,
              direction: bestDirection as 1 | 2,
              gapBps: Math.round(netGap),
              flashAmount: CONFIG.arb.flashLoanAmount,
              estimatedProfit: (CONFIG.arb.flashLoanAmount * adjustedGap) / 10000 - CONFIG.arb.flashLoanAmount * CONFIG.aave.flashFee,
              timestamp: now,
            };

            this.hitsToday++;
            this.logger.opportunity(opp);
            this.opportunityCallback?.(opp);
          }
          return;
        } else {
          // Convert realOut back to USDC equivalent using aero price
          const realOutUsdc = realOut * aeroPrice; // aeroPrice = USDC per token unit
          const flashFee = CONFIG.arb.flashLoanAmount * CONFIG.aave.flashFee;
          realProfit = realOutUsdc - CONFIG.arb.flashLoanAmount - flashFee;

          console.log(`Quoter result for ${pair.name}: realOut=${realOut} | realProfit=$${realProfit.toFixed(2)}`);
        }

        if (realProfit >= CONFIG.arb.minProfitUsdc) {
          const opp: ArbOpportunity = {
            tokenOut: pair.tokenOut,
            tokenName: pair.name,
            uniPoolFee: pair.fee,
            direction: bestDirection as 1 | 2,
            gapBps: Math.round(netGap),
            flashAmount: CONFIG.arb.flashLoanAmount,
            estimatedProfit: realProfit,
            timestamp: now,
          };

          this.hitsToday++;
          this.logger.opportunity(opp);
          this.opportunityCallback?.(opp);
        }
      } else {
        // Log closest gap for diagnostics (like your Solana bot's "closest: -Xbps")
        this.logger.debug('Scanner',
          `Cycle #${this.cycleCount} | ${pair.name} | gap: ${bestGap.toFixed(1)}bps | ` +
          `need: ${CONFIG.arb.minProfitBps}bps | hits today: ${this.hitsToday}`
        );
      }
    } catch (err: any) {
      this.logger.error('Scanner', `handleSwapEvent error: ${err.message}`);
    }
  }

  // ── Get Uniswap/Aerodrome V3 CL price from on-chain slot0 ──────────────
  private async getUniswapPrice(pair: WatchPair, poolAddr: string, contractKey?: string): Promise<number | null> {
    try {
      const pool = this.poolContracts.get(contractKey || pair.name);
      if (!pool) return null;

      const slot0 = await pool.slot0();
      const sqrtPriceX96: bigint = slot0[0];

      const token0addr: string = await pool.token0();
      const token1addr: string = await pool.token1();

      // Retrieve accurate decimals dynamically instead of assuming 18
      if (!DECIMALS_CACHE.has(token0addr)) {
        const t0Contract = this.wallet.getERC20Contract(token0addr);
        DECIMALS_CACHE.set(token0addr, await t0Contract.decimals());
      }
      if (!DECIMALS_CACHE.has(token1addr)) {
        const t1Contract = this.wallet.getERC20Contract(token1addr);
        DECIMALS_CACHE.set(token1addr, await t1Contract.decimals());
      }

      const dec0 = DECIMALS_CACHE.get(token0addr)!;
      const dec1 = DECIMALS_CACHE.get(token1addr)!;

      const usdcIsToken0 = token0addr.toLowerCase() === CONFIG.tokens.USDC.toLowerCase();

      const Q96 = BigInt(2) ** BigInt(96);

      // price = (sqrtPriceX96 / 2^96)^2
      // Using floating point math for safety against massive BigInt overflows when formatting
      const p = Number(sqrtPriceX96) / Number(Q96);
      const rawPricePool = p * p;

      // Calculate final human price by shifting decimal places
      const humanPrice = rawPricePool * (10 ** (Number(dec0) - Number(dec1)));

      let price = humanPrice;
      if (!usdcIsToken0) price = 1 / price;

      return price; // tokenOut per USDC
    } catch (err: any) {
      this.logger.error('Scanner', `Uniswap Price Error: ${err.message}`);
      return null;
    }
  }

  // ── Get REAL on-chain Quote (accounting for slippage) ──────────────
  private async getActualUniswapQuote(
    tokenOut: string,
    amountIn: number,
    fee: number
  ): Promise<number | null> {
    const QUOTER_ABI = [
      'function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)'
    ];
    const quoter = new ethers.Contract(
      CONFIG.dexes.uniswapV3Quoter,
      QUOTER_ABI,
      this.wallet.provider
    );
    try {
      const amountInWei = ethers.parseUnits(amountIn.toString(), 6); // USDC = 6 decimals
      const amountOut = await quoter.quoteExactInputSingle.staticCall(
        CONFIG.tokens.USDC, tokenOut, fee, amountInWei, 0
      );

      const tContract = this.wallet.getERC20Contract(tokenOut);
      let decimals = 18;
      if (DECIMALS_CACHE.has(tokenOut)) {
        decimals = Number(DECIMALS_CACHE.get(tokenOut));
      } else {
        decimals = Number(await tContract.decimals());
        DECIMALS_CACHE.set(tokenOut, BigInt(decimals));
      }

      return Number(ethers.formatUnits(amountOut, decimals)); // return token units
    } catch {
      return null;
    }
  }



  // ── Get Aerodrome price via getAmountsOut ───
  private async getAerodromePrice(pair: WatchPair): Promise<number | null> {
    try {
      const ROUTER_ABI = [
        'function getAmountsOut(uint256 amountIn, tuple(address from, address to, bool stable, address factory)[] routes) view returns (uint256[] amounts)'
      ];
      const router = new ethers.Contract(CONFIG.dexes.aerodromeRouter, ROUTER_ABI, this.wallet.provider);

      let decimals = 18;
      if (DECIMALS_CACHE.has(pair.tokenOut)) {
        decimals = Number(DECIMALS_CACHE.get(pair.tokenOut));
      } else {
        const tContract = this.wallet.getERC20Contract(pair.tokenOut);
        decimals = Number(await tContract.decimals());
        DECIMALS_CACHE.set(pair.tokenOut, BigInt(decimals));
      }

      // We want price in Token per 1 USDC
      // So amountIn = 1 USDC (6 decimals)
      const amountIn = ethers.parseUnits('1', 6);

      // We must determine if the pool is stable or not. 
      // We'll assume Volatile (stable=false) by default.
      // If it reverts, this might be a stable pool, but we checked volatile first during setup.
      const routes = [{
        from: CONFIG.tokens.USDC,
        to: pair.tokenOut,
        stable: false,
        factory: CONFIG.dexes.aerodromeFactory
      }];

      try {
        const amounts = await router.getAmountsOut(amountIn, routes);
        return Number(ethers.formatUnits(amounts[amounts.length - 1], decimals));
      } catch (err) {
        // Fallback to stable route if volatile fails
        routes[0].stable = true;
        const amounts = await router.getAmountsOut(amountIn, routes);
        return Number(ethers.formatUnits(amounts[amounts.length - 1], decimals));
      }
    } catch (err: any) {
      this.logger.error('Scanner', `Aerodrome Price Error for ${pair.name}: ${err.message}`);
      return null;
    }
  }

  // ── WebSocket reconnect watchdog ──────────────────────────
  private startReconnectWatchdog(): void {
    setInterval(async () => {
      try {
        const block = await this.wallet.provider.getBlockNumber();
        console.log('WS alive — block:', block);
      } catch {
        this.logger.warn('Scanner', 'WebSocket disconnected — reconnecting...');
        this.wallet.reconnectWs();
        await this.start(); // resubscribe all pools
      }
    }, Math.min(15000, CONFIG.scanner.wsReconnectMs));
  }
}
