import {
  CHAIN_V3_CONFIG,
  SLOT0_SQRT_PRICE_ABI,
  UNI_V3_FEE_TIERS,
  discoverV3Pool,
  priceFromSqrtPriceX96,
} from "./uniV3PoolDiscovery";
import { ethers } from "ethers";

const Q96 = BigInt(2) ** BigInt(96);

describe("priceFromSqrtPriceX96", () => {
  it("returns 1 for parity sqrtPrice and equal decimals", () => {
    expect(priceFromSqrtPriceX96(Q96, 18, 18)).toBeCloseTo(1, 12);
  });

  it("squares the sqrtPrice ratio", () => {
    expect(priceFromSqrtPriceX96(BigInt(2) * Q96, 0, 0)).toBeCloseTo(4, 12);
    expect(priceFromSqrtPriceX96(BigInt(3) * Q96, 0, 0)).toBeCloseTo(9, 12);
  });

  it("applies the (decimals0 - decimals1) adjustment", () => {
    expect(priceFromSqrtPriceX96(Q96, 18, 6)).toBeCloseTo(1e12, 0);
    expect(priceFromSqrtPriceX96(Q96, 6, 18)).toBeCloseTo(1e-12, 18);
  });

  it("returns NaN for non-positive sqrtPrice", () => {
    expect(priceFromSqrtPriceX96(BigInt(0), 18, 18)).toBeNaN();
  });

  it("recovers the WETH/USDC ratio at a realistic spot", () => {
    const rawPrice = 1e12 / 3000;
    const sqrtPriceX96 = BigInt(Math.floor(Math.sqrt(rawPrice) * Number(Q96)));
    const price = priceFromSqrtPriceX96(sqrtPriceX96, 6, 18);
    expect(price).toBeCloseTo(1 / 3000, 6);
  });
});

describe("CHAIN_V3_CONFIG", () => {
  it("uses canonical Uniswap V3 factory addresses on supported chains", () => {
    const canonicalFactory = "0x1F98431c8aD98523631AE4a59f267346ea31F984";
    for (const chain of [
      "ethereum",
      "polygon",
      "arbitrum",
      "optimism",
    ] as const) {
      expect(CHAIN_V3_CONFIG[chain]?.factory).toBe(canonicalFactory);
    }
    expect(CHAIN_V3_CONFIG.base?.factory).toBe(
      "0x33128a8fC17869897dcE68Ed026d694621f6FDfD",
    );
  });

  it("populates at least one reference token per chain", () => {
    for (const [chain, cfg] of Object.entries(CHAIN_V3_CONFIG)) {
      expect(cfg.references.length).toBeGreaterThan(0);
      cfg.references.forEach((addr) => {
        expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
        expect(addr).toBeTruthy();
        expect(chain).toBeTruthy();
      });
    }
  });

  it("includes Polygon USDT as a reference token", () => {
    expect(CHAIN_V3_CONFIG.polygon?.references).toContain(
      "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
    );
  });
});

describe("UNI_V3_FEE_TIERS", () => {
  it("matches the four canonical Uniswap V3 fee tiers", () => {
    expect([...UNI_V3_FEE_TIERS]).toEqual([100, 500, 3000, 10000]);
  });
});

describe("SLOT0_SQRT_PRICE_ABI", () => {
  const sqrtPriceX96 = BigInt("123456789012345678901234567890");

  it("decodes the first return word from canonical 7-field slot0 data", () => {
    const minimalSlot0 = new ethers.Interface([SLOT0_SQRT_PRICE_ABI]);
    const canonicalSlot0 = new ethers.Interface([
      "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint32 feeProtocol, bool unlocked)",
    ]);

    const encoded = canonicalSlot0.encodeFunctionResult("slot0", [
      sqrtPriceX96,
      -123,
      1,
      2,
      3,
      4,
      true,
    ]);

    expect(minimalSlot0.decodeFunctionResult("slot0", encoded)[0]).toBe(
      sqrtPriceX96,
    );
  });

  it("decodes the first return word from 6-field fork slot0 data", () => {
    const minimalSlot0 = new ethers.Interface([SLOT0_SQRT_PRICE_ABI]);
    const forkSlot0 = new ethers.Interface([
      "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, bool unlocked)",
    ]);

    const encoded = forkSlot0.encodeFunctionResult("slot0", [
      sqrtPriceX96,
      -123,
      1,
      2,
      3,
      true,
    ]);

    expect(minimalSlot0.decodeFunctionResult("slot0", encoded)[0]).toBe(
      sqrtPriceX96,
    );
  });
});

describe("discoverV3Pool", () => {
  const token = "0x38fd02Dc840F099772392f2DFe3A3BEE9Aab3AB7";
  const usdt = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F";
  const pool = "0xaa98E21F7504395024746A9369ca6E20d6F30d01";
  const zero = "0x0000000000000000000000000000000000000000";
  type GetPoolCall = { params: [string, string, number] };
  type FakeMultiCallParams = { abi: string; calls: GetPoolCall[] | string[] };

  it("searches Polygon's 0.01% BRTH/USDT pool and returns it when liquid", async () => {
    const api = {
      multiCall: jest.fn(async ({ abi, calls }: FakeMultiCallParams) => {
        if (String(abi).includes("getPool")) {
          return (calls as GetPoolCall[]).map((call) => {
            const [tokenArg, referenceArg, feeArg] = call.params;
            return tokenArg === token && referenceArg === usdt && feeArg === 100
              ? pool
              : zero;
          });
        }

        if (String(abi).includes("liquidity")) return ["36467137254691505"];
        throw new Error(`Unexpected ABI ${abi}`);
      }),
    };

    await expect(
      discoverV3Pool(
        api as unknown as Parameters<typeof discoverV3Pool>[0],
        "polygon",
        token,
      ),
    ).resolves.toEqual({ pool, reference: usdt, fee: 100 });
  });
});
