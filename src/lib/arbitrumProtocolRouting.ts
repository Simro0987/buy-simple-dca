/**
 * Layer 3 Arbitrum routing data — Morpho vaults + Aave V3 proto_arbitrum_v3.
 * @see MORPHO_ARBITRUM_VAULTS_URL
 * @see AAVE_ARBITRUM_V3_URL
 */

const MORPHO_GRAPHQL = 'https://blue-api.morpho.org/graphql';
const AAVE_GRAPHQL = 'https://api.v3.aave.com/graphql';

/** Morpho vaults filtered to Arbitrum (chain 42161) — USDC/USDT loan assets from app UI. */
export const MORPHO_ARBITRUM_VAULTS_URL =
  'https://app.morpho.org/vaults?assets=10:0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85,143:0x754704Bc059F8C67012fEd69BC8A327a5aafb603,143:0x111111d2bf19e43C34263401e0CAd979eD1cdb61,143:0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a,143:0xe7cd86e13AC4309349F30B3435a9d337750fC82D,999:0xb88339CB7199b77E23DB6E890353E22632Ba630f,42161:0xaf88d065e77c8cC2239327C5EDb3A432268e5831,42161:0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9&chains=42161';

/** Aave V3 Arbitrum market (proto_arbitrum_v3). */
export const AAVE_ARBITRUM_V3_URL = 'https://app.aave.com/?marketName=proto_arbitrum_v3';

export const ARBITRUM_CHAIN_ID = 42161;
export const AAVE_ARBITRUM_MARKET_ID = 'proto_arbitrum_v3';
export const AAVE_ARBITRUM_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';

/** Loan assets referenced in Morpho Arbitrum vault filter (42161). */
export const MORPHO_ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const MORPHO_ARBITRUM_USDT = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

export const ARBITRUM_WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
export const ARBITRUM_WSTETH = '0x5979D7b546E38E414F7E9822514be443A4800529';
export const AAVE_ARBITRUM_USDC = MORPHO_ARBITRUM_USDC;

export interface ArbitrumProtocolQuote {
  id: 'aave' | 'morpho';
  name: string;
  sourceUrl: string;
  collateralToken: 'wstETH' | 'wETH';
  collateralAddress: string;
  loanSymbol: 'USDC';
  usdcBorrowApyPct: number;
  maxCollateralLtvPct: number;
}

export interface ArbitrumRoutingSnapshot {
  aave: ArbitrumProtocolQuote | null;
  morpho: ArbitrumProtocolQuote | null;
  fetchedAt: Date;
}

function decimalToPercent(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n) || n < 0) return null;
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  if (pct > 50) return null;
  return Math.round(pct * 100) / 100;
}

function ratioToLtvPercent(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n) || n <= 0) return null;
  const pct = n <= 1 ? n * 100 : n;
  if (pct > 100) return null;
  return Math.round(pct);
}

function lltvToPercent(lltv: string | number | null | undefined): number | null {
  if (lltv == null) return null;
  const raw = typeof lltv === 'string' ? parseFloat(lltv) : lltv;
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const pct = raw > 1 ? (raw / 1e18) * 100 : raw * 100;
  if (pct > 100) return null;
  return Math.round(pct);
}

async function morphoGraphql<T>(query: string): Promise<T> {
  const res = await fetch(MORPHO_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Morpho GraphQL ${res.status}`);
  const json = await res.json();
  if (json?.errors?.length) throw new Error(json.errors[0]?.message ?? 'Morpho GraphQL error');
  return json.data as T;
}

async function aaveGraphql<T>(query: string): Promise<T> {
  const res = await fetch(AAVE_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Aave GraphQL ${res.status}`);
  const json = await res.json();
  if (json?.errors?.length) throw new Error(json.errors[0]?.message ?? 'Aave GraphQL error');
  return json.data as T;
}

interface MorphoMarketRow {
  loanAsset: { symbol: string; address: string };
  collateralAsset: { symbol: string; address: string };
  lltv: string;
  state: { borrowApy: number };
}

