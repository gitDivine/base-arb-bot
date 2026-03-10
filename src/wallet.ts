// wallet.ts — EDITED: Solana Keypair → EVM ethers.js wallet
import { ethers } from 'ethers';
import { CONFIG } from './config';

// ArbBot contract ABI (only what the bot needs)
const ARB_BOT_ABI = [
  'function startArbitrage(address tokenOut, uint256 flashAmount, uint8 direction, uint24 uniPoolFee, uint256 minProfitUsdc) external',
  'function withdrawToken(address token) external',
  'function withdrawEth() external',
  'function owner() view returns (address)',
  'event ArbitrageExecuted(address tokenOut, uint256 profit, uint8 direction)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
];

export class WalletManager {
  public provider: ethers.WebSocketProvider;
  private httpProvider: ethers.JsonRpcProvider;
  public signer: ethers.Wallet;
  public contract: ethers.Contract;

  constructor() {
    this.httpProvider = new ethers.JsonRpcProvider(CONFIG.chain.rpcHttp, 8453, { staticNetwork: true });
    this.provider = new ethers.WebSocketProvider(CONFIG.chain.rpcWs, 8453, { staticNetwork: true });
    this.signer = new ethers.Wallet(CONFIG.wallet.privateKey, this.httpProvider);
    this.contract = new ethers.Contract(CONFIG.wallet.contractAddress, ARB_BOT_ABI, this.signer);
  }

  async getUsdcBalance(): Promise<number> {
    const usdc = new ethers.Contract(CONFIG.tokens.USDC, ERC20_ABI, this.httpProvider);
    const bal = await usdc.balanceOf(this.signer.address);
    return Number(ethers.formatUnits(bal, 6));
  }

  async getEthBalance(): Promise<number> {
    const bal = await this.httpProvider.getBalance(this.signer.address);
    return Number(ethers.formatEther(bal));
  }

  async getGasPrice(): Promise<number> {
    const fee = await this.httpProvider.getFeeData();
    return Number(ethers.formatUnits(fee.gasPrice || 0n, 'gwei'));
  }

  async executeArbitrage(
    tokenOut: string,
    flashAmount: number,
    direction: 1 | 2,
    uniPoolFee: number,
    minProfitUsdc: number
  ): Promise<{ txHash: string; gasUsed: number }> {
    const flashAmountWei = ethers.parseUnits(flashAmount.toString(), 6);
    const minProfitWei = ethers.parseUnits(minProfitUsdc.toString(), 6);

    const data = this.contract.interface.encodeFunctionData('startArbitrage', [
      tokenOut, flashAmountWei, direction, uniPoolFee, minProfitWei
    ]);

    const tx = await this.signer.sendTransaction({
      to: CONFIG.wallet.contractAddress,
      data: data,
      gasLimit: 2_000_000,
    });

    const receipt = await tx.wait();
    return {
      txHash: receipt!.hash,
      gasUsed: Number(receipt!.gasUsed),
    };
  }

  getERC20Contract(address: string): ethers.Contract {
    return new ethers.Contract(address, ERC20_ABI, this.httpProvider);
  }

  reconnectWs(): void {
    this.provider = new ethers.WebSocketProvider(CONFIG.chain.rpcWs, 8453, { staticNetwork: true });
  }
}
