// oracle-monitor.ts — MEV Stage 1: Chainlink Oracle Feed Prediction
// Monitors Chainlink price feeds, detects deviation from DEX prices,
// predicts oracle updates, and signals the scanner to enter high-alert mode.
import { ethers } from 'ethers';
import { CONFIG } from './config';
import { Logger } from './logger';

// Chainlink AggregatorV3Interface
const AGGREGATOR_ABI = [
  'function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() external view returns (uint8)',
  'event AnswerUpdated(int256 indexed current, uint256 indexed roundId, uint256 updatedAt)',
];

const MULTICALL3_ADDR = '0xcA11bde05977b3631167028862bE2a173976CA11';
const MULTICALL3_ABI = [
  'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) view returns (tuple(bool success, bytes returnData)[])',
];

export interface OracleAnswer {
  asset: string;       // e.g., 'ETH', 'BTC', 'ARB'
  price: number;       // USD price from Chainlink
  updatedAt: number;   // Timestamp of last update
  roundId: bigint;
  decimals: number;
}

export interface DeviationEvent {
  asset: string;
  oraclePrice: number;
  dexPrice: number;
  deviationPct: number;     // Absolute deviation in %
  deviationThreshold: number; // Configured threshold
  direction: 'up' | 'down'; // DEX price relative to oracle
  predictedUpdate: boolean;  // True if deviation > threshold
  staleness: number;         // Seconds since last oracle update
}

export interface OracleFeedConfig {
  asset: string;           // Human-readable name (ETH, BTC, ARB)
  feedAddress: string;     // Chainlink aggregator address
  deviationThreshold: number; // % deviation that triggers an update (e.g., 0.15 for 0.15%)
  heartbeatSeconds: number;   // Max seconds between updates
  tokenAddress: string;       // Corresponding token address in our system (for price comparison)
}

export class OracleMonitor {
  private multicall: ethers.Contract;
  private feeds: OracleFeedConfig[];
  private lastAnswers: Map<string, OracleAnswer> = new Map();
  private feedDecimals: Map<string, number> = new Map();
  private deviationCallbacks: ((event: DeviationEvent) => void)[] = [];
  private updateCallbacks: ((asset: string, oldPrice: number, newPrice: number) => void)[] = [];
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private predictionActive: Map<string, boolean> = new Map(); // Track active predictions
  private predictionHits = 0;
  private predictionMisses = 0;
  private totalDeviations = 0;

  constructor(
    private provider: ethers.Provider,
    private logger: Logger,
    private dexPriceGetter: (tokenAddress: string) => number | undefined,
  ) {
    this.multicall = new ethers.Contract(MULTICALL3_ADDR, MULTICALL3_ABI, provider);
    this.feeds = CONFIG.oracle?.feeds || [];

    if (this.feeds.length === 0) {
      this.logger.warn('Oracle', 'No Chainlink feeds configured — oracle monitor disabled');
    }
  }

  onDeviation(callback: (event: DeviationEvent) => void): void {
    this.deviationCallbacks.push(callback);
  }

  onOracleUpdate(callback: (asset: string, oldPrice: number, newPrice: number) => void): void {
    this.updateCallbacks.push(callback);
  }

  async start(): Promise<void> {
    if (this.feeds.length === 0) return;

    // Initial fetch of all oracle prices + decimals
    await this.fetchDecimals();
    await this.pollOracles();

    // Log initial state
    for (const [asset, answer] of this.lastAnswers) {
      const dexPrice = this.dexPriceGetter(this.feeds.find(f => f.asset === asset)?.tokenAddress || '');
      const stale = Math.round((Date.now() / 1000) - answer.updatedAt);
      this.logger.info('Oracle', `${asset}/USD: $${answer.price.toFixed(2)} (on-chain) | DEX: $${dexPrice?.toFixed(2) || 'N/A'} | Stale: ${stale}s`);
    }

    // Poll every 15 seconds (faster than regular 30s pool polling)
    this.pollInterval = setInterval(() => this.pollOracles(), 15_000);
    this.logger.success('Oracle', `Monitoring ${this.feeds.length} Chainlink feeds (${this.feeds.map(f => f.asset).join(', ')})`);

    // Subscribe to AnswerUpdated events for real-time detection
    this.subscribeToUpdates();
  }

  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  private async fetchDecimals(): Promise<void> {
    const iface = new ethers.Interface(AGGREGATOR_ABI);
    const calls = this.feeds.map(f => ({
      target: f.feedAddress,
      callData: iface.encodeFunctionData('decimals'),
    }));

    try {
      const results = await this.multicall.tryAggregate.staticCall(false, calls);
      for (let i = 0; i < results.length; i++) {
        if (results[i].success) {
          const decoded = iface.decodeFunctionResult('decimals', results[i].returnData);
          this.feedDecimals.set(this.feeds[i].asset, Number(decoded[0]));
        }
      }
    } catch (e: any) {
      this.logger.warn('Oracle', `Failed to fetch feed decimals: ${e.message?.slice(0, 100)}`);
      // Default to 8 decimals (standard for Chainlink USD feeds)
      for (const feed of this.feeds) {
        this.feedDecimals.set(feed.asset, 8);
      }
    }
  }

