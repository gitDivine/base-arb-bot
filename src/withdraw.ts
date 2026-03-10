// ============================================================
//  WITHDRAW — Pull profits from contract to wallet
//  Usage: npx ts-node src/withdraw.ts
// ============================================================

import 'dotenv/config';
import { ethers } from 'ethers';
import { CONFIG } from './config';

const ARB_BOT_ABI = [
  'function withdraw(address token) external',
  'function getBalance(address token) external view returns (uint256)'
];

async function withdraw(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(CONFIG.chain.rpcHttp);
  const wallet = new ethers.Wallet(CONFIG.wallet.privateKey, provider);
  const contract = new ethers.Contract(CONFIG.wallet.contractAddress, ARB_BOT_ABI, wallet);

  console.log(`\nChecking profits in contract ${CONFIG.wallet.contractAddress}...\n`);

  for (const [symbol, address] of Object.entries(CONFIG.tokens)) {
    const balance = await contract.getBalance(address);
    if (balance > 0n) {
      // Create a temporary ERC20 contract to get decimals
      const erc20 = new ethers.Contract(address, ['function decimals() view returns (uint8)'], provider);
      const decimals = await erc20.decimals();

      const formatted = parseFloat(ethers.formatUnits(balance, decimals)).toFixed(4);
      console.log(`  ${symbol}: ${formatted}`);

      const tx = await contract.withdraw(address);
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        console.log(`  ✅  Withdrawn ${formatted} ${symbol} to ${wallet.address}`);
      }
    }
  }
  console.log('\nDone.\n');
}

withdraw().catch(console.error);