/** Best Morpho WETH/USDC market on Arbitrum — loan asset from Morpho vault URL (native USDC). */
export async function fetchMorphoArbitrumQuote(): Promise<ArbitrumProtocolQuote | null> {
  const data = await morphoGraphql<{
    markets: { items: MorphoMarketRow[] };
  }>(`{
    markets(first: 50, where: {
      chainId_in: [${ARBITRUM_CHAIN_ID}],
      loanAssetAddress_in: ["${MORPHO_ARBITRUM_USDC}"],
      collateralAssetAddress_in: ["${ARBITRUM_WETH}"]
    }) {
      items {
        loanAsset { symbol address }
        collateralAsset { symbol address }
        lltv
        state { borrowApy }
      }
    }
  }`);

  const items = data?.markets?.items ?? [];
  let best: { apy: number; ltv: number } | null = null;

  for (const m of items) {
    const apy = decimalToPercent(m?.state?.borrowApy);
    const ltv = lltvToPercent(m?.lltv);
    if (apy == null || ltv == null) continue;
    if (!best || apy < best.apy || (apy === best.apy && ltv > best.ltv)) {
      best = { apy, ltv };
    }
  }

  if (!best) return null;

  return {
    id: 'morpho',
    name: 'Morpho',
    sourceUrl: MORPHO_ARBITRUM_VAULTS_URL,
    collateralToken: 'wETH',
    collateralAddress: ARBITRUM_WETH,
    loanSymbol: 'USDC',
    usdcBorrowApyPct: best.apy,
    maxCollateralLtvPct: best.ltv,
  };
}

/** Aave V3 proto_arbitrum_v3 — USDC borrow APY + wstETH collateral max LTV. */
export async function fetchAaveArbitrumQuote(): Promise<ArbitrumProtocolQuote | null> {
  const data = await aaveGraphql<{
    usdc: {
      underlyingToken: { symbol: string };
      borrowInfo: { apy: { value: string } } | null;
    } | null;
    wsteth: {
      underlyingToken: { symbol: string };
      supplyInfo: { maxLTV: { value: string } } | null;
    } | null;
  }>(`{
    usdc: reserve(request: {
      market: "${AAVE_ARBITRUM_POOL}",
      underlyingToken: "${AAVE_ARBITRUM_USDC}",
      chainId: ${ARBITRUM_CHAIN_ID}
    }) {
      underlyingToken { symbol }
      borrowInfo { apy { value } }
    }
    wsteth: reserve(request: {
      market: "${AAVE_ARBITRUM_POOL}",
      underlyingToken: "${ARBITRUM_WSTETH}",
      chainId: ${ARBITRUM_CHAIN_ID}
    }) {
      underlyingToken { symbol }
      supplyInfo { maxLTV { value } }
    }
  }`);

  const borrowApy = decimalToPercent(data?.usdc?.borrowInfo?.apy?.value);
  const maxLtv = ratioToLtvPercent(data?.wsteth?.supplyInfo?.maxLTV?.value);

  if (borrowApy == null || maxLtv == null) return null;

  return {
    id: 'aave',
    name: 'Aave V3',
    sourceUrl: AAVE_ARBITRUM_V3_URL,
    collateralToken: 'wstETH',
    collateralAddress: ARBITRUM_WSTETH,
    loanSymbol: 'USDC',
    usdcBorrowApyPct: borrowApy,
    maxCollateralLtvPct: maxLtv,
  };
}

/** Live Morpho vs Aave Arbitrum comparison for Layer 3 routing. */
export async function fetchArbitrumRoutingSnapshot(): Promise<ArbitrumRoutingSnapshot> {
  const [morphoSettled, aaveSettled] = await Promise.allSettled([
    fetchMorphoArbitrumQuote(),
    fetchAaveArbitrumQuote(),
  ]);

  return {
    morpho: morphoSettled.status === 'fulfilled' ? morphoSettled.value : null,
    aave: aaveSettled.status === 'fulfilled' ? aaveSettled.value : null,
    fetchedAt: new Date(),
  };
}
