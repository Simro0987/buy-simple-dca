export interface StakingPoolSnapshot {
  symbol?: string;
  project?: string;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  tvlUsd?: number;
  ilRisk?: string;
  exposure?: string;
}

/** Official liquid-staking sources for ETH (priority order). */
export const ETH_OFFICIAL_STAKING_SOURCES = [
  { project: "rocket-pool", symbol: "RETH", label: "Rocket Pool" },
  { project: "lido", symbol: "STETH", label: "Lido stETH" },
] as const;

/**
 * Jupiter governance locker (vote.jup.ag) — derived from:
 * PDA(["Locker", baseSeed.toBytes()], lockerProgram)
 */
export const JUP_GOVERNANCE_STAKING = {
  lockerPda: "CVMdMd79no569tjc5Sq7kzz8isbfCcFyBS5TLGsrZ5dN",
  /** u64 `locked_supply` offset in the on-chain Locker account (Anchor layout). */
  lockedSupplyOffset: 73,
  /** 50M JUP / quarter × 4 — matches vote.jup.ag Estimated APY formula. */
  asrAnnualEmissionJup: 200_000_000,
  jupDecimals: 6,
} as const;

const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function poolApyFromSnapshot(pool: StakingPoolSnapshot): number {
  if (typeof pool.apy === "number" && pool.apy >= 0) return pool.apy;
  const base = pool.apyBase ?? 0;
  const reward = pool.apyReward ?? 0;
  return base + reward;
}

function isSingleSidedStakingPool(pool: StakingPoolSnapshot): boolean {
  const symbol = (pool.symbol ?? "").trim();
  if (!symbol) return false;
  if (pool.ilRisk != null && pool.ilRisk !== "no") return false;
  if (/[\/\-]/.test(symbol)) return false;
  if (pool.exposure != null && pool.exposure !== "single") return false;
  return true;
}

/** Reject negative, NaN, or absurdly high staking APY values. */
export function normalizeStakingApyPct(apy: number): number | null {
  if (!Number.isFinite(apy) || apy < 0 || apy >= 200) return null;
  return round1(apy);
}

/** Rocket Pool rETH first, then Lido stETH — never random lending pools. */
export function pickOfficialEthStakingPool(
  pools: StakingPoolSnapshot[],
): StakingPoolSnapshot | null {
  for (const source of ETH_OFFICIAL_STAKING_SOURCES) {
    const eligible = pools.filter(
      (pool) =>
        (pool.project ?? "").toLowerCase() === source.project &&
        (pool.symbol ?? "").toUpperCase() === source.symbol &&
        isSingleSidedStakingPool(pool) &&
        (pool.tvlUsd ?? 0) > 0,
    );

    if (eligible.length === 0) continue;

    return eligible.reduce((best, pool) =>
      (pool.tvlUsd ?? 0) > (best.tvlUsd ?? 0) ? pool : best,
    );
  }

  return null;
}

async function fetchSolanaAccountData(
  pubkey: string,
): Promise<Uint8Array | null> {
  try {
    const res = await fetch(SOLANA_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getAccountInfo",
        params: [pubkey, { encoding: "base64", commitment: "confirmed" }],
      }),
      cache: "no-store",
    });

    if (!res.ok) return null;

    const json = (await res.json()) as {
      result?: { value?: { data?: [string, string] } | null };
    };
    const encoded = json.result?.value?.data?.[0];
    if (!encoded) return null;

    return Uint8Array.from(Buffer.from(encoded, "base64"));
  } catch {
    return null;
  }
}

function readU64Le(data: Uint8Array, offset: number): bigint {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return view.getBigUint64(offset, true);
}

/**
 * Official Jupiter governance staking APY from on-chain locked JUP supply
 * and the published ASR emission schedule (200M JUP / year).
 */
export async function fetchJupiterGovernanceStakingApy(): Promise<number | null> {
  const data = await fetchSolanaAccountData(JUP_GOVERNANCE_STAKING.lockerPda);
  const offset = JUP_GOVERNANCE_STAKING.lockedSupplyOffset;

  if (!data || data.length < offset + 8) return null;

  const lockedRaw = readU64Le(data, offset);
  const totalLockedJup =
    Number(lockedRaw) / 10 ** JUP_GOVERNANCE_STAKING.jupDecimals;

  if (!Number.isFinite(totalLockedJup) || totalLockedJup <= 0) return null;

  const apyPct =
    (JUP_GOVERNANCE_STAKING.asrAnnualEmissionJup / totalLockedJup) * 100;

  return normalizeStakingApyPct(apyPct);
}

export function resolveOfficialEthStakingApy(
  pools: StakingPoolSnapshot[],
): number | null {
  const pool = pickOfficialEthStakingPool(pools);
  if (!pool) return null;
  return normalizeStakingApyPct(poolApyFromSnapshot(pool));
}
