/**
 * Layer 3 Arbitrum routing data — Morpho vaults + Aave V3 proto_arbitrum_v3.
 * Dynamic scoring across ETH / wETH / wstETH / weETH / rETH on Aave V3 and Morpho.
 * @see MORPHO_ARBITRUM_VAULTS_URL
 * @see AAVE_ARBITRUM_V3_URL
 */

import {
  ARBITRUM_COLLATERAL_TOKENS,
  buildCollateralCandidate,
  FALLBACK_BASE_YIELDS,
  selectBestCollateralCandidate,
  type ArbitrumCollateralCandidate,
  type ArbitrumCollateralToken,
  type ArbitrumProtocolId,
} from '@/lib/arbitrumCollateralScoring';
import { fetchLlamaPools, normalizeApyPercent } from '@/lib/defiLlamaAggregator';

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
export const AAVE_ARBITRUM_MARKET_LABEL = 'Aave V3 Core Market';

/** Real Morpho Arbitrum USDC vault names used when live vault feed is unavailable. */
export const FALLBACK_MORPHO_VAULT_LABEL = 'Gauntlet USDC Prime';
export const FALLBACK_MORPHO_VAULT_ALT = 'kpk USDC Yield';

/** Loan assets referenced in Morpho Arbitrum vault filter (42161). */
export const MORPHO_ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const MORPHO_ARBITRUM_USDT = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

export const ARBITRUM_WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';
export const ARBITRUM_WSTETH = '0x5979D7b546E38E414F7E9822514be443A4800529';
export const ARBITRUM_WEETH = '0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe';
export const ARBITRUM_RETH = '0xEC70Dcb4A1EFa46b8F2D97C310C9c4790ba5ffA8';
export const AAVE_ARBITRUM_USDC = MORPHO_ARBITRUM_USDC;

const TOKEN_ADDRESSES: Record<ArbitrumCollateralToken, string> = {
  ETH: ARBITRUM_WETH,
  wETH: ARBITRUM_WETH,
  wstETH: ARBITRUM_WSTETH,
  weETH: ARBITRUM_WEETH,
  rETH: ARBITRUM_RETH,
};

const PROTOCOL_META: Record<ArbitrumProtocolId, { name: string; sourceUrl: string }> = {
  aave: { name: 'Aave V3', sourceUrl: AAVE_ARBITRUM_V3_URL },
  morpho: { name: 'Morpho', sourceUrl: MORPHO_ARBITRUM_VAULTS_URL },
};

/** @deprecated use ArbitrumCollateralCandidate — kept for borrow-rate compatibility. */
export interface ArbitrumProtocolQuote {
  id: ArbitrumProtocolId;
  name: string;
  sourceUrl: string;
  collateralToken: ArbitrumCollateralToken;
  collateralAddress: string;
  loanSymbol: 'USDC';
  usdcBorrowApyPct: number;
  maxCollateralLtvPct: number;
  supplyApyPct?: number;
  baseYieldPct?: number;
  combinedScore?: number;
}

export interface ArbitrumRoutingSnapshot {
  candidates: ArbitrumCollateralCandidate[];
  winner: ArbitrumCollateralCandidate | null;
  /** Best scored candidate per protocol — legacy borrow-rate fields. */
  aave: ArbitrumProtocolQuote | null;
  morpho: ArbitrumProtocolQuote | null;
  baseYields: Record<ArbitrumCollateralToken, number>;
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
  state: { borrowApy: number; supplyApy?: number };
}

interface MorphoVaultRow {
  name: string;
  address: string;
  state: { totalAssetsUsd: number; netApy: number };
}

interface AaveReserveMetrics {
  maxLtvPct: number;
  supplyApyPct: number;
}

type MorphoMetricsByToken = Partial<Record<ArbitrumCollateralToken, {
  maxLtvPct: number;
  supplyApyPct: number;
  usdcBorrowApyPct: number;
}>>;

