# 0xd Bot Factory — PROJECT BRAIN
**Last Updated:** March 2026
**Wallet:** `0x863D20694E1E74A96a149fA21BeFe13FbBF529c6`
**VPS Primary:** `clicker-1` | IP: `145.241.96.149` | Ubuntu 22.04 (Oracle Cloud Free Tier)
**VPS Backup:** `instance-20260305-0622` | IP: `129.151.172.71`
**SSH Key:** `~/ssh-key-2026-03-05.key`

---

## System Architecture

Three repos, one wallet, one Oracle VM, one Telegram manager:

| Repo | Local | Remote | Purpose |
|------|-------|--------|---------|
| `base-arb-bot` | `C:\Users\njoku\Downloads\base-arb-bot` | `gitDivine/base-arb-bot` | Flash loan arbitrage — Base + Arbitrum |
| `aave-liquidation-bot` | `C:\Users\njoku\liquidation-bot\liquidation-bot` | `gitDivine/aave-liquidation-bot` | Flash loan liquidation — Base + Arbitrum |
| `bots-manager` | `C:\Users\njoku\bots-manager` | `gitDivine/bots-manager` | Telegram control centre |

---

## Deployed Contracts

| Chain | Bot | Contract Address |
|-------|-----|-----------------|
| Base | ArbBot.sol | `0xbbFc8Bf808A0D1b964048B87c0787e03c97Cc341` |
| Base | LiquidationBot.sol | `0xbfB83FD70B149DEF53591f50762Ed31c56Cb849E` |
| Arbitrum | ArbBot.sol | `0x1d1D09a9f891B3E0C62f5C1A3a6dC6DA7E4FE197` ✅ (owner verified) |
| Arbitrum | LiquidationBot.sol | *(check `CONTRACT_ADDRESS` env on VPS)* |

---

## Phase Status

| Phase | Name | Status |
|-------|------|--------|
| P0–P8 | Rescue, Base Live, Multi-chain, Manager, Hardening | ✅ DONE |
| P9 | Multi-chain bots-manager | ✅ DONE |
| P10 | Production Hardening | ✅ DONE |
| P11 | Scaling Hunter (15+ tokens, Multicall3) | ✅ DONE |
| P12 | Sniper Mode (staticCall simulation) + Surface Expansion | ✅ DONE |
| P13 | Parallel Dynamic Size Optimizer + Whale Fix | ✅ DONE |
| **P14** | **Arbitrum ArbBot.sol deploy + debug** | ✅ DONE (deployed, config fixed, watchlist expanded) |

---

## Current State (March 2026)

### base-arb-bot (Phase 13 complete)
- **Base:** Running, healthy. Monitoring AERO, WELL, cbBTC, VIRTUAL, MOXIE, MAGA.
- **Arbitrum:** Monitoring RDNT, PENDLE, WBTC, LINK, DAI, UNI, FRAX, LDO, GNS, CRV, DEGEN — 12 pairs across Uniswap V3, Camelot V3, Ramses.
- **FIXED (2026-03-27):** Contract address hardcoded, WS URL fixed, Ramses factory corrected, Camelot poolByPair fixed, stale ABI replaced, fee tier caching added, watchlist expanded to 9 pools (ARB, WBTC-USDC, GMX-USDC, DAI + Camelot pairs).

### aave-liquidation-bot (Phase 12 complete)
- **Base:** Running, 193+ positions watched.
- **Arbitrum:** Running, 120+ positions discovered. Branch tracked = `master` (GitHub uses `main` — auto-update will silently fail).
- **Bug:** `autoUpdate()` uses `const branch = 'master'` but remote is `main`. Fix: change to `'main'`.

### bots-manager
- Running under Systemd. Multi-chain aware. Latest commit adds Arbitrum bot instances.

---

## Known Issues (Active)

### RESOLVED (2026-03-27)
- ~~Arbitrum ArbBot.sol not deployed~~ → deployed at `0x1d1D09a9f891B3E0C62f5C1A3a6dC6DA7E4FE197`, config hardcoded
- ~~Stale ARB_BOT_ABI in scanner.ts~~ → replaced with correct startArbitrage signature
- ~~Camelot poolByPair not called~~ → ALGEBRA type now branches to poolByPair
- ~~Ramses wrong factory address~~ → corrected to `0xd0019e86edB35E1fedaaB03aED5c3c60f115d28b`
- ~~Fee tier mismatch in quotes~~ → feeCache stores actual discovered fee
- ~~Liquidation bot variableDebtTokenAddress crash~~ → ethers v6 auto-unwrap fix
- ~~bots-manager RPC_URL crash~~ → dead code removed
- ~~Silent WS death~~ → 30s polling fallback added (2026-03-28)

### HIGH
1. **Log duplication x5** — Multiple WS event listeners stacking on reconnect. Needs investigation.
2. **Ramses V3 quoter routing** — Ramses on Arbitrum routed to UniV3 QuoterV2. Ramses has its own quoter. May produce incorrect quotes.
3. **Base arb gaps below threshold** — AERO gaps tight. Consider more volatile pairs or lower flash amounts.

