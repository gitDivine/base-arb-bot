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
