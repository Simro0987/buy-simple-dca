import {
  createPublicClient,
  formatEther,
  http,
  parseEther,
} from "viem";
import { mainnet } from "viem/chains";
import {
  COINGECKO_ETH_PRICE_URL,
  DEFILLAMA_POOLS_URL,
  ETH_PUBLIC_RPC,
  FALLBACK_ETH_USD,
  FALLBACK_LIDO_APY,
  FALLBACK_ROCKET_APY,
  FETCH_TIMEOUT_MS,
  RETH_ADDRESS,
  WSTETH_ADDRESS,
} from "@/lib/ethDefi/constants";

const WSTETH_ABI = [
  {
    name: "getStETHByWstETH",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "_wstETHAmount", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

const RETH_ABI = [
  {
    name: "getExchangeRate",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export interface DefiLlamaPool {
  symbol?: string;
  project?: string;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  tvlUsd?: number;
  ilRisk?: string;
  exposure?: string;
}

export interface EthStakingApyData {
  lidoApyPct: number;
  rocketApyPct: number;
  lidoTvlUsd?: number;
  rocketTvlUsd?: number;
  source: "live" | "fallback";
}

export interface OnChainMintRates {
  stEthPerEth: number;
  wstEthPerEth: number;
  rEthPerEth: number;
  source: "live" | "fallback";
}

export interface EthPriceData {
  usd: number;
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

function pickBestPool(
  pools: DefiLlamaPool[],
  project: string,
  symbol: string,
): DefiLlamaPool | null {
  const eligible = pools.filter(
    (p) =>
      (p.project ?? "").toLowerCase() === project &&
      (p.symbol ?? "").toUpperCase() === symbol.toUpperCase() &&
      isEligiblePool(p),
  );
  if (eligible.length === 0) return null;
  return eligible.reduce((best, p) =>
    (p.tvlUsd ?? 0) > (best.tvlUsd ?? 0) ? p : best,
  );
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

/** Module 1 — DefiLlama APY pre Lido stETH a Rocket Pool rETH. */
export async function fetchEthStakingApy(): Promise<EthStakingApyData> {
  try {
    const res = await fetchWithTimeout(DEFILLAMA_POOLS_URL);
    if (!res.ok) throw new Error(`DefiLlama ${res.status}`);

    const json = (await res.json()) as { data?: DefiLlamaPool[] };
    const pools = json.data ?? [];

    const lidoPool = pickBestPool(pools, "lido", "STETH");
    const rocketPool = pickBestPool(pools, "rocket-pool", "RETH");

    const lidoApy = lidoPool ? poolApy(lidoPool) : FALLBACK_LIDO_APY;
    const rocketApy = rocketPool ? poolApy(rocketPool) : FALLBACK_ROCKET_APY;

    return {
      lidoApyPct: round2(lidoApy),
      rocketApyPct: round2(rocketApy),
      lidoTvlUsd: lidoPool?.tvlUsd,
      rocketTvlUsd: rocketPool?.tvlUsd,
      source: lidoPool || rocketPool ? "live" : "fallback",
    };
  } catch {
    return {
      lidoApyPct: FALLBACK_LIDO_APY,
      rocketApyPct: FALLBACK_ROCKET_APY,
      source: "fallback",
    };
  }
}

/** Module 1 — CoinGecko ETH/USD cena. */
export async function fetchEthUsdPrice(): Promise<EthPriceData> {
  try {
    const res = await fetchWithTimeout(COINGECKO_ETH_PRICE_URL);
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);

    const json = (await res.json()) as { ethereum?: { usd?: number } };
    const usd = json.ethereum?.usd;
    if (!usd || !Number.isFinite(usd) || usd <= 0) throw new Error("invalid price");

    return { usd: round2(usd), source: "live" };
  } catch {
    return { usd: FALLBACK_ETH_USD, source: "fallback" };
  }
}

let publicClient: ReturnType<typeof createPublicClient> | null = null;

function getPublicClient() {
  if (!publicClient) {
    publicClient = createPublicClient({
      chain: mainnet,
      transport: http(ETH_PUBLIC_RPC),
    });
  }
  return publicClient;
}

/** Module 1 — On-chain mint rates cez viem Public RPC. */
export async function fetchOnChainMintRates(): Promise<OnChainMintRates> {
  const fallback: OnChainMintRates = {
    stEthPerEth: 1,
    wstEthPerEth: 1.15,
    rEthPerEth: 0.926,
    source: "fallback",
  };

  try {
    const client = getPublicClient();
    const oneEther = parseEther("1");

    const [wstEthResult, rEthResult] = await Promise.all([
      client
        .readContract({
          address: WSTETH_ADDRESS,
          abi: WSTETH_ABI,
          functionName: "getStETHByWstETH",
          args: [oneEther],
        })
        .catch(() => null),
      client
        .readContract({
          address: RETH_ADDRESS,
          abi: RETH_ABI,
          functionName: "getExchangeRate",
        })
        .catch(() => null),
    ]);

    const stEthPerEth = 1;
    let wstEthPerEth = fallback.wstEthPerEth;
    let rEthPerEth = fallback.rEthPerEth;

    if (wstEthResult != null) {
      const stEthFromWst = Number(formatEther(wstEthResult));
      if (stEthFromWst > 0) {
        wstEthPerEth = round4(1 / stEthFromWst);
      }
    }

    if (rEthResult != null) {
      const ethPerREth = Number(formatEther(rEthResult));
      if (ethPerREth > 0) {
        rEthPerEth = round4(1 / ethPerREth);
      }
    }

    return {
      stEthPerEth,
      wstEthPerEth,
      rEthPerEth,
      source: wstEthResult || rEthResult ? "live" : "fallback",
    };
  } catch {
    return fallback;
  }
}

/** Parallel fetch celého Module 1 data layer. */
export async function fetchEthDefiDataLayer(): Promise<{
  apy: EthStakingApyData;
  price: EthPriceData;
  mintRates: OnChainMintRates;
}> {
  const [apy, price, mintRates] = await Promise.all([
    fetchEthStakingApy(),
    fetchEthUsdPrice(),
    fetchOnChainMintRates(),
  ]);
  return { apy, price, mintRates };
}
