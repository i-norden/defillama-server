import { ChainApi } from "@defillama/sdk";

/**
 * Pool discovery and price math for canonical Uniswap V3 deployments.
 *
 * Anything that follows the canonical Uniswap V3 factory + pool interface
 * (UniswapV3Factory.getPool / UniswapV3Pool.slot0 / UniswapV3Pool.liquidity)
 * works through this module. Forks that diverge on the factory address but
 * keep the pool interface should still work as long as a chain entry is
 * added to CHAIN_V3_CONFIG. Forks that diverge on the pool interface (e.g.
 * a non-standard slot0 layout) still need an explicit (token -> pool) entry
 * in the consuming adapter.
 */

/** Canonical Uniswap V3 fee tiers, in hundredths of a bip (1e-6). */
export const UNI_V3_FEE_TIERS = [100, 500, 3000, 10000] as const;

/**
 * Minimal ABI that decodes only the first word (sqrtPriceX96) of slot0.
 *
 * Trailing return data is silently dropped by the EVM ABI decoder, so this
 * single ABI is correct for both the standard 7-field slot0 layout and the
 * 6-field variant used by some forks (e.g. PancakeSwap V3). This obsoletes
 * the older approach of maintaining a per-pool custom ABI registry.
 */
export const SLOT0_SQRT_PRICE_ABI =
  "function slot0() view returns (uint160 sqrtPriceX96)";

const FACTORY_GET_POOL_ABI =
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)";

const POOL_LIQUIDITY_ABI = "function liquidity() view returns (uint128)";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const Q96 = BigInt(2) ** BigInt(96);
const ZERO = BigInt(0);

export interface ChainV3Config {
  /** UniswapV3Factory address on this chain. */
  factory: string;
  /**
   * Tokens whose price is reliably populated by other adapters. Discovery
   * pairs the target token against each of these (across every fee tier)
   * and selects the deepest resulting pool.
   */
  references: string[];
}

export interface DiscoveredPool {
  pool: string;
  reference: string;
  fee: (typeof UNI_V3_FEE_TIERS)[number];
}

/**
 * Per-chain configuration for canonical Uniswap V3 deployments.
 *
 * Only chains where Uniswap V3 itself is deployed belong here. Forks with
 * different factories (PancakeSwap V3 on BSC, SushiSwap V3, etc.) are not
 * canonical Uniswap V3; register explicit (token -> pool) entries in the
 * consuming adapter instead.
 */
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
      "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // USDC (native)
      "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // USDC.e (bridged)
      "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // USDT
      "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619", // WETH
      "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270", // WMATIC
    ],
  },
  arbitrum: {
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    references: [
      "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC (native)
      "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
      "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
      "0x82aF49447D8a07e3bd95BD0d56f35241523fBab1", // WETH
    ],
  },
  optimism: {
    factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    references: [
      "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // USDC (native)
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

/**
 * Convert a Uniswap V3 sqrtPriceX96 into the human-decimal price of token0
 * denominated in token1.
 *
 * Uniswap stores price as `sqrt(token1/token0) * 2^96` over raw token units.
 * Squaring and adjusting for decimals yields the price of one token0 (in
 * human units) in token1 (human units):
 *
 *     price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0 - decimals1)
 *
 * Uses the canonical Uniswap math; `Math.pow(1.0001, tick)` is a lossy
 * approximation derived from this and should not be substituted.
 */
export function priceFromSqrtPriceX96(
  sqrtPriceX96: bigint,
  decimals0: number,
  decimals1: number,
): number {
  if (sqrtPriceX96 <= ZERO) return NaN;
  const sqrt = Number(sqrtPriceX96) / Number(Q96);
  return sqrt * sqrt * 10 ** (decimals0 - decimals1);
}

/**
 * Discover a canonical Uniswap V3 pool to price `token` against on `chain`.
 *
 * Searches the cross of (chain references x fee tiers), drops candidates
 * the factory reports as unmapped or that report zero/failed liquidity,
 * and returns the survivor with the highest in-range `liquidity()`.
 *
 * NOTE on ranking: `liquidity()` is in `sqrt(reserve0 * reserve1)` units
 * over raw token amounts, so values across pools with *different* reference
 * tokens (e.g. a USDC pool vs. a WETH pool) are not directly comparable in
 * USD-equivalent depth. For tokens that have a clearly dominant pool this
 * is irrelevant; for tokens with non-trivial liquidity against multiple
 * decimal-disparate references, the ranking can choose suboptimally. Use
 * an explicit `(token -> pool)` override at the call site when that matters.
 *
 * Returns `null` when no candidate has non-zero liquidity, or when the
 * chain has no V3 config.
 */
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
