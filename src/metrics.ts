// metrics.ts — Lightweight in-memory metrics collector + Telegram reporter
import { CONFIG } from './config';
import { Logger } from './logger';

interface PeriodStats {
  gapsDetected: number;       // Total gap evaluations where bestGap > 0
  gapsAboveThreshold: number; // Gaps that passed minProfitBps filter
  gapsRejected: number;       // Gaps detected but below threshold
  quotesAttempted: number;    // Sent to quote verification
  quotesSucceeded: number;    // Quotes returned valid amounts
  quotesFailed: number;       // Quotes returned null (revert, liquidity)
  simulationsRun: number;     // staticCall simulations attempted
  simulationsPassed: number;  // Simulations that succeeded
  tradesExecuted: number;     // Actually fired on-chain
  rawGapSum: number;          // Sum of all raw gaps (for averaging)
  netGapSum: number;          // Sum of all net gaps (for averaging)
  highestRawGap: number;      // Peak raw gap in period
  highestNetGap: number;      // Peak net gap in period
  priceUpdates: number;       // Poll/WS price change events
  startTime: number;
}

function freshStats(): PeriodStats {
  return {
    gapsDetected: 0, gapsAboveThreshold: 0, gapsRejected: 0,
    quotesAttempted: 0, quotesSucceeded: 0, quotesFailed: 0,
    simulationsRun: 0, simulationsPassed: 0, tradesExecuted: 0,
    rawGapSum: 0, netGapSum: 0, highestRawGap: 0, highestNetGap: 0,
    priceUpdates: 0, startTime: Date.now(),
  };
}

export class MetricsCollector {
  private current: PeriodStats = freshStats();
  private lifetime: PeriodStats = freshStats();
  private logger: Logger;
  private hourlyTimer: ReturnType<typeof setInterval> | null = null;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  // --- Recording methods (called from scanner/executor) ---

  recordGap(rawGapBps: number, netGapBps: number, passedThreshold: boolean): void {
    this.current.gapsDetected++;
    this.lifetime.gapsDetected++;
    this.current.rawGapSum += rawGapBps;
    this.lifetime.rawGapSum += rawGapBps;
    this.current.netGapSum += netGapBps;
    this.lifetime.netGapSum += netGapBps;

    if (rawGapBps > this.current.highestRawGap) this.current.highestRawGap = rawGapBps;
    if (rawGapBps > this.lifetime.highestRawGap) this.lifetime.highestRawGap = rawGapBps;
    if (netGapBps > this.current.highestNetGap) this.current.highestNetGap = netGapBps;
    if (netGapBps > this.lifetime.highestNetGap) this.lifetime.highestNetGap = netGapBps;

    if (passedThreshold) {
      this.current.gapsAboveThreshold++;
      this.lifetime.gapsAboveThreshold++;
    } else {
      this.current.gapsRejected++;
      this.lifetime.gapsRejected++;
    }
  }

  recordQuote(success: boolean): void {
    this.current.quotesAttempted++;
    this.lifetime.quotesAttempted++;
    if (success) { this.current.quotesSucceeded++; this.lifetime.quotesSucceeded++; }
    else { this.current.quotesFailed++; this.lifetime.quotesFailed++; }
  }

  recordSimulation(passed: boolean): void {
    this.current.simulationsRun++;
    this.lifetime.simulationsRun++;
    if (passed) { this.current.simulationsPassed++; this.lifetime.simulationsPassed++; }
  }

  recordTrade(): void {
    this.current.tradesExecuted++;
    this.lifetime.tradesExecuted++;
  }

  recordPriceUpdate(): void {
    this.current.priceUpdates++;
    this.lifetime.priceUpdates++;
  }

  // --- Reporting ---

  getHeartbeatLine(poolCount: number): string {
    const s = this.current;
    const elapsed = (Date.now() - s.startTime) / 3600000; // hours
    const gapsPerHr = elapsed > 0 ? Math.round(s.gapsDetected / elapsed) : 0;
    const avgRaw = s.gapsDetected > 0 ? (s.rawGapSum / s.gapsDetected).toFixed(1) : '0';
    const avgNet = s.gapsDetected > 0 ? (s.netGapSum / s.gapsDetected).toFixed(1) : '0';
    const rejRate = s.gapsDetected > 0 ? Math.round((s.gapsRejected / s.gapsDetected) * 100) : 0;
    const quoteRate = s.quotesAttempted > 0 ? Math.round((s.quotesSucceeded / s.quotesAttempted) * 100) : 0;
    const simRate = s.simulationsRun > 0 ? Math.round((s.simulationsPassed / s.simulationsRun) * 100) : 0;

    return `${poolCount} pools | Gaps: ${gapsPerHr}/hr (${s.gapsDetected} total) | ` +
      `Avg: ${avgRaw}/${avgNet}bps raw/net | Reject: ${rejRate}% | ` +
      `Best: ${s.highestRawGap.toFixed(1)}bps | ` +
      `Quotes: ${s.quotesSucceeded}/${s.quotesAttempted} (${quoteRate}%) | ` +
      `Sim: ${s.simulationsPassed}/${s.simulationsRun} (${simRate}%) | ` +
      `Prices: ${s.priceUpdates}`;
  }

  // Start hourly Telegram report + periodic console summary
  startReporting(): void {
    // Enhanced heartbeat every 5 minutes to console
    setInterval(() => {
      const line = this.getHeartbeatLine(0); // pool count added by scanner
      this.logger.info('Metrics', line);
    }, 300_000); // 5 min

    // Hourly Telegram summary
    this.hourlyTimer = setInterval(() => {
      this.sendHourlySummary();
    }, 3600_000); // 1 hour
  }

  private async sendHourlySummary(): Promise<void> {
    const s = this.current;
    const elapsed = (Date.now() - s.startTime) / 3600000;
    const gapsPerHr = elapsed > 0 ? Math.round(s.gapsDetected / elapsed) : 0;
    const avgRaw = s.gapsDetected > 0 ? (s.rawGapSum / s.gapsDetected).toFixed(1) : '0';
    const avgNet = s.gapsDetected > 0 ? (s.netGapSum / s.gapsDetected).toFixed(1) : '0';
    const rejRate = s.gapsDetected > 0 ? Math.round((s.gapsRejected / s.gapsDetected) * 100) : 0;

    const msg = [
      `📊 Hourly Metrics — ${CONFIG.chain.name}`,
      ``,
      `Gaps: ${gapsPerHr}/hr (${s.gapsDetected} total)`,
      `Avg gap: ${avgRaw}bps raw / ${avgNet}bps net`,
      `Rejected: ${rejRate}% | Best: ${s.highestRawGap.toFixed(1)}bps`,
      `Quotes: ${s.quotesSucceeded}/${s.quotesAttempted} passed`,
      `Simulations: ${s.simulationsPassed}/${s.simulationsRun} passed`,
      `Trades: ${s.tradesExecuted}`,
      `Price updates: ${s.priceUpdates}`,
    ].join('\n');

    this.logger.sendTelegram(msg);

    // Reset period stats for next hour
    this.current = freshStats();
  }

  // Lifetime stats for /status commands
  getLifetimeStats(): PeriodStats {
    return { ...this.lifetime };
  }
}
