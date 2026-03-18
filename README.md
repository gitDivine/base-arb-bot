# ⚡ Multi-Asset Flash Loan Arbitrage Bot (Base & Arbitrum)

Zero-capital arbitrage using Aave V3 flash loans across **Uniswap V3**, **Aerodrome**, **Camelot V3**, and **Ramses**. Supports any asset (USDC, WETH, etc.) as a flash loan source.

## Quick Start (Arbitrum One)

### 0. Install Dependencies

You need **Git** and **Node.js 18+** installed on your machine.

**Ubuntu / Debian:**
```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

### 1. Clone & Install

```bash
git clone https://github.com/gitDivine/base-arb-bot.git
cd base-arb-bot
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Open `.env` in a text editor and fill in your values. For **Arbitrum**, ensure `ARB_HTTP_URL` and `ARB_WS_URL` are set.

### 3. Deploy the Contract (Arbitrum)

```bash
# Deploys the multi-asset contract to Arbitrum
npx ts-node scripts/deploy.ts
```

This compiles `contracts/ArbBot.sol`, deploys it to Arbitrum One, and **auto-updates** your `.env` with the new contract address.

### 4. Run

```bash
npm start
```

The bot will start scanning for price gaps across all configured surfaces in real-time.

## Configuration

Edit `src/config.ts` to tune the bot:

| Setting | Default | Description |
|---|---|---|
| `minProfitBps` | `12.0` | Minimum net gap after fees to fire |
| `flashLoanAmount` | `100` | Base asset amount (e.g. 100 USDC or 100 WETH) |
| `cooldownMs` | `1000` | Minimum time between trades |
| `maxGasGwei` | `50.0` | Gas ceiling |

## How It Works

```
Swap detected → Batch Quote via Multicall3 (Low RPC usage)
→ Compare prices on Dex1 vs Dex2 (relative to baseAsset)
→ If net gap >= minProfitUsdc → Borrow flashAsset (USDC/WETH) from Aave
→ Buy on cheap DEX, sell on expensive DEX
→ Repay loan + keep profit — all in one atomic transaction
```

## Safety & Hardening 🛡️

- **Net Profit Math**: Filters opportunities to ensure they cover all fees + slippage.
- **Price Cross-Validation**: Prevents firing on broken or manipulated price feeds.
- **Dry Run Mode**: Toggle `DRY_RUN=true` in `.env` to simulate without risk.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `PRIVATE_KEY` | ✅ | Wallet private key |
| `CONTRACT_ADDRESS` | Auto | Filled by `npm run deploy` |
| `BASE_HTTP_URL` | ✅ | Alchemy HTTP RPC |
| `BASE_WS_URL` | ✅ | Alchemy WebSocket RPC |
| `DRY_RUN` | No | `true` to simulate (default: `false`) |
| `TELEGRAM_BOT_TOKEN` | No | Telegram alerts |
| `TELEGRAM_CHAT_ID` | No | Telegram alerts |

## Advanced Deployment

See [ADVANCED.md](ADVANCED.md) for manual Remix deployment, VPS hosting with PM2, and Railway.app cloud deployment.

## License

MIT