type AaveMetricsByToken = Partial<Record<ArbitrumCollateralToken, AaveReserveMetrics>>;

function candidateToLegacyQuote(candidate: ArbitrumCollateralCandidate): ArbitrumProtocolQuote {
  return {
    id: candidate.protocolId,
    name: candidate.protocolName,
    sourceUrl: candidate.sourceUrl,
    collateralToken: candidate.collateralToken,
    collateralAddress: candidate.collateralAddress,
    loanSymbol: 'USDC',
    usdcBorrowApyPct: candidate.usdcBorrowApyPct,
    maxCollateralLtvPct: candidate.maxLtvPct,
    supplyApyPct: candidate.supplyApyPct,
    baseYieldPct: candidate.baseYieldPct,
    combinedScore: candidate.combinedScore,
  };
}

function bestLegacyQuote(
  candidates: ArbitrumCollateralCandidate[],
  protocolId: ArbitrumProtocolId,
): ArbitrumProtocolQuote | null {
  const best = selectBestCollateralCandidate(
    candidates.filter(c => c.protocolId === protocolId),
  );
  return best ? candidateToLegacyQuote(best) : null;
}

async function fetchLstBaseYields(): Promise<Record<ArbitrumCollateralToken, number>> {
  const yields: Record<ArbitrumCollateralToken, number> = { ...FALLBACK_BASE_YIELDS };
  try {
    const pools = await fetchLlamaPools();
    const lido = normalizeApyPercent(
      pools.find(p => /lido/i.test(p.project) && /steth|wsteth/i.test(p.symbol))?.apy,
    );
    const rocket = normalizeApyPercent(
      pools.find(p => /rocket/i.test(p.project) && /reth/i.test(p.symbol))?.apy,
    );
    const etherFi = normalizeApyPercent(
      pools.find(p => /ether\.?fi/i.test(p.project) && /weeth/i.test(p.symbol))?.apy,
    );
    if (lido != null) yields.wstETH = lido;
    if (rocket != null) yields.rETH = rocket;
    if (etherFi != null) yields.weETH = etherFi;
  } catch {
    // keep fallbacks
  }
  return yields;
}

async function fetchAaveUsdcBorrowPct(): Promise<number> {
  const data = await aaveGraphql<{
    usdc: { borrowInfo: { apy: { value: string } } | null } | null;
  }>(`{
    usdc: reserve(request: {
      market: "${AAVE_ARBITRUM_POOL}",
      underlyingToken: "${AAVE_ARBITRUM_USDC}",
      chainId: ${ARBITRUM_CHAIN_ID}
    }) {
      borrowInfo { apy { value } }
    }
  }`);
  return decimalToPercent(data?.usdc?.borrowInfo?.apy?.value) ?? 0;
}

async function fetchMorphoBestUsdcVault(): Promise<string | null> {
  const data = await morphoGraphql<{
    vaults: { items: MorphoVaultRow[] };
  }>(`{
    vaults(first: 100, where: {
      chainId_in: [${ARBITRUM_CHAIN_ID}],
      assetAddress_in: ["${MORPHO_ARBITRUM_USDC}"]
    }) {
      items {
        name
        address
        state { totalAssetsUsd netApy }
      }
    }
  }`);

  const items = data?.vaults?.items ?? [];
  let best: { name: string; tvl: number; apy: number } | null = null;

  for (const vault of items) {
    const name = vault?.name?.trim();
    const tvl = vault?.state?.totalAssetsUsd ?? 0;
    const apy = vault?.state?.netApy ?? 0;
    if (!name || !Number.isFinite(tvl) || tvl < 1_000) continue;
    if (!Number.isFinite(apy) || apy >= 1) continue;
    if (!best || tvl > best.tvl || (tvl === best.tvl && apy > best.apy)) {
      best = { name, tvl, apy };
    }
  }

  return best?.name ?? null;
}

