// discovery.ts — EDITED: Solana/DexScreener Solana → Base/DexScreener Base
// Logic kept identical — only the chain filter and token source changes

import axios from 'axios';
import { CONFIG } from './config';
import { TokenInfo, WatchPair } from './types';
import { Logger } from './logger';
import { RateLimiter } from './rate-limiter';

// Well-known tokens to always watch
const SEED_TOKENS = CONFIG.scanner.watchPairs.map((p: WatchPair) => p.tokenOut);

export class Discovery {
  private logger: Logger;
  private rateLimiter: RateLimiter;
  private watchlist: Map<string, TokenInfo> = new Map();

  constructor(logger: Logger, rateLimiter: RateLimiter) {
    this.logger = logger;
    this.rateLimiter = rateLimiter;
  }

  async run(): Promise<TokenInfo[]> {
    const chainName = CONFIG.chain.chainId === 42161 ? 'arbitrum' : 'base';
    const primaryDex = chainName === 'arbitrum' ? 'uniswap' : 'uniswap';
    const secondaryDexes = chainName === 'arbitrum' ? ['camelot', 'ramses'] : ['aerodrome'];

    for (const address of SEED_TOKENS) {
      try {
        await this.rateLimiter.throttle();
        const res = await axios.get(`${CONFIG.discovery.dexScreenerUrl}${address}`, { timeout: 5000 });
        
        const pairs = (res.data?.pairs || []).filter((p: any) =>
          p.chainId === chainName &&
          (p.dexId === 'uniswap' || p.dexId === 'aerodrome' || p.dexId === 'camelot' || p.dexId === 'ramses') &&
          parseFloat(p.volume?.h24 || 0) >= CONFIG.discovery.minDailyVolumeUsd &&
          parseFloat(p.liquidity?.usd || 0) >= CONFIG.discovery.minLiquidityUsd
        );

        if (pairs.length >= 2) {
          const mainPair = pairs.find((p: any) => p.dexId === primaryDex);
          const sidePair = pairs.find((p: any) => secondaryDexes.includes(p.dexId));

          if (mainPair && sidePair) {
            const info: TokenInfo = {
              address,
              symbol: mainPair.baseToken?.symbol || address.slice(0, 6),
              dailyVolumeUsd: parseFloat(mainPair.volume?.h24 || 0),
              liquidityUsd: parseFloat(mainPair.liquidity?.usd || 0),
              uniPoolFee: this.inferPoolFee(mainPair),
            };
            this.watchlist.set(address, info);
            added++;
          }
        }
      } catch (err: any) {
        this.logger.warn('Discovery', `Failed to fetch ${address.slice(0, 10)}: ${err.message}`);
      }
    }

    const tokens = Array.from(this.watchlist.values())
      .sort((a, b) => b.dailyVolumeUsd - a.dailyVolumeUsd);

    this.logger.info('Discovery',
      `${tokens.length} tokens on watchlist | +${added} new | ` +
      `Top: ${tokens.slice(0, 3).map(t => t.symbol).join(', ')}`
    );

    return tokens;
  }

  private inferPoolFee(pair: any): number {
    // DexScreener sometimes includes fee in pairAddress or labels
    // Default to 500 (0.05%) for stables, 3000 (0.3%) for others
    const symbol = pair.baseToken?.symbol?.toUpperCase() || '';
    if (['DAI', 'USDT', 'FRAX'].includes(symbol)) return 100;
    if (['WETH', 'CBETH', 'CBBTC', 'WBTC'].includes(symbol)) return 500;
    return 3000;
  }

  getWatchlist(): TokenInfo[] {
    return Array.from(this.watchlist.values());
  }
}
