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
      uniswapV3QuoterV2: { address: addr('0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a'), dexType: 'uniswapV3' },
      aerodromeRouter: { address: addr('0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43'), dexType: 'aerodrome' },
      aerodromeFactory: { address: addr('0x420DD381b31aEf6683db6B902084cB0FFECe40Da'), dexType: 'aerodrome' },
      // Aerodrome Slipstream (Concentrated Liquidity 1bps/5bps V3 pools)
      slipstreamRouter: { address: addr('0xBE6D8f0d05cC4be24d5167a3eF062215bE6D18a5'), dexType: 'uniswapV3' },
      slipstreamFactory: { address: addr('0x5e7BB104d84c7CB9B682AaC2F3d509f5F406809A'), dexType: 'uniswapV3' },
      // Intra-DEX virtual DEXes — same router/factory, fee-locked
      uniV3_100Router: { address: addr('0x2626664c2603336E57B271c5C0b26F421741e481'), dexType: 'uniswapV3' },
      uniV3_100Factory: { address: addr('0x33128a8fC17869897dcE68Ed026d694621f6FDfD'), dexType: 'uniswapV3' },
      uniV3_500Router: { address: addr('0x2626664c2603336E57B271c5C0b26F421741e481'), dexType: 'uniswapV3' },
      uniV3_500Factory: { address: addr('0x33128a8fC17869897dcE68Ed026d694621f6FDfD'), dexType: 'uniswapV3' },
      uniV3_3000Router: { address: addr('0x2626664c2603336E57B271c5C0b26F421741e481'), dexType: 'uniswapV3' },
      uniV3_3000Factory: { address: addr('0x33128a8fC17869897dcE68Ed026d694621f6FDfD'), dexType: 'uniswapV3' },
      uniV3_10000Router: { address: addr('0x2626664c2603336E57B271c5C0b26F421741e481'), dexType: 'uniswapV3' },
      uniV3_10000Factory: { address: addr('0x33128a8fC17869897dcE68Ed026d694621f6FDfD'), dexType: 'uniswapV3' },
    },
    aave: {
      pool: addr('0xA238Dd80C259a72e81d7e4664a9801593F98d1c5'),
      flashFee: 0.0005,
    },
    watchPairs: [
      // --- Low Fee Tier & High Volume Majors (1bps & 5bps pools — 10-15bps total friction) ---
      { tokenOut: addr('0x4200000000000000000000000000000000000006'), baseToken: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), fee: 500,  name: 'WETH-USDC-5bps' }, // 5bps UniV3 WETH/USDC ($50M+ TVL)
      { tokenOut: addr('0x4200000000000000000000000000000000000006'), baseToken: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), fee: 100,  name: 'WETH-USDC-1bps' }, // 1bps UniV3 WETH/USDC
      { tokenOut: addr('0xcbB7C0000ab88b473b1f5afd9ef808440eed33Bf'), baseToken: addr('0x4200000000000000000000000000000000000006'), fee: 500,  name: 'cbBTC-5bps'     }, // 5bps cbBTC/WETH
      { tokenOut: addr('0x940181a94A35A4569E4529A3CDfB74e38FD98631'), baseToken: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), fee: 500,  name: 'AERO-5bps'      }, // 5bps AERO/USDC
      { tokenOut: addr('0x940181a94A35A4569E4529A3CDfB74e38FD98631'), baseToken: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), fee: 3000, name: 'AERO'           },
      { tokenOut: addr('0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b'), baseToken: addr('0x4200000000000000000000000000000000000006'), fee: 500,  name: 'VIRTUAL-5bps'   }, // 5bps VIRTUAL/WETH
      { tokenOut: addr('0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b'), baseToken: addr('0x4200000000000000000000000000000000000006'), fee: 3000, name: 'VIRTUAL'        },
      // --- Volatile Liquid Mid-Caps (>$500k TVL) ---
      { tokenOut: addr('0x532f27101965dd16442E59d40670FaF5ebb142E4'), baseToken: addr('0x4200000000000000000000000000000000000006'), fee: 3000, name: 'BRETT'          }, // BRETT/WETH ($1M+ TVL)
      { tokenOut: addr('0x8c9037d1ef5c6d1f6816278c7aaf5491d24cd527'), baseToken: addr('0x4200000000000000000000000000000000000006'), fee: 3000, name: 'MOXIE'          },
      { tokenOut: addr('0xdcc822276d4e6bac33bfb1bad287f2b9b9f877a6'), baseToken: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'), fee: 3000, name: 'WELL'           },
    ],
    surfaces: [
      // Cross-DEX surfaces
      { name: 'UniV3_Aero_USDC', dex1: 'uniswapV3', dex2: 'aerodrome', baseAsset: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') },
      { name: 'UniV3_Aero_WETH', dex1: 'uniswapV3', dex2: 'aerodrome', baseAsset: addr('0x4200000000000000000000000000000000000006') },
      { name: 'UniV3_Slipstream_USDC', dex1: 'uniswapV3', dex2: 'slipstream', baseAsset: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') },
      { name: 'UniV3_Slipstream_WETH', dex1: 'uniswapV3', dex2: 'slipstream', baseAsset: addr('0x4200000000000000000000000000000000000006') },
      // Intra-DEX surfaces — fee tier arbs (1bps vs 5bps vs 30bps)
      { name: 'IntraDex_100v500_WETH',  dex1: 'uniV3_100', dex2: 'uniV3_500',  baseAsset: addr('0x4200000000000000000000000000000000000006') },
      { name: 'IntraDex_100v500_USDC',  dex1: 'uniV3_100', dex2: 'uniV3_500',  baseAsset: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') },
      { name: 'IntraDex_500v3000_USDC', dex1: 'uniV3_500', dex2: 'uniV3_3000', baseAsset: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') },
      { name: 'IntraDex_500v3000_WETH', dex1: 'uniV3_500', dex2: 'uniV3_3000', baseAsset: addr('0x4200000000000000000000000000000000000006') },
      { name: 'IntraDex_500v10000_WETH', dex1: 'uniV3_500', dex2: 'uniV3_10000', baseAsset: addr('0x4200000000000000000000000000000000000006') },
      { name: 'IntraDex_3000v10000_WETH', dex1: 'uniV3_3000', dex2: 'uniV3_10000', baseAsset: addr('0x4200000000000000000000000000000000000006') },
    ],
    oracleFeeds: [
      { asset: 'ETH',  feedAddress: '0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70', deviationThreshold: 0.15, heartbeatSeconds: 1200, tokenAddress: addr('0x4200000000000000000000000000000000000006') },
      { asset: 'BTC',  feedAddress: '0xCCADC697c55bbB68dc5bCdf8d3CBe83CdD4E071E', deviationThreshold: 0.15, heartbeatSeconds: 1200, tokenAddress: addr('0xcbB7C0000ab88b473b1f5afd9ef808440eed33Bf') },
      { asset: 'USDC', feedAddress: '0x7e860098F58bBFC8648a4311b374B1D669a2bc6B', deviationThreshold: 0.10, heartbeatSeconds: 86400, tokenAddress: addr('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') },
    ],
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
      GRAIL: addr('0x3d9907F9a368AD0a51Be60f7Da3b97cf940982D8'),
    },
    dexes: {
      uniswapV3Router: { address: addr('0xE592427A0AEce92De3Edee1F18E0157C05861564'), dexType: 'uniswapV3' },
      uniswapV3Factory: { address: addr('0x1F98431c8aD98523631AE4a59f267346ea31F984'), dexType: 'uniswapV3' },
      uniswapV3QuoterV2: { address: addr('0x61fFE014bA17989E743c5F6cB21bF9697530B21e'), dexType: 'uniswapV3' },
      camelotV3Router: { address: addr('0x1F721E64571A24194602120BCec23E6db1426442'), dexType: 'camelotV3' },
      camelotV3Factory: { address: addr('0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B'), dexType: 'camelotV3' },
      camelotV3Quoter: { address: addr('0x0Fc73040b26E9bC8514fA028D998E73A254Fa76E'), dexType: 'camelotV3' },
      ramsesRouter: { address: addr('0xAAA87963EFe74394b91747FA733E3917d68180E7'), dexType: 'ramses' },
      ramsesFactory: { address: addr('0xd0019e86edB35E1fedaaB03aED5c3c60f115d28b'), dexType: 'ramses' }, // Ramses V3 CL (correct factory)
      ramsesQuoter: { address: addr('0x403Bf94fe505cA0F0b1563C350B57dCeC8303ECd'), dexType: 'ramses' },
      // Intra-DEX virtual DEXes — same UniV3 router/factory, fee-locked
      uniV3_100Router: { address: addr('0xE592427A0AEce92De3Edee1F18E0157C05861564'), dexType: 'uniswapV3' },
      uniV3_100Factory: { address: addr('0x1F98431c8aD98523631AE4a59f267346ea31F984'), dexType: 'uniswapV3' },
      uniV3_500Router: { address: addr('0xE592427A0AEce92De3Edee1F18E0157C05861564'), dexType: 'uniswapV3' },
      uniV3_500Factory: { address: addr('0x1F98431c8aD98523631AE4a59f267346ea31F984'), dexType: 'uniswapV3' },
      uniV3_3000Router: { address: addr('0xE592427A0AEce92De3Edee1F18E0157C05861564'), dexType: 'uniswapV3' },
      uniV3_3000Factory: { address: addr('0x1F98431c8aD98523631AE4a59f267346ea31F984'), dexType: 'uniswapV3' },
      uniV3_10000Router: { address: addr('0xE592427A0AEce92De3Edee1F18E0157C05861564'), dexType: 'uniswapV3' },
      uniV3_10000Factory: { address: addr('0x1F98431c8aD98523631AE4a59f267346ea31F984'), dexType: 'uniswapV3' },
    },
    aave: {
      pool: addr('0x794a61358D6845594F94dc1DB02A252b5b4814aD'),
      flashFee: 0.0005,
    },
    watchPairs: [
      // --- Low Fee Tier & High Volume Majors (1bps & 5bps pools — 10-15bps total friction) ---
      { tokenOut: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 500,  name: 'WETH-USDC-5bps' }, // 5bps UniV3 WETH/USDC ($100M+ TVL)
      { tokenOut: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 100,  name: 'WETH-USDC-1bps' }, // 1bps UniV3 WETH/USDC
      // { tokenOut: addr('0x912CE59144191C1204E64559FE8253a0e49E6548'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 500,  name: 'ARB-5bps'       }, // Broken/dust pool causing massive slippage on Camelot/Ramses
      // { tokenOut: addr('0x912CE59144191C1204E64559FE8253a0e49E6548'), baseToken: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), fee: 500,  name: 'ARB-WETH-5bps'  },
      { tokenOut: addr('0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 500,  name: 'WBTC-USDC'      }, // WBTC/USDC 5bps
      { tokenOut: addr('0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f'), baseToken: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), fee: 500,  name: 'WBTC'           }, // WBTC/WETH 5bps
      { tokenOut: addr('0x0c888319139947844059639149183cc48b11166b'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 500,  name: 'PENDLE-5bps'    }, // PENDLE 5bps
      // --- Volatile Liquid Native & Mid-Cap Tokens (>$500k TVL) ---
      { tokenOut: addr('0x0c888319139947844059639149183cc48b11166b'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 3000, name: 'PENDLE'        },
      { tokenOut: addr('0x3d9907F9a368AD0a51Be60f7Da3b97cf940982D8'), baseToken: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11'), fee: 3000, name: 'GRAIL'         }, // GRAIL/WETH ($1M+ TVL)
      { tokenOut: addr('0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 3000, name: 'GMX-USDC'       },
      { tokenOut: addr('0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1'), baseToken: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831'), fee: 500,  name: 'DAI'            },
    ],
    surfaces: [
      // Cross-DEX surfaces
      { name: 'UniV3_Camelot_USDC', dex1: 'uniswapV3', dex2: 'camelotV3', baseAsset: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831') },
      { name: 'UniV3_Camelot_WETH', dex1: 'uniswapV3', dex2: 'camelotV3', baseAsset: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11') },
      { name: 'UniV3_Ramses_USDC',  dex1: 'uniswapV3', dex2: 'ramses',    baseAsset: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831') },
      { name: 'UniV3_Ramses_WETH',  dex1: 'uniswapV3', dex2: 'ramses',    baseAsset: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11') },
      // Intra-DEX surfaces — fee tier arbs (1bps vs 5bps vs 30bps)
      { name: 'IntraDex_100v500_WETH',  dex1: 'uniV3_100', dex2: 'uniV3_500',  baseAsset: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11') },
      { name: 'IntraDex_100v500_USDC',  dex1: 'uniV3_100', dex2: 'uniV3_500',  baseAsset: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831') },
      { name: 'IntraDex_500v3000_USDC', dex1: 'uniV3_500', dex2: 'uniV3_3000', baseAsset: addr('0xaf88d065e77c8cC2239327C5EDb3A432268e5831') },
      { name: 'IntraDex_500v3000_WETH', dex1: 'uniV3_500', dex2: 'uniV3_3000', baseAsset: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11') },
      { name: 'IntraDex_500v10000_WETH', dex1: 'uniV3_500', dex2: 'uniV3_10000', baseAsset: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11') },
    ],
    oracleFeeds: [
      { asset: 'ETH',  feedAddress: '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612', deviationThreshold: 0.15, heartbeatSeconds: 3600, tokenAddress: addr('0x82aF49447D8a07e3bd95BD0d56f352415231aA11') },
      { asset: 'BTC',  feedAddress: '0x6ce185860a4963106506C203335A2910413708e9', deviationThreshold: 0.15, heartbeatSeconds: 3600, tokenAddress: addr('0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f') },
      { asset: 'ARB',  feedAddress: '0xb2A824043730FE05F3DA2efaFa1CBbe83fa548D6', deviationThreshold: 0.50, heartbeatSeconds: 86400, tokenAddress: addr('0x912CE59144191C1204E64559FE8253a0e49E6548') },
      { asset: 'GMX',  feedAddress: '0xDB98056FecFff59D032aB628337A4887110df3dB', deviationThreshold: 0.50, heartbeatSeconds: 86400, tokenAddress: addr('0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a') },
      { asset: 'LINK', feedAddress: '0x86E53CF1B870786351Da77A57575e79CB55812CB', deviationThreshold: 0.50, heartbeatSeconds: 3600, tokenAddress: addr('0xf97f4df75117a78c1A5a0ADb814Af6572A704043') },
    ],
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
    flashLoanAmountUsdc: 1000, // $1,000 USDC — 10x more profit per gap
    flashLoanAmountWeth: 0.5,  // ~0.5 WETH ($1,750) — 10x more profit per gap
    minProfitUsdc: 0.01, // $0.01 net profit — any real profit after all costs
    minProfitBps: 2.0,   // 2bps gap — lower threshold for low-gas L2 execution (Base/Arbitrum)
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
    minDailyVolumeUsd: 10000,   // $10k min daily volume — thin pools generate phantom gaps
    maxDailyVolumeUsd: 50000000,
    minLiquidityUsd: 5000,      // $5k min liquidity — need depth to absorb $100-$1000 flash without massive slippage
    refreshIntervalMs: 600000,
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
  },
  oracle: {
    feeds: ACTIVE_CONFIG.oracleFeeds || [],
    pollIntervalMs: 15000,  // 15s — faster than regular pool polling
    alertPollIntervalMs: 5000, // 5s — during high-alert (prediction active)
  },
  dryRun: process.env.DRY_RUN === 'true',
};