async function fetchAaveCollateralMetrics(): Promise<AaveMetricsByToken> {
  const reserveFields = ARBITRUM_COLLATERAL_TOKENS
    .filter(token => token !== 'ETH')
    .map(token => {
      const alias = token.toLowerCase();
      const address = TOKEN_ADDRESSES[token];
      return `${alias}: reserve(request: {
        market: "${AAVE_ARBITRUM_POOL}",
        underlyingToken: "${address}",
        chainId: ${ARBITRUM_CHAIN_ID}
      }) {
        supplyInfo { maxLTV { value } apy { value } }
      }`;
    })
    .join('\n');

  const data = await aaveGraphql<Record<string, {
    supplyInfo: { maxLTV: { value: string }; apy: { value: string } } | null;
  } | null>>(`{ ${reserveFields} }`);

  const metrics: AaveMetricsByToken = {};
  for (const token of ARBITRUM_COLLATERAL_TOKENS) {
    if (token === 'ETH') continue;
    const row = data?.[token.toLowerCase()];
    const maxLtvPct = ratioToLtvPercent(row?.supplyInfo?.maxLTV?.value) ?? 0;
    const supplyApyPct = decimalToPercent(row?.supplyInfo?.apy?.value) ?? 0;
    if (maxLtvPct > 0 || supplyApyPct > 0) {
      metrics[token] = { maxLtvPct, supplyApyPct };
    }
  }

  const wethMetrics = metrics.wETH;
  if (wethMetrics) metrics.ETH = { ...wethMetrics };

  return metrics;
}

async function fetchMorphoCollateralMetrics(): Promise<MorphoMetricsByToken> {
  const metrics: MorphoMetricsByToken = {};
  const uniqueAddresses = [...new Set(
    ARBITRUM_COLLATERAL_TOKENS.map(token => TOKEN_ADDRESSES[token]),
  )];

  await Promise.allSettled(
    uniqueAddresses.map(async address => {
      const data = await morphoGraphql<{
        markets: { items: MorphoMarketRow[] };
      }>(`{
        markets(first: 20, where: {
          chainId_in: [${ARBITRUM_CHAIN_ID}],
          loanAssetAddress_in: ["${MORPHO_ARBITRUM_USDC}"],
          collateralAssetAddress_in: ["${address}"]
        }) {
          items {
            collateralAsset { symbol address }
            lltv
            state { borrowApy supplyApy }
          }
        }
      }`);

      const items = data?.markets?.items ?? [];
      let best: { ltv: number; borrow: number; supply: number } | null = null;

      for (const market of items) {
        const borrowApy = decimalToPercent(market?.state?.borrowApy) ?? 0;
        const supplyApy = decimalToPercent(market?.state?.supplyApy) ?? 0;
        const ltv = lltvToPercent(market?.lltv) ?? 0;
        if (ltv <= 0) continue;
        if (!best || ltv > best.ltv || (ltv === best.ltv && borrow < best.borrow)) {
          best = { ltv, borrow: borrowApy, supply: supplyApy };
        }
      }

      if (!best) return;

      for (const token of ARBITRUM_COLLATERAL_TOKENS) {
        if (TOKEN_ADDRESSES[token].toLowerCase() !== address.toLowerCase()) continue;
        metrics[token] = {
          maxLtvPct: best.ltv,
          supplyApyPct: best.supply,
          usdcBorrowApyPct: best.borrow,
        };
      }
    }),
  );

  return metrics;
}

