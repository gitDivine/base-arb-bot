import { ethers } from 'ethers';

const CHAIN_ID = (process.env.CHAIN || 'base').toLowerCase().trim();
const addr = (a: string) => a ? ethers.getAddress(a.toLowerCase()) : ethers.ZeroAddress;

const CONFIG_BY_CHAIN: any = {
  base: {
    name: 'Base Mainnet',
    chainId: 8453,
    rpcHttp: process.env.BASE_HTTP_URL || 'https://mainnet.base.org',
    rpcWs: process.env.BASE_WS_URL || 'wss://base.publicnode.com',
    contractAddress: addr('0xbbFc8Bf808A0D1b964048B87c0787e03c97Cc341'),
    tokens: {
      USDC: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'),
      AERO: addr('0x940181a94A35A4569E4529A3CDfB74e38FD98631'),
      DAI: addr('0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'),
      WELL: addr('0xA88594D404727625A9437C3f886C7643872296AE'),
    },
    dexes: {
      uniswapV3Router: { address: addr('0x2626664c2603336E57B271c5C0b26F421741e481'), dexType: 'uniswapV3' },
      uniswapV3Factory: { address: addr('0x33128a8fC17869897dcE68Ed026d694621f6FDfD'), dexType: 'uniswapV3' },
      uniswapV3QuoterV2: { address: addr('0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997'), dexType: 'uniswapV3' },
      aerodromeRouter: { address: addr('0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43'), dexType: 'aerodrome' },
      aerodromeFactory: { address: addr('0x420DD381b31aEf6683db6B902084cB0FFECe40Da'), dexType: 'aerodrome' },
    },
    aave: {
      pool: addr('0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'),
      flashFee: 0.0005,
    },
    watchPairs: [
      { tokenOut: addr('0x940181a94A35A4569E4529A3CDfB74e38FD98631'), fee: 3000, name: 'AERO' },
      { tokenOut: addr('0xA88594D404727625A9437C3f886C7643872296AE'), fee: 3000, name: 'WELL' },
    ],
    surfaces: [
      { name: 'UniV3_Aero', dex1: 'uniswapV3', dex2: 'aerodrome' },
    ]
  },
  arbitrum: {
    name: 'Arbitrum One',
    chainId: 42161,
    rpcHttp: process.env.ARB_HTTP_URL || 'https://arb1.arbitrum.io/rpc',
    rpcWs: process.env.ARB_WS_URL || 'https://arbitrum-one-rpc.publicnode.com', 
    contractAddress: '', 
    tokens: {
      USDC: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'),
      ARB: addr('0x912CE59144191C1204E64559FE8253a0e49E6548'),
      GMX: addr('0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a'),
      RDNT: addr('0x0C4681e6C0235179ec3D4F4fc4DF3d14FDD96017'),
    },
    dexes: {
      uniswapV3Router: { address: addr('0xE592427A0AEce92De3Edee1F18E0157C05861564'), dexType: 'uniswapV3' },
      uniswapV3Factory: { address: addr('0x1F98431c8aD98523631AE4a59f267346ea31F984'), dexType: 'uniswapV3' },
      uniswapV3QuoterV2: { address: addr('0x61fFE014bA17989E743c5F6cB21bF9697530B21e'), dexType: 'uniswapV3' },
      camelotV3Router: { address: addr('0x1F721E64571A24194602120BCec23E6db1426442'), dexType: 'camelotV3' },
      camelotV3Factory: { address: addr('0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B'), dexType: 'camelotV3' },
      ramsesRouter: { address: addr('0xAAA87963EFe74394b91747FA733E3917d68180E7'), dexType: 'ramses' },
      ramsesFactory: { address: addr('0x07E60782535752be279929e2DFfDd136Db2e6b45'), dexType: 'ramses' }, // Ramses V3 (CL)
    },
    aave: {
      pool: addr('0x794a61358D6845594F94dc1DB02A252b5b4814aD'),
      flashFee: 0.0005,
    },
    watchPairs: [
      { tokenOut: addr('0x912CE59144191C1204E64559FE8253a0e49E6548'), fee: 3000, name: 'ARB' },
      { tokenOut: addr('0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a'), fee: 3000, name: 'GMX' },
    ],
    surfaces: [
      { name: 'UniV3_Camelot', dex1: 'uniswapV3', dex2: 'camelotV3' },
      { name: 'UniV3_Ramses', dex1: 'uniswapV3', dex2: 'ramses' },
    ]
  }
};

const ACTIVE_CONFIG = CONFIG_BY_CHAIN[CHAIN_ID] || CONFIG_BY_CHAIN.base;

export const CONFIG = {
  chain: {
    name: ACTIVE_CONFIG.name,
    chainId: ACTIVE_CONFIG.chainId,
    rpcHttp: ACTIVE_CONFIG.rpcHttp,
    rpcWs: ACTIVE_CONFIG.rpcWs,
  },
  wallet: {
    privateKey: process.env.PRIVATE_KEY || '',
    contractAddress: addr(process.env.CONTRACT_ADDRESS || ACTIVE_CONFIG.contractAddress),
  },
  tokens: ACTIVE_CONFIG.tokens,
  dexes: ACTIVE_CONFIG.dexes,
  aave: ACTIVE_CONFIG.aave,
  arb: {
    flashLoanAmount: 100, // $100 USDC
    minProfitUsdc: 0.1,  // $0.10 net profit
    minProfitBps: 12.0,   // 12bps gap
    flashFee: 0.0005,
  },
  scanner: {
    uniFeeTiers: [100, 500, 3000, 10000] as const,
    watchPairs: ACTIVE_CONFIG.watchPairs,
    surfaces: ACTIVE_CONFIG.surfaces,
    wsReconnectMs: 30000,
  },
  discovery: {
    dexScreenerUrl: 'https://api.dexscreener.com/latest/dex/tokens/',
    minDailyVolumeUsd: 1000,
    maxDailyVolumeUsd: 5000000,
    minLiquidityUsd: 1000,
    refreshIntervalMs: 600000,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  dryRun: process.env.DRY_RUN === 'true',
};
