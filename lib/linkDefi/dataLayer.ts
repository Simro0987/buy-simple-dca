import {
  COINGECKO_LINK_PRICE_URL,
  DEFILLAMA_POOLS_URL,
  FALLBACK_LINK_USD,
  FALLBACK_MORPHO_APY,
  FETCH_TIMEOUT_MS,
} from "@/lib/linkDefi/constants";

export interface DefiLlamaPool {
  symbol?: string;
  project?: string;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  tvlUsd?: number;
  chain?: string;
  ilRisk?: string;
  exposure?: string;
}

export interface MorphoSupplyData {
  apyPct: number;
  baseApyPct: number;
  rewardApyPct: number;
  tvlUsd?: number;
  source: "live" | "fallback";
}

export interface LinkPriceData {
  usd: number;
  source: "live" | "fallback";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function poolApy(pool: DefiLlamaPool): number {
  if (typeof pool.apy === "number" && pool.apy >= 0) return pool.apy;
  return (pool.apyBase ?? 0) + (pool.apyReward ?? 0);
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } finally {
    clearTimeout(timer);
  }
}

function pickMorphoLinkPool(pools: DefiLlamaPool[]): DefiLlamaPool | null {
  const eligible = pools.filter((p) => {
    const project = (p.project ?? "").toLowerCase();
    const symbol = (p.symbol ?? "").toUpperCase();
    const chain = (p.chain ?? "").toLowerCase();
    if (!project.includes("morpho")) return false;
    if (symbol !== "LINK") return false;
    if (chain !== "arbitrum") return false;
    if (p.ilRisk != null && p.ilRisk !== "no") return false;
    return (p.tvlUsd ?? 0) > 0;
  });

  if (eligible.length === 0) {
    const fallback = pools.filter(
      (p) =>
        (p.project ?? "").toLowerCase().includes("morpho") &&
        (p.symbol ?? "").toUpperCase() === "LINK" &&
        (p.tvlUsd ?? 0) > 0,
    );
    if (fallback.length === 0) return null;
    return fallback.reduce((best, p) =>
      (p.tvlUsd ?? 0) > (best.tvlUsd ?? 0) ? p : best,
    );
  }

  return eligible.reduce((best, p) =>
    (p.tvlUsd ?? 0) > (best.tvlUsd ?? 0) ? p : best,
  );
}

export async function fetchMorphoLinkSupplyApy(): Promise<MorphoSupplyData> {
  try {
    const res = await fetchWithTimeout(DEFILLAMA_POOLS_URL);
    if (!res.ok) throw new Error(`DefiLlama ${res.status}`);

    const json = (await res.json()) as { data?: DefiLlamaPool[] };
    const pool = pickMorphoLinkPool(json.data ?? []);

    if (!pool) throw new Error("no morpho pool");

    const baseApy = pool.apyBase ?? poolApy(pool);
    const rewardApy = pool.apyReward ?? 0;
    const totalApy = poolApy(pool);

    return {
      apyPct: round2(totalApy),
      baseApyPct: round2(baseApy),
      rewardApyPct: round2(rewardApy),
      tvlUsd: pool.tvlUsd,
      source: "live",
    };
  } catch {
    return {
      apyPct: FALLBACK_MORPHO_APY,
      baseApyPct: 3.2,
      rewardApyPct: 1.3,
      source: "fallback",
    };
  }
}

export async function fetchLinkUsdPrice(): Promise<LinkPriceData> {
  try {
    const res = await fetchWithTimeout(COINGECKO_LINK_PRICE_URL);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const json = (await res.json()) as { chainlink?: { usd?: number } };
    const usd = json.chainlink?.usd;
    if (!usd || !Number.isFinite(usd) || usd <= 0) throw new Error("invalid price");

    return { usd: round2(usd), source: "live" };
  } catch {
    return { usd: FALLBACK_LINK_USD, source: "fallback" };
  }
}

export async function fetchLinkDefiDataLayer(): Promise<{
  morpho: MorphoSupplyData;
  price: LinkPriceData;
}> {
  const [morpho, price] = await Promise.all([
    fetchMorphoLinkSupplyApy(),
    fetchLinkUsdPrice(),
  ]);
  return { morpho, price };
}

export interface LinkCapitalAllocation {
  availableLink: number;
  workingCapitalLink: number;
  workingCapitalPct: number;
  supplyLink: number;
  borrowLink: 0;
}

export function computeLinkCapitalAllocation(availableLink: number): LinkCapitalAllocation {
  const safe = Math.max(0, availableLink);
  const workingCapitalLink = round4(safe);

  return {
    availableLink: safe,
    workingCapitalLink,
    workingCapitalPct: 100,
    supplyLink: workingCapitalLink,
    borrowLink: 0,
  };
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