function buildCandidates(input: {
  baseYields: Record<ArbitrumCollateralToken, number>;
  aaveMetrics: AaveMetricsByToken;
  morphoMetrics: MorphoMetricsByToken;
  aaveUsdcBorrowPct: number;
  morphoVaultLabel: string;
}): ArbitrumCollateralCandidate[] {
  const candidates: ArbitrumCollateralCandidate[] = [];

  for (const token of ARBITRUM_COLLATERAL_TOKENS) {
    const address = TOKEN_ADDRESSES[token];
    const baseYieldPct = input.baseYields[token] ?? 0;

    const aave = input.aaveMetrics[token];
    if (aave && aave.maxLtvPct > 0) {
      candidates.push(buildCollateralCandidate({
        protocolId: 'aave',
        protocolName: PROTOCOL_META.aave.name,
        sourceUrl: PROTOCOL_META.aave.sourceUrl,
        collateralToken: token,
        collateralAddress: address,
        maxLtvPct: aave.maxLtvPct,
        supplyApyPct: aave.supplyApyPct,
        baseYieldPct,
        usdcBorrowApyPct: input.aaveUsdcBorrowPct,
        venueLabel: AAVE_ARBITRUM_MARKET_LABEL,
      }));
    }

    const morpho = input.morphoMetrics[token];
    if (morpho && morpho.maxLtvPct > 0) {
      candidates.push(buildCollateralCandidate({
        protocolId: 'morpho',
        protocolName: PROTOCOL_META.morpho.name,
        sourceUrl: PROTOCOL_META.morpho.sourceUrl,
        collateralToken: token,
        collateralAddress: address,
        maxLtvPct: morpho.maxLtvPct,
        supplyApyPct: morpho.supplyApyPct,
        baseYieldPct,
        usdcBorrowApyPct: morpho.usdcBorrowApyPct,
        venueLabel: input.morphoVaultLabel,
      }));
    }
  }

  return candidates;
}

/** Live Morpho + Aave Arbitrum collateral scoring snapshot for Layer 3 routing. */
export async function fetchArbitrumRoutingSnapshot(): Promise<ArbitrumRoutingSnapshot> {
  const [
    baseYieldsSettled,
    aaveBorrowSettled,
    aaveMetricsSettled,
    morphoMetricsSettled,
    morphoVaultSettled,
  ] = await Promise.allSettled([
    fetchLstBaseYields(),
    fetchAaveUsdcBorrowPct(),
    fetchAaveCollateralMetrics(),
    fetchMorphoCollateralMetrics(),
    fetchMorphoBestUsdcVault(),
  ]);

  const baseYields = baseYieldsSettled.status === 'fulfilled'
    ? baseYieldsSettled.value
    : { ...FALLBACK_BASE_YIELDS };
  const aaveUsdcBorrowPct = aaveBorrowSettled.status === 'fulfilled'
    ? aaveBorrowSettled.value
    : 0;
  const aaveMetrics = aaveMetricsSettled.status === 'fulfilled'
    ? aaveMetricsSettled.value
    : {};
  const morphoMetrics = morphoMetricsSettled.status === 'fulfilled'
    ? morphoMetricsSettled.value
    : {};
  const morphoVaultLabel = morphoVaultSettled.status === 'fulfilled' && morphoVaultSettled.value
    ? morphoVaultSettled.value
    : FALLBACK_MORPHO_VAULT_LABEL;

  const candidates = buildCandidates({
    baseYields,
    aaveMetrics,
    morphoMetrics,
    aaveUsdcBorrowPct,
    morphoVaultLabel,
  });
  const winner = selectBestCollateralCandidate(candidates);

  return {
    candidates,
    winner,
    aave: bestLegacyQuote(candidates, 'aave'),
    morpho: bestLegacyQuote(candidates, 'morpho'),
    baseYields,
    fetchedAt: new Date(),
  };
}

/** @deprecated use fetchArbitrumRoutingSnapshot */
export async function fetchMorphoArbitrumQuote(): Promise<ArbitrumProtocolQuote | null> {
  const snapshot = await fetchArbitrumRoutingSnapshot();
  return snapshot.morpho;
}

/** @deprecated use fetchArbitrumRoutingSnapshot */
export async function fetchAaveArbitrumQuote(): Promise<ArbitrumProtocolQuote | null> {
  const snapshot = await fetchArbitrumRoutingSnapshot();
  return snapshot.aave;
}