  private async pollOracles(): Promise<void> {
    const iface = new ethers.Interface(AGGREGATOR_ABI);
    const calls = this.feeds.map(f => ({
      target: f.feedAddress,
      callData: iface.encodeFunctionData('latestRoundData'),
    }));

    try {
      const results = await this.multicall.tryAggregate.staticCall(false, calls);

      for (let i = 0; i < results.length; i++) {
        if (!results[i].success || results[i].returnData === '0x') continue;

        const feed = this.feeds[i];
        try {
          const decoded = iface.decodeFunctionResult('latestRoundData', results[i].returnData);
          const roundId = decoded[0];
          const answer = decoded[1];
          const updatedAt = Number(decoded[3]);
          const decimals = this.feedDecimals.get(feed.asset) || 8;
          const price = Number(answer) / (10 ** decimals);

          const oldAnswer = this.lastAnswers.get(feed.asset);

          // Detect oracle update (new round or price change)
          if (oldAnswer && oldAnswer.roundId !== roundId) {
            this.logger.success('Oracle', `🔔 ${feed.asset}/USD UPDATED: $${oldAnswer.price.toFixed(2)} → $${price.toFixed(2)} (${((price - oldAnswer.price) / oldAnswer.price * 100).toFixed(3)}%)`);

            // Check if we predicted this
            if (this.predictionActive.get(feed.asset)) {
              this.predictionHits++;
              this.predictionActive.set(feed.asset, false);
              this.logger.success('Oracle', `✅ Prediction HIT for ${feed.asset}! (${this.predictionHits}/${this.predictionHits + this.predictionMisses} accuracy)`);
            }

            // Notify subscribers
            for (const cb of this.updateCallbacks) {
              try { cb(feed.asset, oldAnswer.price, price); } catch { /* ignore callback errors */ }
            }
          }

          this.lastAnswers.set(feed.asset, { asset: feed.asset, price, updatedAt, roundId, decimals });

          // Compare with DEX price
          const dexPrice = this.dexPriceGetter(feed.tokenAddress);
          if (dexPrice && dexPrice > 0) {
            const deviationPct = Math.abs(dexPrice - price) / price * 100;
            const direction = dexPrice > price ? 'up' : 'down';
            const staleness = Math.round(Date.now() / 1000 - updatedAt);
            const predictedUpdate = deviationPct >= feed.deviationThreshold;

            if (predictedUpdate) {
              this.totalDeviations++;
              if (!this.predictionActive.get(feed.asset)) {
                this.predictionActive.set(feed.asset, true);
                this.logger.warn('Oracle', `⚡ PREDICTION: ${feed.asset}/USD update imminent | Oracle: $${price.toFixed(2)} | DEX: $${dexPrice.toFixed(2)} | Dev: ${deviationPct.toFixed(3)}% > ${feed.deviationThreshold}% threshold | Stale: ${staleness}s`);
              }

              const event: DeviationEvent = {
                asset: feed.asset,
                oraclePrice: price,
                dexPrice,
                deviationPct,
                deviationThreshold: feed.deviationThreshold,
                direction,
                predictedUpdate,
                staleness,
              };

              for (const cb of this.deviationCallbacks) {
                try { cb(event); } catch { /* ignore */ }
              }
            } else {
              // Deviation below threshold — if we had an active prediction, it was a miss
              if (this.predictionActive.get(feed.asset)) {
                this.predictionMisses++;
                this.predictionActive.set(feed.asset, false);
              }
            }
          }
        } catch (e: any) {
          // Decode error for one feed, continue with others
        }
      }
    } catch (e: any) {
      this.logger.warn('Oracle', `Multicall poll failed: ${e.message?.slice(0, 100)}`);
    }
  }

  private subscribeToUpdates(): void {
    const iface = new ethers.Interface(AGGREGATOR_ABI);
    const answerUpdatedTopic = iface.getEvent('AnswerUpdated')?.topicHash;

    if (!answerUpdatedTopic) return;

    for (const feed of this.feeds) {
      try {
        this.provider.on({ address: feed.feedAddress, topics: [answerUpdatedTopic] }, (log) => {
          try {
            const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data });
            if (!parsed) return;

            const newPrice = Number(parsed.args[0]) / (10 ** (this.feedDecimals.get(feed.asset) || 8));
            const oldAnswer = this.lastAnswers.get(feed.asset);

            if (oldAnswer) {
              const changePct = ((newPrice - oldAnswer.price) / oldAnswer.price * 100).toFixed(3);
              this.logger.success('Oracle', `🔔 [WS] ${feed.asset}/USD: $${oldAnswer.price.toFixed(2)} → $${newPrice.toFixed(2)} (${changePct}%)`);

              for (const cb of this.updateCallbacks) {
                try { cb(feed.asset, oldAnswer.price, newPrice); } catch { /* ignore */ }
              }
            }
          } catch { /* parse error */ }
        });
      } catch { /* subscription error, polling will cover */ }
    }
  }

  getAnswer(asset: string): OracleAnswer | undefined {
    return this.lastAnswers.get(asset);
  }

  isPredictionActive(asset?: string): boolean {
    if (asset) return this.predictionActive.get(asset) || false;
    for (const active of this.predictionActive.values()) {
      if (active) return true;
    }
    return false;
  }

  getStats(): { predictions: number; hits: number; misses: number; accuracy: string } {
    const total = this.predictionHits + this.predictionMisses;
    return {
      predictions: this.totalDeviations,
      hits: this.predictionHits,
      misses: this.predictionMisses,
      accuracy: total > 0 ? `${(this.predictionHits / total * 100).toFixed(0)}%` : 'N/A',
    };
  }
}
