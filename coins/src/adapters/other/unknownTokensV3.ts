import type { ChainApi } from "@defillama/sdk";
import { runInPromisePool } from "@defillama/sdk/build/generalUtil";
import getWrites from "../utils/getWrites";
import { getApi } from "../utils/sdk";
import {
  CHAIN_V3_CONFIG,
  SLOT0_SQRT_PRICE_ABI,
  discoverV3Pool,
  priceFromSqrtPriceX96,
} from "../utils/uniV3PoolDiscovery";
import type { DiscoveredPool } from "../utils/uniV3PoolDiscovery";

const PROJECT_NAME = "unknownTokensV3";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const autoDiscoveredTokens: Record<string, string[]> = {
  polygon: [
    "0x38fd02Dc840F099772392f2DFe3A3BEE9Aab3AB7", // BRTH
  ],
};

const explicitPools: Record<string, Record<string, string>> = {
  blast: {
    "0x216a5a1135a9dab49fa9ad865e0f22fe22b5630a":
      "0x017f31dc55144f24836c2566ed7dc651256c338a", // PUMP
  },
  bsc: {
    "0xf6718b2701D4a6498eF77D7c152b2137Ab28b8A3":
      "0xfc18301B94a77D91015bb90D5249827c506846Ae", // stBTC
    "0xb8a1eD561C914F22BD69b0bb4558ad5A89FeAAE1":
      "0xc089253e8e28ef1213d7158b0add26e014175339", // ART
  },
  map: {
    "0x756af1d3810a01d3292fad62f295bbcc6c200aea":
      "0xc6a16fac07c059689873988fa4c635d45ca170e2", // LSGS
  },
  mantle: {
    "0x029d924928888697d3F3d169018d9d98d9f0d6B4":
      "0x417ed45c1adf3a3eb21fba7a40a4e2e4c3405050", // Muito
  },
  ethereum: {
    "0xf1B99e3E573A1a9C5E6B2Ce818b617F0E664E86B":
      "0x82c427AdFDf2d245Ec51D8046b41c4ee87F0d29C", // oSQTH
    "0xBEF26Bd568e421D6708CCA55Ad6e35f8bfA0C406":
      "0x26FA8b07DcE29Fb1F0fb3C889E01b59dEbADeFdA", // BCUT
    "0x0bB9aB78aAF7179b7515e6753d89822b91e670C4":
      "0xF77C8cE2b0944505Ee8AFf5E5Bd0f39C10F35C5c", // kUSD
    "0xf02C96DbbB92DC0325AD52B3f9F2b951f972bf00":
      "0xeAb1724Bae42bDAA74cB2269f22db0A763E79969", // krETH
    "0x513D27c94C0D81eeD9DC2a88b4531a69993187cF":
      "0xd992d160d0617CfBA73a2D2AbF098dF4F630Ed37", // ksETH
    "0x8dd09822e83313adca54c75696ae80c5429697ff":
      "0x1A8E1Fb29479c73B215045C5Ea8367257ee16E43", // SIFU
    "0x97Ad75064b20fb2B2447feD4fa953bF7F007a706":
      "0x6dcba3657EE750A51A13A235B4Ed081317dA3066", // BERASTONE
    "0x437cc33344a0B27A429f795ff6B469C72698B291":
      "0x970A7749EcAA4394C8B2Bf5F2471F41FD6b79288", // wM
    "0x1DB1591540d7A6062Be0837ca3C808aDd28844F6":
      "0xD80e75fAf4cc02F6447287D5b1EF195EAc19FfD9", // hOHM
    "0xec3502a9f98f151af52ee6cb423a0afe7bbf5a19":
      "0x2a943E0432b22a3C3cD65B8c9045259B791f96B8", // HAUST
    "0x5f0e628b693018f639d10e4a4f59bd4d8b2b6b44":
      "0xC5c134A1f112efA96003f8559Dba6fAC0BA77692", // WHITE
    "0x63d74d22E689C715a04F2C13962b1f77F443d35b":
      "0x206239406AbcCf730493e4b133b30df546F9Ff43", // DUSD
  },
  kroma: {
    "0x61e0D34b5206Fa8005EC1De8000df9B9dDee23Db":
      "0x62330719f844dB255EF135f977176D72497dc881", // spETH
  },
  bsquared: {
    "0x796e4d53067ff374b89b2ac101ce0c1f72ccaac2":
      "0xdc4224cea3afdddbfc6aa23ffeaa1c50a59a6493", // uBTC
  },
  arbitrum: {
    "0xba3e932310cd1dbf5bd13079bd3d6bae4570886f":
      "0x695F5B9Bc0b5A41fb4eB0B1fB5DFA0F6d389A079", // yBTC
  },
  imx: {
    "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a":
      "0x42514fa59DD4689573D35119CF9E0bda218e15ee", // aUSD
  },
  scroll: {
    "0xdb9E8F82D6d45fFf803161F2a5f75543972B229a":
      "0xb17ccD860337209e2665afD5E7eAE9c0e5716b48", // USDQ
  },
  base: {
    "0xf7178122A087eF8F5c7BeA362b7DaBE38F20Bf05":
      "0x2019DEB4E18107A2FD8B4acBC7e3878037336fc2", // OMNI
    "0xe66E3A37C3274Ac24FE8590f7D84A2427194DC17":
      "0x9d228792a392838be03293ba93f406f3e8077b8d", // stkWELL
  },
  hyperliquid: {
    "0x876e7F2f30935118a654fc0E1f807aFc49EFe500":
      "0xe9c02ca07931f9670fa87217372b3c9aa5a8a934", // PUP
    "0x067b0C72aa4C6Bd3BFEFfF443c536DCd6a25a9C8":
      "0x006418DcD73f6Da03A667ad161cCB9B39CeEEa60", // HYBR
  },
  etlk: {
    "0x93f5475da60143c50e8be3fed10c143b0cf8b9e9":
      "0x86d2f4ef99915652bfc3adf29683752334582b4d", // VNXAU
    "0x6Ce393fF9Ed5465CC4DEf456B8401e03cEF64d5e":
      "0x35C888a9afc0866Fec5bBAdEf790e5EC1d845653", // RARE
  },
};

