// scanner.ts — BIGGEST EDIT
// BEFORE: polls prices every 60 seconds via Jupiter HTTP API
// AFTER:  listens to Uniswap V3 Swap events in real-time via WebSocket
//         + quotes Aerodrome via DexScreener on each event
//         Response time: <50ms instead of up to 60,000ms

import { ethers }           from 'ethers';
import axios                from 'axios';
import { CONFIG }           from './config';
import { ArbOpportunity, PriceQuote, WatchPair } from './types';
import { Logger }           from './logger';
import { RateLimiter }      from './rate-limiter';
import { WalletManager }    from './wallet';

// Uniswap V3 Pool ABI — only the Swap event + slot0 for price
const UNI_POOL_ABI = [
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
  'function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function fee() view returns (uint24)',
];

const UNI_FACTORY_ABI = [
  'function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)',
];

const DEXSCREENER_CACHE: Map<string, { price: number; ts: number }> = new Map();
const CACHE_TTL_MS = 3000; // reuse price quotes for 3 seconds

export class Scanner {
  private wallet:      WalletManager;
  private logger:      Logger;
  private rateLimiter: RateLimiter;
  private poolContracts: Map<string, ethers.Contract> = new Map();
  private opportunityCallback?: (opp: ArbOpportunity) => void;
  private cycleCount  = 0;
  private hitsToday   = 0;

  constructor(wallet: WalletManager, logger: Logger, rateLimiter: RateLimiter) {
    this.wallet      = wallet;
    this.logger      = logger;
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

      // Subscribe to every Swap event on this pool
      pool.on('Swap', async (...args) => {
        await this.handleSwapEvent(pair, poolAddr);
      });

      this.logger.info('Scanner', `Listening: ${pair.name} pool ${poolAddr.slice(0, 10)}...`);
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

      // 2. Get current Aerodrome price from DexScreener (cached 3s)
      const aeroPrice = await this.getAerodromePrice(pair.tokenOut, pair.name);
      if (!aeroPrice) return;

      // 3. Calculate gap in both directions
      // Direction 1: buy on Uni (lower price), sell on Aero (higher price)
      // Direction 2: buy on Aero (lower price), sell on Uni (higher price)

      const gapBuyUniSellAero = ((aeroPrice - uniPrice) / uniPrice) * 10000; // in bps
      const gapBuyAeroSellUni = ((uniPrice - aeroPrice) / aeroPrice) * 10000;

      const bestGap       = Math.max(gapBuyUniSellAero, gapBuyAeroSellUni);
      const bestDirection = gapBuyUniSellAero > gapBuyAeroSellUni ? 1 : 2;

      if (bestGap >= CONFIG.arb.minProfitBps) {
        // Estimate profit
        const gross    = (CONFIG.arb.flashLoanAmount * bestGap) / 10000;
        const flashFee = CONFIG.arb.flashLoanAmount * CONFIG.aave.flashFee;
        const netProfit = gross - flashFee;

        if (netProfit >= CONFIG.arb.minProfitUsdc) {
          const opp: ArbOpportunity = {
            tokenOut:        pair.tokenOut,
            tokenName:       pair.name,
            uniPoolFee:      pair.fee,
            direction:       bestDirection as 1 | 2,
            gapBps:          Math.round(bestGap),
            flashAmount:     CONFIG.arb.flashLoanAmount,
            estimatedProfit: netProfit,
            timestamp:       now,
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

  // ── Get Uniswap V3 price from on-chain slot0 ──────────────
  private async getUniswapPrice(pair: WatchPair, poolAddr: string): Promise<number | null> {
    try {
      const pool = this.poolContracts.get(pair.name);
      if (!pool) return null;

      const slot0 = await pool.slot0();
      const sqrtPriceX96: bigint = slot0[0];

      // Convert sqrtPriceX96 to human price
      // price = (sqrtPriceX96 / 2^96)^2
      const Q96     = BigInt(2) ** BigInt(96);
      const priceRaw = (sqrtPriceX96 * sqrtPriceX96 * BigInt(1e6)) / (Q96 * Q96);

      // Adjust for USDC (6 decimals) vs token (usually 18 decimals)
      // token0 might be USDC or tokenOut depending on address order
      const token0addr: string = await pool.token0();
      const usdcIsToken0 = token0addr.toLowerCase() === CONFIG.tokens.USDC.toLowerCase();

      let price = Number(priceRaw) / 1e6;
      if (!usdcIsToken0) price = 1 / price;

      return price; // tokenOut per USDC
    } catch {
      return null;
    }
  }

  // ── Get Aerodrome price via DexScreener (with 3s cache) ───
  private async getAerodromePrice(tokenAddress: string, symbol: string): Promise<number | null> {
    const cached = DEXSCREENER_CACHE.get(tokenAddress);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return cached.price;
    }

    try {
      await this.rateLimiter.throttle();
      const url = `${CONFIG.discovery.dexScreenerUrl}${tokenAddress}`;
      const res = await axios.get(url, { timeout: 2000 });
      const pairs = res.data?.pairs || [];

      // Find Aerodrome pool on Base
      const aeroPair = pairs.find((p: any) =>
        p.chainId === 'base' && p.dexId === 'aerodrome'
      );

      if (!aeroPair?.priceUsd) return null;

      // Convert USD price to tokenOut per USDC
      const tokenPerUsdc = 1 / parseFloat(aeroPair.priceUsd);
      DEXSCREENER_CACHE.set(tokenAddress, { price: tokenPerUsdc, ts: Date.now() });
      return tokenPerUsdc;
    } catch {
      return null;
    }
  }

  // ── WebSocket reconnect watchdog ──────────────────────────
  private startReconnectWatchdog(): void {
    setInterval(async () => {
      try {
        await this.wallet.provider.getBlockNumber();
      } catch {
        this.logger.warn('Scanner', 'WebSocket disconnected — reconnecting...');
        this.wallet.reconnectWs();
        await this.start(); // resubscribe all pools
      }
    }, CONFIG.scanner.wsReconnectMs);
  }
}
