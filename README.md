# Base Flash Loan Arbitrage Bot
Upgraded from: solana-arb-bot (Solana) → Base Mainnet

## What Changed
| | Solana Bot | This Bot |
|---|---|---|
| Chain | Solana | Base Mainnet |
| Scan method | 60s HTTP polling | WebSocket real-time events |
| Capital model | Real USDC required | Flash loans (zero capital) |
| Minimum gap | 65bps | 25bps |
| DEXes | Raydium, Orca, Meteora | Uniswap V3, Aerodrome |
| Trade execution | 2 separate transactions | 1 atomic transaction |
| Failure cost | Real money at risk | ~$0.15 gas only |

## Setup
1. Deploy `contracts/ArbBot.sol` in Remix IDE (enable optimizer + viaIR)
2. Copy `.env.example` to `.env` and fill in your values
3. `npm install`
4. `npm start`

## Files
- `contracts/ArbBot.sol` — Flash loan arbitrage smart contract
- `src/config.ts` — All settings
- `src/scanner.ts` — WebSocket price gap detector
- `src/executor.ts` — Flash loan trade executor
- `src/wallet.ts` — EVM wallet manager
- `src/discovery.ts` — Token discovery via DexScreener
- `src/logger.ts` — Logging + Telegram alerts (unchanged)
- `src/rate-limiter.ts` — API rate limiting (unchanged)

---

## Deploy to an Ubuntu VPS (Like DigitalOcean/AWS)

If you rent a cloud computer running Ubuntu, you can SSH into it and run the exact same `npm start` command locally.

**1. Log into your Server**
```bash
ssh root@YOUR_SERVER_IP
```

**2. Install Node.js**
Because it's a fresh server, you need to install Node:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

**3. Clone your Repository**
Download your private code from GitHub:
```bash
git clone https://github.com/gitDivine/base-arb-bot.git
cd base-arb-bot
npm install
```

**4. Setup the Environment Variables**
Since the `.env` file did not upload to GitHub, you need to recreate it on the server:
```bash
nano .env
```
Paste your precise variables from your Windows PC into this file:
```env
PRIVATE_KEY=your_metamask_key
CONTRACT_ADDRESS=0x...
BASE_HTTP_URL=https://base-mainnet...
BASE_WS_URL=wss://base-mainnet...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
```
*(Press `CTRL+O` to save, `CTRL+X` to exit).*

**5. Run it 24/7 with PM2**
If you just type `npm start`, the bot will die when you close your SSH window. We fix this using `pm2`:
```bash
sudo npm install -g pm2
pm2 start npm --name "base-bot" -- start
```
To watch the bot's live output anytime:
```bash
pm2 logs base-bot
```

---

## Deploy to Railway.app (Easiest Cloud Provider)

Railway is an automated hosting service that hosts your bot directly from your GitHub repo. It's much easier than an Ubuntu Server because there is no terminal to mess with.

**1. Create the Service**
- Go to [Railway.app](https://railway.app/).
- Click **New Project** -> **Deploy from GitHub repo**.
- Select your `base-arb-bot` repository.
- Railway will instantly begin building the remote Node.js container.

**2. Add Environment Variables**
- Click on your newly deployed repository block.
- Click the **Variables** tab at the top.
- Click **Add Variable** and create exact copies of your `.env` pairs (e.g. `PRIVATE_KEY`, `BASE_WS_URL`, `CONTRACT_ADDRESS`).

Once you save the final variable, Railway will automatically restart the bot container.

**3. View the Action**
- Click the **Deployments** tab.
- Click **View Logs**.
- You will see the beautiful ASCII dashboard boot up and the bot will begin its real-time websocket scans natively in the cloud!
