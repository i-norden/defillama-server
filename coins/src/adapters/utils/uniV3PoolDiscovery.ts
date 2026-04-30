import type { ChainApi } from "@defillama/sdk";

export const UNI_V3_FEE_TIERS = [100, 500, 3000, 10000] as const;

export const SLOT0_SQRT_PRICE_ABI =
  "function slot0() view returns (uint160 sqrtPriceX96)";

const FACTORY_GET_POOL_ABI =
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)";

const POOL_LIQUIDITY_ABI = "function liquidity() view returns (uint128)";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const Q96 = BigInt(2) ** BigInt(96);
const ZERO = BigInt(0);

export interface ChainV3Config {
  factory: string;
  references: string[];
}

export interface DiscoveredPool {
  pool: string;
  reference: string;
  fee: (typeof UNI_V3_FEE_TIERS)[number];
}

export const CHAIN_V3_CONFIG: Record<string, ChainV3Config> = {
  ethereum: {
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    references: [
      "0xA0b86991c6218b36c1d19d4a2E9Eb0cE3606eB48", // USDC
      "0xdAC17F958D2ee523a2206206994597C13D831ec7", // USDT
      "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
      "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
    ],
  },
  polygon: {
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    references: [
      "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC
      "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e
      "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
      "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH
      "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC
    ],
  },
  arbitrum: {
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    references: [
      "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
      "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
      "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
      "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
    ],
  },
  optimism: {
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    references: [
      "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // USDC
      "0x7F5c764cBc14f9669B88837ca1490cCa17c31607", // USDC.e
      "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", // USDT
      "0x4200000000000000000000000000000000000006", // WETH
    ],
  },
  base: {
    factory: "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    references: [
      "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      "0x4200000000000000000000000000000000000006", // WETH
    ],
  },
};

export function priceFromSqrtPriceX96(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
): number {
  if (sqrtPriceX96 <= ZERO) return NaN;
  const sqrt = Number(sqrtPriceX96) / Number(Q96);
  return sqrt * sqrt * 10 ** (decimals0 - decimals1);
}

export async function discoverV3Pool(
  api: ChainApi,
  chain: string,
  token: string,
): Promise<DiscoveredPool | null> {
  const cfg = CHAIN_V3_CONFIG[chain];
  if (!cfg) return null;

  const candidates = cfg.references.flatMap((reference) =>
    UNI_V3_FEE_TIERS.map((fee) => ({ reference, fee })),
  );

  const poolAddrs: (string | null)[] = await api.multiCall({
    abi: FACTORY_GET_POOL_ABI,
    target: cfg.factory,
    calls: candidates.map((c) => ({ params: [token, c.reference, c.fee] })),
    permitFailure: true,
  });

  const live: DiscoveredPool[] = [];
  poolAddrs.forEach((addr, i) => {
    if (!addr || addr.toLowerCase() === ZERO_ADDRESS) return;
    live.push({
      pool: addr,
      reference: candidates[i].reference,
      fee: candidates[i].fee,
    });
  });

  if (live.length === 0) return null;

  const liquidities: (string | null)[] = await api.multiCall({
    abi: POOL_LIQUIDITY_ABI,
    calls: live.map((l) => l.pool),
    permitFailure: true,
  });

  let bestPool: DiscoveredPool | null = null;
  let bestLiquidity: bigint = ZERO;
  for (let i = 0; i < live.length; i++) {
    const raw = liquidities[i];
    if (raw == null) continue;
    const liquidity = BigInt(raw);
    if (liquidity === ZERO) continue;
    if (bestPool === null || liquidity > bestLiquidity) {
      bestPool = live[i];
      bestLiquidity = liquidity;
    }
  }

  return bestPool;
}