### MEDIUM
4. **QuoterV2 for Camelot** — Camelot V3 (Algebra) may need Algebra-specific quoter, not UniV3 QuoterV2.
5. **No profit sweep** — Contract profits accumulate without auto-sweep to wallet.
6. **Liquidation bot auto-update branch** — Uses `master` but remote may be `main` on some repos.

---

## Whitepaper Roadmap (What Comes After P14)

| Phase | Bot | Chain | Notes |
|-------|-----|-------|-------|
| JIT Bot | JIT Liquidity | Arbitrum | Requires $200-500 USDC seed from bot profits. Public mempool only. |
| P15 | BSC Expansion | BSC | PancakeSwap vs BiSwap arb + Aave V3 liquidations |
| P16 | Polygon Expansion | Polygon | Uni V3 vs QuickSwap arb + Aave V3 liquidations |
| Long-term | Sandwich Defense Arb | All chains | MEV profits from sandwich detection |
| Long-term | GMX Yield Engine | Arbitrum | GLP pool passive yield from bot profits |
| Long-term | Aerodrome LP | Base | ve(3,3) passive yield from bot profits |

---

## Key Addresses

| Contract | Chain | Address |
|----------|-------|---------|
| Aave V3 Pool | Base | `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` |
| Aave V3 Pool | Arbitrum | `0x794a61358D6845594F94dc1DB02A252b5b4814aD` |
| Multicall3 | All chains | `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Uni V3 Factory | Base | `0x33128a8fC17869897dcE68Ed026d694621f6FDfD` |
| Uni V3 Factory | Arbitrum | `0x1F98431c8aD98523631AE4a59f267346ea31F984` |
| Aerodrome Factory | Base | `0x420DD381b31aEf6683db6B902084cB0FFECe40Da` |
| Camelot V3 Factory | Arbitrum | `0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B` |
| Ramses V3 CL Factory | Arbitrum | `0xd0019e86edB35E1fedaaB03aED5c3c60f115d28b` |

---

## VPS Operations

```bash
# SSH
ssh -i ~/ssh-key-2026-03-05.key ubuntu@145.241.96.149

# Deploy update (all bots)
cd ~/base-arb-bot && git fetch origin && git reset --hard origin/main && npm install && npm start
cd ~/aave-liquidation-bot && git fetch origin && git reset --hard origin/main && npm install

# Logs
tail -f ~/base-arb-bot/arb.log
tail -f ~/aave-liquidation-bot/liq.log

# Set Arbitrum contract address (after deploy)
export CONTRACT_ADDRESS=<deployed_address>
# Or add to .env file
```

---

## Session Log

### Session: March 2026 — New Agent Onboarding
- Read all brain files, walkthrough docs (P1–P13), whitepaper, and live codebase
- Identified CRITICAL: Arbitrum ArbBot.sol not deployed (contractAddress empty)
- Identified: Liquidation bot auto-update on wrong branch (master vs main)
- Identified: Log duplication x5 in arb.log
- Created PROJECT_BRAIN.md
- **Next steps:**
  1. ~~Confirm what debugging the user is actively seeing on VPS~~ → Done
  2. ~~Deploy ArbBot.sol to Arbitrum~~ → Already deployed, address confirmed
  3. Fix liquidation bot branch bug
  4. Fix log duplication

### Session: 2026-03-27 — Claude Opus 4.6 Agent
**Done:**
1. Fixed 5 critical bugs in config.ts (contract address, WS URL, Ramses factory)
2. Fixed scanner.ts (stale ABI, Algebra poolByPair, Ramses factory ABI)
3. Expanded Arbitrum watchlist: 3 → 9 pools (ARB, WBTC-USDC, GMX-USDC, DAI with Camelot)
4. Added fee tier caching — fixes VIRTUAL and any fallback-fee-discovered pools
5. Fixed liquidation bot ethers v6 auto-unwrap crash (AaveV3Adapter.js)
6. Fixed bots-manager fatal RPC_URL crash (dead code in manager.js)
7. Set up agent directory structure (brain/, skills/, workflows/, memory/)
8. Created/updated PROJECT_BRAIN.md for all 3 repos

**Pending:**
- Verify VIRTUAL quotes on Base after fee cache fix
- Monitor Arbitrum for first gap detection
- Investigate log duplication x5 bug
- Consider Ramses-specific quoter

**Next:**
- User restarts bots on VPS, verify clean logs

### Session: 2026-03-28 — Claude Opus 4.6 Agent
**Done:**
1. Diagnosed root cause of 0 trades in 29h: WebSocket subscriptions silently dead on public RPCs
2. Added 30s polling fallback — refreshes all pool prices via HTTP regardless of WS state
3. Added WS health tracking (lastWsEvent timestamp, logged every ~2.5 min)
4. WS events still trigger instant updates when alive; polling ensures coverage when dead

**Pending:**
- Verify polling generates Ratio Gap lines after VPS auto-update
- Monitor for first successful trade execution

**Next:**
- VPS auto-pulls in ≤10 min — watch for Poll #N log lines and gap detections
