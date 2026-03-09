// config.ts — Base Mainnet (edited from Solana)
export const CONFIG = {
  chain: {
    name: 'Base Mainnet',
    chainId: 8453,
    rpcHttp: process.env.BASE_HTTP_URL || '',
    rpcWs:   process.env.BASE_WS_URL   || '',
  },
  wallet: {
    privateKey:      process.env.PRIVATE_KEY      || '',
    contractAddress: process.env.CONTRACT_ADDRESS || '',
  },
  tokens: {
    USDC:  '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    WETH:  '0x4200000000000000000000000000000000000006',
    cbETH: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
    cbBTC: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    DAI:   '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    AERO:  '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    BRETT: '0x532f27101965dd16442E59d40670FaF5eBB142E4',
  },
  dexes: {
    uniswapV3Router:  '0x2626664c2603336E57B271c5C0b26F421741e481',
    uniswapV3Factory: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    uniswapV3Quoter:  '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    aerodromeRouter:  '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    aerodromeFactory: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
  },
  aave: {
    pool:     '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    flashFee:  0.0005,
  },
  arb: {
    minProfitBps:    25,       // CHANGED from 65 — Base fees far lower
    minProfitUsdc:   2,
    flashLoanAmount: 50000,    // $50k USDC flash loan — zero capital needed
    slippageBps:     15,
    maxGasGwei:      10,
    cooldownMs:      2000,
  },
  scanner: {
    uniFeeTiers: [100, 500, 3000, 10000] as const,
    watchPairs: [
      { tokenOut: '0x4200000000000000000000000000000000000006', fee: 500,  name: 'WETH'  },
      { tokenOut: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', fee: 500,  name: 'cbETH' },
      { tokenOut: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf', fee: 500,  name: 'cbBTC' },
      { tokenOut: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', fee: 100,  name: 'DAI'   },
      { tokenOut: '0x940181a94A35A4569E4529A3CDfB74e38FD98631', fee: 3000, name: 'AERO'  },
      { tokenOut: '0x532f27101965dd16442E59d40670FaF5eBB142E4', fee: 3000, name: 'BRETT' },
    ],
    wsReconnectMs: 30000,
  },
  discovery: {
    dexScreenerUrl:    'https://api.dexscreener.com/latest/dex/tokens/',
    minDailyVolumeUsd:  50000,
    maxDailyVolumeUsd: 5000000,
    minLiquidityUsd:   10000,
    refreshIntervalMs: 600000,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId:   process.env.TELEGRAM_CHAT_ID   || '',
  },
  dryRun: process.env.DRY_RUN === 'true',
};
