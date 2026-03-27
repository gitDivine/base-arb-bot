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
      WETH: addr('0x4200000000000000000000000000000000000006'),
      AERO: addr('0x940181a94A35A4569E4529A3CDfB74e38FD98631'),
      DAI: addr('0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb'),
      cbBTC: addr('0xcbB7C0000ab88b473b1f5afd9ef808440eed33Bf'),
      WELL: addr('0xdcc822276d4e6bac33bfb1bad287f2b9b9f877a6'),
      VIRTUAL: addr('0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b'),
      MOXIE: addr('0x8c9037d1ef5c6d1f6816278c7aaf5491d24cd527'),
      MAGA: addr('0xb794705e505299B7fF661B677EA9EE473254a5bf'),
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
      { tokenOut: addr('0x940181a94A35A4569E4529A3CDfB74e38FD98631'), baseToken: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), fee: 3000, name: 'AERO' },
      { tokenOut: addr('0xdcc822276d4e6bac33bfb1bad287f2b9b9f877a6'), baseToken: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), fee: 3000, name: 'WELL' },
      { tokenOut: addr('0xcbB7C0000ab88b473b1f5afd9ef808440eed33Bf'), baseToken: addr('0x4200000000000000000000000000000000000006'), fee: 500, name: 'cbBTC' },
      { tokenOut: addr('0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b'), baseToken: addr('0x4200000000000000000000000000000000000006'), fee: 3000, name: 'VIRTUAL' },
      { tokenOut: addr('0x8c9037d1ef5c6d1f6816278c7aaf5491d24cd527'), baseToken: addr('0x4200000000000000000000000000000000000006'), fee: 3000, name: 'MOXIE' },
      { tokenOut: addr('0xb794705e505299B7fF661B677EA9EE473254a5bf'), baseToken: addr('0x4200000000000000000000000000000000000006'), fee: 10000, name: 'MAGA' },
    ],
    surfaces: [
      { name: 'UniV3_Aero_USDC', dex1: 'uniswapV3', dex2: 'aerodrome', baseAsset: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') },
      { name: 'UniV3_Aero_WETH', dex1: 'uniswapV3', dex2: 'aerodrome', baseAsset: addr('0x4200000000000000000000000000000000000006') },
    ]
  },
  arbitrum: {
    name: 'Arbitrum One',
    chainId: 42161,
    rpcHttp: process.env.ARB_HTTP_URL || 'https://arb1.arbitrum.io/rpc',
    rpcWs: process.env.ARB_WS_URL || 'wss://arbitrum-one-rpc.publicnode.com',
    contractAddress: addr('0x1d1D09a9f891B3E0C62f5C1A3a6dC6DA7E4FE197'),
    tokens: {
      USDC: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'),
      WETH: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'),
      ARB: addr('0x912CE59144191C1204E64559FE8253a0e49E6548'),
      GMX: addr('0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a'),
      RDNT: addr('0x0C4681e6C0235179ec3D4F4fc4DF3d14FDD96017'),
      PENDLE: addr('0x0c888319139947844059639149183cc48b11166b'),
      DEGEN: addr('0x9f074d03bc9190170a4de336329a1a0d7f26c71c'),
      WBTC: addr('0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'),
      LINK: addr('0xf97f4df75117a78c1A5a0ADb814Af6572A704043'),
      DAI: addr('0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'),
      UNI: addr('0xFa7F8980b0f1E61820213B524858178473450946'),
      FRAX: addr('0x17FCB690CC242d99b03f05f884a4411139A8659F'),
      LDO: addr('0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60'),
      GNS: addr('0x18c11FD274C5ca9a7Ec216269FE82fEAED3D6191'),
      CRV: addr('0x11cDb42B0EB44893576E3774032a1df6A8dEf85c'),
    },
    dexes: {
      uniswapV3Router: { address: addr('0xE592427A0AEce92De3Edee1F18E0157C05861564'), dexType: 'uniswapV3' },
      uniswapV3Factory: { address: addr('0x1F98431c8aD98523631AE4a59f267346ea31F984'), dexType: 'uniswapV3' },
      uniswapV3QuoterV2: { address: addr('0x61fFE014bA17989E743c5F6cB21bF9697530B21e'), dexType: 'uniswapV3' },
      camelotV3Router: { address: addr('0x1F721E64571A24194602120BCec23E6db1426442'), dexType: 'camelotV3' },
      camelotV3Factory: { address: addr('0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B'), dexType: 'camelotV3' },
      ramsesRouter: { address: addr('0xAAA87963EFe74394b91747FA733E3917d68180E7'), dexType: 'ramses' },
      ramsesFactory: { address: addr('0xd0019e86edB35E1fedaaB03aED5c3c60f115d28b'), dexType: 'ramses' }, // Ramses V3 CL (correct factory)
    },
    aave: {
      pool: addr('0x794a61358D6845594F94dc1DB02A252b5b4814aD'),
      flashFee: 0.0005,
    },
    watchPairs: [
      { tokenOut: addr('0x0C4681e6C0235179ec3D4F4fc4DF3d14FDD96017'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 3000, name: 'RDNT' },
      { tokenOut: addr('0x0c888319139947844059639149183cc48b11166b'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 3000, name: 'PENDLE' },
      { tokenOut: addr('0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'), baseToken: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), fee: 500, name: 'WBTC' },
      { tokenOut: addr('0xf97f4df75117a78c1A5a0ADb814Af6572A704043'), baseToken: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), fee: 3000, name: 'LINK' },
      { tokenOut: addr('0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 500, name: 'DAI' },
      { tokenOut: addr('0xFa7F8980b0f1E61820213B524858178473450946'), baseToken: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), fee: 3000, name: 'UNI' },
      { tokenOut: addr('0x17FCB690CC242d99b03f05f884a4411139A8659F'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 3000, name: 'FRAX' },
      { tokenOut: addr('0x13Ad51ed4F1B7e9Dc168d8a00cB3f4dDD85EfA60'), baseToken: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), fee: 3000, name: 'LDO' },
      { tokenOut: addr('0x18c11FD274C5ca9a7Ec216269FE82fEAED3D6191'), baseToken: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), fee: 3000, name: 'GNS' },
      { tokenOut: addr('0x11cDb42B0EB44893576E3774032a1df6A8dEf85c'), baseToken: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), fee: 3000, name: 'CRV' },
      { tokenOut: addr('0x9f074d03bc9190170a4de336329a1a0d7f26c71c'), baseToken: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), fee: 3000, name: 'DEGEN' }, // Degen vs WETH
      { tokenOut: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), baseToken: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), fee: 500, name: 'USDC-WETH' }, // USDC vs WETH
    ],
    surfaces: [
      { name: 'UniV3_Camelot_USDC', dex1: 'uniswapV3', dex2: 'camelotV3', baseAsset: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831') },
      { name: 'UniV3_Ramses_USDC', dex1: 'uniswapV3', dex2: 'ramses', baseAsset: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831') },
      { name: 'UniV3_Camelot_WETH', dex1: 'uniswapV3', dex2: 'camelotV3', baseAsset: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11') },
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
    flashLoanAmountUsdc: 100, // $100 USDC
    flashLoanAmountWeth: 0.05, // ~0.05 WETH ($175)
    minProfitUsdc: 0.1,  // $0.10 net profit
    minProfitBps: 12.0,   // 12bps gap
    flashFee: 0.0005,
    cooldownMs: 1000,
    maxGasGwei: 50.0,
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
