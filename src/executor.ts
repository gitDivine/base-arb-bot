// executor.ts — EDITED: Jupiter swaps → Flash loan contract calls
// BEFORE: two separate Jupiter transactions (buy then sell), real capital at risk
// AFTER:  one atomic flash loan transaction, zero capital at risk

import { CONFIG }         from './config';
import { ArbOpportunity, TradeResult } from './types';
import { Logger }         from './logger';
import { WalletManager }  from './wallet';

export class Executor {
  private wallet:    WalletManager;
  private logger:    Logger;
  private lastTrade: number = 0;
  private isTrading: boolean = false;
  private totalProfit: number = 0;
  private tradesExecuted: number = 0;
  private tradesFailed:   number = 0;

  constructor(wallet: WalletManager, logger: Logger) {
    this.wallet = wallet;
    this.logger = logger;
  }

  async execute(opp: ArbOpportunity): Promise<TradeResult> {
    // Guard: prevent concurrent trades
    if (this.isTrading) {
      return { success: false, error: 'Trade already in progress' };
    }

    // Guard: cooldown between trades
    const timeSinceLast = Date.now() - this.lastTrade;
    if (timeSinceLast < CONFIG.arb.cooldownMs) {
      return { success: false, error: `Cooldown: ${CONFIG.arb.cooldownMs - timeSinceLast}ms remaining` };
    }

    // Guard: gas price check
    const gasGwei = await this.wallet.getGasPrice();
    if (gasGwei > CONFIG.arb.maxGasGwei) {
      return { success: false, error: `Gas too high: ${gasGwei.toFixed(2)} gwei (max: ${CONFIG.arb.maxGasGwei})` };
    }

    this.isTrading = true;
    this.lastTrade = Date.now();

    try {
      this.logger.info('Executor',
        `Firing flash loan: ${opp.tokenName} | ${opp.gapBps}bps | $${opp.flashAmount.toLocaleString()} | ` +
        `direction: ${opp.direction === 1 ? 'Buy Uni→Sell Aero' : 'Buy Aero→Sell Uni'}`
      );

      if (CONFIG.dryRun) {
        this.logger.info('Executor', '[DRY RUN] Skipped real transaction');
        return { success: true, profit: opp.estimatedProfit };
      }

      // ONE atomic transaction — flash loan + buy + sell + repay
      const { txHash, gasUsed } = await this.wallet.executeArbitrage(
        opp.tokenOut,
        opp.flashAmount,
        opp.direction,
        opp.uniPoolFee,
        CONFIG.arb.minProfitUsdc
      );

      this.tradesExecuted++;
      this.totalProfit += opp.estimatedProfit;

      this.logger.success('Executor',
        `Trade confirmed | tx: ${txHash.slice(0, 12)}... | ` +
        `estimated profit: $${opp.estimatedProfit.toFixed(2)} | ` +
        `gas used: ${gasUsed.toLocaleString()} | ` +
        `total profit: $${this.totalProfit.toFixed(2)}`
      );

      return { success: true, txHash, profit: opp.estimatedProfit, gasUsed };

    } catch (err: any) {
      this.tradesFailed++;

      // Check if it reverted (expected — gap closed before execution)
      const isRevert = err.message?.includes('revert') || err.message?.includes('execution reverted');
      if (isRevert) {
        this.logger.warn('Executor', `Trade reverted — gap closed before execution (cost: ~$0.15 gas)`);
        return { success: false, error: 'Reverted — gap closed' };
      }

      this.logger.error('Executor', `Unexpected error: ${err.message}`);
      return { success: false, error: err.message };

    } finally {
      this.isTrading = false;
    }
  }

  getStats() {
    return {
      tradesExecuted: this.tradesExecuted,
      tradesFailed:   this.tradesFailed,
      totalProfit:    this.totalProfit,
      successRate:    this.tradesExecuted > 0
        ? ((this.tradesExecuted / (this.tradesExecuted + this.tradesFailed)) * 100).toFixed(1) + '%'
        : 'N/A',
    };
  }
}