interface ResolvedPool {
  token: string;
  pool: string;
}

async function resolvePools(
  api: ChainApi,
  chain: string,
): Promise<ResolvedPool[]> {
  const resolved: ResolvedPool[] = [];
  const claimed = new Set<string>();

  for (const [token, pool] of Object.entries(explicitPools[chain] ?? {})) {
    const tokenLc = token.toLowerCase();
    resolved.push({ token: tokenLc, pool });
    claimed.add(tokenLc);
  }

  const toDiscover = (autoDiscoveredTokens[chain] ?? []).filter(
    (t) => !claimed.has(t.toLowerCase()),
  );
  if (toDiscover.length === 0 || !CHAIN_V3_CONFIG[chain]) return resolved;

  const discoveries: (DiscoveredPool | null)[] = await runInPromisePool({
    items: toDiscover,
    concurrency: 5,
    processor: (token: string) => discoverV3Pool(api, chain, token),
  });

  discoveries.forEach((d, i) => {
    if (!d) return;
    resolved.push({ token: toDiscover[i].toLowerCase(), pool: d.pool });
  });

  return resolved;
}

interface PriceEntry {
  underlying: string;
  price: number;
}

async function getChainPrices(chain: string, timestamp: number) {
  const api = await getApi(chain, timestamp);
  const resolved = await resolvePools(api, chain);
  if (resolved.length === 0) return [];

  const pools = resolved.map((r) => r.pool);
  const [token0s, token1s, slot0s] = await Promise.all([
    api.multiCall({ abi: "address:token0", calls: pools, permitFailure: true }),
    api.multiCall({ abi: "address:token1", calls: pools, permitFailure: true }),
    api.multiCall({
      abi: SLOT0_SQRT_PRICE_ABI,
      calls: pools,
      permitFailure: true,
    }),
  ]);

  const decimals = await api.multiCall({
    abi: "erc20:decimals",
    calls: [...token0s, ...token1s].map((token) => token ?? ZERO_ADDRESS),
    permitFailure: true,
  });
  const decimals0 = decimals.slice(0, token0s.length);
  const decimals1 = decimals.slice(token0s.length);

  const pricesObject: Record<string, PriceEntry> = {};
  resolved.forEach((r, i) => {
    const sqrtRaw = slot0s[i];
    const t0 = token0s[i];
    const t1 = token1s[i];
    const d0 = decimals0[i];
    const d1 = decimals1[i];
    if (!sqrtRaw || !t0 || !t1 || d0 == null || d1 == null) return;

    const sqrtPriceX96 = BigInt(sqrtRaw);
    if (sqrtPriceX96 === BigInt(0)) return;

    const decimals0Num = Number(d0);
    const decimals1Num = Number(d1);
    if (
      !Number.isFinite(decimals0Num) ||
      !Number.isFinite(decimals1Num) ||
      decimals0Num < 0 ||
      decimals1Num < 0
    )
      return;

    const token0Lc = String(t0).toLowerCase();
    const token1Lc = String(t1).toLowerCase();
    const isToken0 = r.token === token0Lc;
    if (!isToken0 && r.token !== token1Lc) return;

    const token0PerToken1 = priceFromSqrtPriceX96(
      sqrtPriceX96,
      decimals0Num,
      decimals1Num,
    );
    const price = isToken0 ? token0PerToken1 : 1 / token0PerToken1;
    if (!Number.isFinite(price) || price <= 0) return;

    pricesObject[r.token] = {
      underlying: isToken0 ? token1Lc : token0Lc,
      price,
    };
  });

  return getWrites({
    chain,
    timestamp,
    pricesObject,
    projectName: PROJECT_NAME,
  });
}

export function unknownTokensV3(timestamp: number = 0) {
  const chains = new Set<string>([
    ...Object.keys(explicitPools),
    ...Object.keys(autoDiscoveredTokens),
  ]);
  return Promise.all(
    [...chains].map((chain) => getChainPrices(chain, timestamp)),
  );
}
