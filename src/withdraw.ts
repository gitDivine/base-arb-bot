// ============================================================
//  WITHDRAW — Pull profits from contract to wallet
//  Usage: npx ts-node src/withdraw.ts
// ============================================================

import 'dotenv/config';
import { ethers }  from 'ethers';
import { ARB_BOT_ABI, TOKENS, CHAIN_CONFIG } from './config';

async function withdraw(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(CHAIN_CONFIG.rpcHttp);
  const wallet   = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const contract = new ethers.Contract(process.env.ARB_CONTRACT_ADDRESS!, ARB_BOT_ABI, wallet);

  console.log(`\nChecking profits in contract ${process.env.ARB_CONTRACT_ADDRESS}...\n`);

  for (const [symbol, token] of Object.entries(TOKENS)) {
    const balance = await contract.getBalance(token.address);
    if (balance > 0n) {
      const formatted = parseFloat(ethers.formatUnits(balance, token.decimals)).toFixed(4);
      console.log(`  ${symbol}: ${formatted}`);

      const tx      = await contract.withdraw(token.address);
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        console.log(`  ✅  Withdrawn ${formatted} ${symbol} to ${wallet.address}`);
      }
    }
  }
  console.log('\nDone.\n');
}

withdraw().catch(console.error);
