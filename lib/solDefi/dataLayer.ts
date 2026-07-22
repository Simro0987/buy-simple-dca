import {
  COINGECKO_SOL_PRICE_URL,
  DEFILLAMA_POOLS_URL,
  FALLBACK_JITO_APY,
  FALLBACK_JITOSOL_PER_SOL,
  FALLBACK_MARINADE_APY,
  FALLBACK_SOL_USD,
  FETCH_TIMEOUT_MS,
  JITO_STAKE_POOL_API,
  JITOSOL_MINT,
  JUPITER_QUOTE_URL,
  SOL_MINT,
} from "@/lib/solDefi/constants";

export interface DefiLlamaPool {
  symbol?: string;
  project?: string;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  tvlUsd?: number;
  ilRisk?: string;
  exposure?: string;
  pool?: string;
}

export interface SolStakingApyData {
  marinadeApyPct: number;
  jitoApyPct: number;
  marinadeTvlUsd?: number;
  jitoTvlUsd?: number;
  source: "live" | "fallback";
}

export interface SolPriceData {
  usd: number;
  source: "live" | "fallback";
}

export interface JitoMintRateData {
  jitoSolPerSol: number;
  source: "live" | "fallback";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function poolApy(pool: DefiLlamaPool): number {
  if (typeof pool.apy === "number" && pool.apy >= 0) return pool.apy;
  return (pool.apyBase ?? 0) + (pool.apyReward ?? 0);
}

function isEligiblePool(pool: DefiLlamaPool): boolean {
  const symbol = (pool.symbol ?? "").trim();
  if (!symbol) return false;
  if (pool.ilRisk != null && pool.ilRisk !== "no") return false;
  if (/[\/\-]/.test(symbol)) return false;
  if (pool.exposure != null && pool.exposure !== "single") return false;
  return (pool.tvlUsd ?? 0) > 0;
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

function pickMarinadePool(pools: DefiLlamaPool[]): DefiLlamaPool | null {
  const eligible = pools.filter((p) => {
    const project = (p.project ?? "").toLowerCase();
    const symbol = (p.symbol ?? "").toUpperCase();
    if (!project.includes("marinade")) return false;
    if (!isEligiblePool(p)) return false;
    return (
      symbol === "MSOL" ||
      symbol === "SOL" ||
      (p.pool ?? "").toLowerCase().includes("native")
    );
  });
  if (eligible.length === 0) {
    const fallback = pools.filter(
      (p) =>
        (p.project ?? "").toLowerCase().includes("marinade") && isEligiblePool(p),
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

function pickJitoPool(pools: DefiLlamaPool[]): DefiLlamaPool | null {
  const eligible = pools.filter(
    (p) =>
      (p.project ?? "").toLowerCase().includes("jito") &&
      (p.symbol ?? "").toUpperCase() === "JITOSOL" &&
      isEligiblePool(p),
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((best, p) =>
    (p.tvlUsd ?? 0) > (best.tvlUsd ?? 0) ? p : best,
  );
}

export async function fetchSolStakingApy(): Promise<SolStakingApyData> {
  try {
    const res = await fetchWithTimeout(DEFILLAMA_POOLS_URL);
    if (!res.ok) throw new Error(`DefiLlama ${res.status}`);

    const json = (await res.json()) as { data?: DefiLlamaPool[] };
    const pools = json.data ?? [];

    const marinadePool = pickMarinadePool(pools);
    const jitoPool = pickJitoPool(pools);

    return {
      marinadeApyPct: round2(marinadePool ? poolApy(marinadePool) : FALLBACK_MARINADE_APY),
      jitoApyPct: round2(jitoPool ? poolApy(jitoPool) : FALLBACK_JITO_APY),
      marinadeTvlUsd: marinadePool?.tvlUsd,
      jitoTvlUsd: jitoPool?.tvlUsd,
      source: marinadePool || jitoPool ? "live" : "fallback",
    };
  } catch {
    return {
      marinadeApyPct: FALLBACK_MARINADE_APY,
      jitoApyPct: FALLBACK_JITO_APY,
      source: "fallback",
    };
  }
}

export async function fetchSolUsdPrice(): Promise<SolPriceData> {
  try {
    const res = await fetchWithTimeout(COINGECKO_SOL_PRICE_URL);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const json = (await res.json()) as { solana?: { usd?: number } };
    const usd = json.solana?.usd;
    if (!usd || !Number.isFinite(usd) || usd <= 0) throw new Error("invalid price");

    return { usd: round2(usd), source: "live" };
  } catch {
    return { usd: FALLBACK_SOL_USD, source: "fallback" };
  }
}

async function fetchJitoMintRateFromApi(): Promise<number | null> {
  try {
    const res = await fetchWithTimeout(JITO_STAKE_POOL_API);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      exchangeRate?: number;
      sol_per_jitosol?: number;
    };
    if (json.exchangeRate && json.exchangeRate > 0) {
      return 1 / json.exchangeRate;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchJupiterJitoSolQuote(
  solAmount: number,
): Promise<number | null> {
  if (solAmount <= 0) return null;
  try {
    const lamports = Math.floor(solAmount * 1e9).toString();
    const url = new URL(JUPITER_QUOTE_URL);
    url.searchParams.set("inputMint", SOL_MINT);
    url.searchParams.set("outputMint", JITOSOL_MINT);
    url.searchParams.set("amount", lamports);
    url.searchParams.set("slippageBps", "50");

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) return null;

    const json = (await res.json()) as { outAmount?: string };
    const out = Number(json.outAmount ?? 0) / 1e9;
    if (out <= 0) return null;
    return round4(out / solAmount);
  } catch {
    return null;
  }
}

export async function fetchJitoMintRate(
  referenceSol = 1,
): Promise<JitoMintRateData> {
  const [apiRate, jupiterRate] = await Promise.all([
    fetchJitoMintRateFromApi(),
    fetchJupiterJitoSolQuote(referenceSol).then((out) =>
      out != null && referenceSol > 0 ? out : null,
    ),
  ]);

  const rate = jupiterRate ?? apiRate ?? FALLBACK_JITOSOL_PER_SOL;
  return {
    jitoSolPerSol: round4(rate),
    source: jupiterRate || apiRate ? "live" : "fallback",
  };
}

export async function fetchJupiterSwapQuote(input: {
  inputSol: number;
  outputMint?: string;
}): Promise<{ outputAmount: number; priceImpactPct: number } | null> {
  if (input.inputSol <= 0) return null;
  try {
    const lamports = Math.floor(input.inputSol * 1e9).toString();
    const url = new URL(JUPITER_QUOTE_URL);
    url.searchParams.set("inputMint", SOL_MINT);
    url.searchParams.set("outputMint", input.outputMint ?? JITOSOL_MINT);
    url.searchParams.set("amount", lamports);
    url.searchParams.set("slippageBps", "50");

    const res = await fetchWithTimeout(url.toString());
    if (!res.ok) return null;

    const json = (await res.json()) as {
      outAmount?: string;
      priceImpactPct?: string;
    };
    const outputAmount = Number(json.outAmount ?? 0) / 1e9;
    if (outputAmount <= 0) return null;

    return {
      outputAmount: round6(outputAmount),
      priceImpactPct: round2(Number(json.priceImpactPct ?? 0) * 100),
    };
  } catch {
    return null;
  }
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export async function fetchSolDefiDataLayer(): Promise<{
  apy: SolStakingApyData;
  price: SolPriceData;
  mintRate: JitoMintRateData;
}> {
  const [apy, price, mintRate] = await Promise.all([
    fetchSolStakingApy(),
    fetchSolUsdPrice(),
    fetchJitoMintRate(),
  ]);
  return { apy, price, mintRate };
}
