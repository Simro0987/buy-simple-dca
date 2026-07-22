/** Jito Restaking VRT vault recommendations (Module 5). */

export interface RestakingVaultOption {
  id: string;
  label: string;
  tvlUsd: number;
  apyPct: number;
  score: number;
  riskLevel: "medium" | "elevated";
  rationale: string;
}

/** Curated VRT vaults from jito.network/restaking — scored by TVL × APY. */
const JITO_RESTAKING_VAULTS: Omit<RestakingVaultOption, "score" | "rationale">[] = [
  {
    id: "kyros",
    label: "Kyros Restaking Vault",
    tvlUsd: 420_000_000,
    apyPct: 4.2,
    riskLevel: "elevated",
  },
  {
    id: "fragmetric",
    label: "Fragmetric Restaking Vault",
    tvlUsd: 280_000_000,
    apyPct: 3.8,
    riskLevel: "elevated",
  },
  {
    id: "solayer",
    label: "Solayer Restaking Vault",
    tvlUsd: 190_000_000,
    apyPct: 5.1,
    riskLevel: "elevated",
  },
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeVaultScore(tvlUsd: number, apyPct: number): number {
  const tvlScore = Math.log10(Math.max(tvlUsd, 1)) * 10;
  const apyScore = apyPct * 2;
  return round2(tvlScore + apyScore);
}

export function recommendRestakingVault(): RestakingVaultOption {
  const scored = JITO_RESTAKING_VAULTS.map((vault) => {
    const score = computeVaultScore(vault.tvlUsd, vault.apyPct);
    return {
      ...vault,
      score,
      rationale: `TVL ${formatTvl(vault.tvlUsd)} · historické APY ${vault.apyPct.toFixed(1)} % · skóre ${score}`,
    };
  });

  return scored.reduce((best, vault) => (vault.score > best.score ? vault : best));
}

function formatTvl(tvlUsd: number): string {
  if (tvlUsd >= 1_000_000_000) return `$${(tvlUsd / 1_000_000_000).toFixed(1)}B`;
  if (tvlUsd >= 1_000_000) return `$${(tvlUsd / 1_000_000).toFixed(0)}M`;
  return `$${tvlUsd.toFixed(0)}`;
}

export interface RestakingVaultRecommendation {
  vault: RestakingVaultOption;
  message: string;
  jitoSolAmount: number;
}

export function buildRestakingRecommendation(
  jitoSolAmount: number,
): RestakingVaultRecommendation {
  const vault = recommendRestakingVault();
  return {
    vault,
    jitoSolAmount,
    message: `Odporúčaný Vault: ${vault.label} — ${vault.rationale}`,
  };
}
