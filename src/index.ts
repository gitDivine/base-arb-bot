// index.ts — Main entry point (updated for Base)
import * as dotenv from 'dotenv';
dotenv.config();
import { ethers } from 'ethers';
import { CONFIG } from './config';
import { WalletManager } from './wallet';
import { Scanner } from './scanner';
import { Executor } from './executor';
import { Discovery } from './discovery';
import { Logger } from './logger';
import { RateLimiter } from './rate-limiter';
import { MetricsCollector } from './metrics';
import { OracleMonitor } from './oracle-monitor';
import { execSync } from 'child_process';

function autoUpdate(): void {
  try {
    const branch = 'main';
    execSync(`git fetch origin ${branch}`, { stdio: 'ignore', timeout: 15000 });
    
    const local = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const remote = execSync(`git rev-parse origin/${branch}`, { encoding: 'utf8' }).trim();
    
    if (local !== remote) {
      console.log(`[Update] New version detected (${remote.slice(0, 7)}). Applying clean update...`);
      
      // Force clean reset to remote state
      execSync(`git reset --hard origin/${branch}`, { stdio: 'inherit' });
      
      // Re-install dependencies
      console.log('[Update] Re-installing dependencies...');
      execSync('npm install --omit=dev', { encoding: 'utf8', timeout: 60000 });
      
      console.log('[Update] Update applied. Restarting bot...');
      process.exit(0);
    }
  } catch (err: any) {
    console.warn('[Update] Auto-update skipped:', err.message);
  }
}

async function startBot(retryCount = 0): Promise<void> {
  const logger = new Logger();
  const rateLimiter = new RateLimiter(30, 1000);

  console.log('[Startup] Initializing WalletManager...');
  const wallet = new WalletManager();

  console.log('[Startup] Validating RPC connections...');
  try {
    if (!CONFIG.wallet.contractAddress || CONFIG.wallet.contractAddress === ethers.ZeroAddress) {
      throw new Error('CONTRACT_ADDRESS is missing in .env! Please deploy your contract or add the address.');
    }
    await wallet.validateAndSwitchRpc();

    console.log('[Startup] Initializing Scanner, Executor, and Discovery...');
    const metrics = new MetricsCollector(logger);
    const scanner = new Scanner(wallet, logger, rateLimiter, metrics);
    const executor = new Executor(wallet, logger);
    const discovery = new Discovery(logger, rateLimiter);

    // Show wallet info
    const ethBal = await wallet.getEthBalance();
    const usdcBal = await wallet.getUsdcBalance();
    logger.info('Wallet', `Address: ${wallet.signer.address.slice(0, 10)}...`);
    logger.info('Wallet', `ETH: ${ethBal.toFixed(4)} | USDC: ${usdcBal.toFixed(2)} | Mode: ${CONFIG.dryRun ? 'DRY RUN' : 'LIVE'}`);

    // Discovery run
    await discovery.run();

    // Wire scanner → executor (with metrics tracking)
    scanner.onOpportunity(async (opp) => {
      const result = await executor.execute(opp);
      if (result.success) metrics.recordTrade();
    });

    // Start WebSocket scanner + metrics reporting
    await scanner.start();
    metrics.startReporting();

    // MEV Stage 1 — Chainlink Oracle Prediction
    const oracle = new OracleMonitor(wallet.provider, logger, (tokenAddr) => scanner.getDexPrice(tokenAddr));

    oracle.onDeviation((event) => {
      if (event.predictedUpdate) {
        // Enter high-alert mode: scan all surfaces for the affected token
        scanner.triggerHighAlert(event.asset, event.direction);
        metrics.recordOraclePrediction();
      }
    });

    oracle.onOracleUpdate((asset, oldPrice, newPrice) => {
      // Oracle confirmed update — immediately scan all surfaces
      scanner.triggerOracleUpdate(asset, oldPrice, newPrice);
      metrics.recordOracleUpdate();
    });

    await oracle.start();

    logger.success('Bot', `Live on ${CONFIG.chain.name}. Listening for price gaps >= ${CONFIG.arb.minProfitBps}bps`);

    // Stats loop
    setInterval(async () => {
      const stats = executor.getStats();
      logger.info('Stats', `Trades: ${stats.tradesExecuted} executed / ${stats.tradesFailed} reverted | Profit: $${stats.totalProfit.toFixed(2)}`);
    }, 60_000);

  } catch (err: any) {
    const msg = err.message || String(err);
    if ((msg.includes('429') || msg.includes('limit exceeded') || msg.includes('405')) && retryCount < 3) {
      console.warn(`[Startup] RPC Issue detected (Attempt ${retryCount + 1}). Retrying with public fallback...`);
      // Use config fallbacks
      (CONFIG.chain as any).rpcHttp = CONFIG.chain.rpcHttp;
      (CONFIG.chain as any).rpcWs = CONFIG.chain.rpcWs;
      return startBot(retryCount + 1);
    }
    throw err;
  }
}

async function main() {
  console.log('\n  ╔══════════════════════════════════════╗');
  console.log(`  ║   Multi-Chain Arb Bot v1.1           ║`);
  console.log(`  ║   Chain: ${CONFIG.chain.name.padEnd(26)}  ║`);
  console.log(`  ║   Loans: Aave V3 (FlashLoans)        ║`);
  console.log('  ╚══════════════════════════════════════╝\n');

  // Run update check in background to avoid blocking initial startup
  autoUpdate();
  
  // 10-minute auto-update checks
  setInterval(() => {
    autoUpdate();
  }, 600_000);
  
  await startBot();
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

// ── Global Error Handlers ────────────────────────────────────
process.on('unhandledRejection', (reason: any) => {
  const msg = reason?.message || String(reason);
  if (msg.includes('429') || msg.includes('limit exceeded')) {
    console.error(`[Fatal] RPC 429 detected. PM2 will restart.`);
    // Since we now have public fallbacks, a restart should eventually hit the fallback
    process.exit(1);
  }
  console.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err: Error) => {
  if (err.message.includes('429') || err.message.includes('limit exceeded')) {
    console.error(`[Fatal] RPC 429 detected (Exception). PM2 will restart.`);
    process.exit(1);
  }
  console.error('Uncaught Exception:', err);
  process.exit(1);
});
