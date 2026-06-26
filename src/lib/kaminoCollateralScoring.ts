/**
 * Layer 3 Solana tactical collateral — Kamino vault / reserve scoring.
 * Criteria: APY, TVL (liquidity), impermanent-loss risk (LP auto-yield vaults).
 */

export type KaminoVenueKind = 'lending' | 'auto-yield';
export type KaminoCollateralToken = 'SOL' | 'mSOL' | 'JitoSOL' | 'JupSOL' | 'bSOL';

export const KAMINO_COLLATERAL_TOKENS: KaminoCollateralToken[] = [
  'SOL',
  'mSOL',
  'JitoSOL',
  'JupSOL',
  'bSOL',
];

export const FALLBACK_KAMINO_VAULT_LABEL = 'Kamino JUP-SOL Auto-Yield';

export interface KaminoCollateralCandidate {
  protocolName: 'Kamino';
  sourceUrl: string;
  venueKind: KaminoVenueKind;
  venueLabel: string;
  collateralToken: KaminoCollateralToken;
  apyPct: number;
  tvlUsd: number;
  maxLtvPct: number;
  ilRiskPct: number;
  usdcBorrowApyPct: number;
  combinedScore: number;
}

export function safePercent(value: number | null | undefined): number {
  const n = value ?? 0;
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function tvlScore(tvlUsd: number): number {
  const tvl = Math.max(0, tvlUsd ?? 0);
  if (tvl <= 0) return 0;
  return Math.min(8, Math.log10(tvl + 1));
}

/** Lending: APY + LTV weight + TVL; auto-yield: APY + TVL − IL penalty. */
export function computeKaminoScore(input: {
  venueKind: KaminoVenueKind;
  apyPct: number;
  tvlUsd: number;
  maxLtvPct: number;
  ilRiskPct: number;
}): number {
  const apy = safePercent(input.apyPct);
  const ltv = safePercent(input.maxLtvPct);
  const il = safePercent(input.ilRiskPct);
  const liquidity = tvlScore(input.tvlUsd);
  const base = apy + liquidity;
  if (input.venueKind === 'lending') {
    return Math.round((base + ltv * 0.4) * 100) / 100;
  }
  return Math.round((base - il * 0.15) * 100) / 100;
}

export function buildKaminoCandidate(input: {
  venueKind: KaminoVenueKind;
  venueLabel: string;
  sourceUrl: string;
  collateralToken: KaminoCollateralToken;
  apyPct?: number | null;
  tvlUsd?: number | null;
  maxLtvPct?: number | null;
  ilRiskPct?: number | null;
  usdcBorrowApyPct?: number | null;
}): KaminoCollateralCandidate {
  const apyPct = safePercent(input.apyPct);
  const tvlUsd = Math.max(0, input.tvlUsd ?? 0);
  const maxLtvPct = safePercent(input.maxLtvPct);
  const ilRiskPct = safePercent(input.ilRiskPct);
  const usdcBorrowApyPct = safePercent(input.usdcBorrowApyPct);
  return {
    protocolName: 'Kamino',
    sourceUrl: input.sourceUrl,
    venueKind: input.venueKind,
    venueLabel: input.venueLabel?.trim() || FALLBACK_KAMINO_VAULT_LABEL,
    collateralToken: input.collateralToken,
    apyPct,
    tvlUsd,
    maxLtvPct,
    ilRiskPct,
    usdcBorrowApyPct,
    combinedScore: computeKaminoScore({
      venueKind: input.venueKind,
      apyPct,
      tvlUsd,
      maxLtvPct,
      ilRiskPct,
    }),
  };
}

export function selectBestKaminoCandidate(
  candidates: KaminoCollateralCandidate[] | null | undefined,
): KaminoCollateralCandidate | null {
  const list = (candidates ?? []).filter(c => c != null && (c.tvlUsd > 0 || c.maxLtvPct > 0));
  if (list.length === 0) return null;
  return [...list].sort((a, b) => {
    if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
    if (b.tvlUsd !== a.tvlUsd) return b.tvlUsd - a.tvlUsd;
    return a.ilRiskPct - b.ilRiskPct;
  })[0] ?? null;
}

export function formatKaminoDecisionReason(
  winner: Pick<KaminoCollateralCandidate, 'apyPct' | 'tvlUsd' | 'ilRiskPct' | 'venueKind'>,
  sk: boolean,
): string {
  const apy = winner.apyPct.toFixed(1);
  const tvl = winner.tvlUsd >= 1_000_000
    ? `$${(winner.tvlUsd / 1_000_000).toFixed(1)}M`
    : `$${Math.round(winner.tvlUsd / 1000)}k`;

  if (winner.venueKind === 'auto-yield') {
    return sk
      ? `Dôvod: Najlepší pomer výnos/riziko (APY ${apy}% · TVL ${tvl}).`
      : `Reason: Best yield/risk ratio (APY ${apy}% · TVL ${tvl}).`;
  }

  return sk
    ? `Dôvod: Najlepší pomer výnos/riziko (supply APY ${apy}% · TVL ${tvl}).`
    : `Reason: Best yield/risk ratio (supply APY ${apy}% · TVL ${tvl}).`;
}

export function formatKaminoRouteLine(
  winner: Pick<KaminoCollateralCandidate, 'collateralToken'>,
  sk: boolean,
): string {
  const target = winner.collateralToken === 'SOL' ? 'mSOL' : winner.collateralToken;
  return sk
    ? `Presun: SOL -> ${target} | Protokol: Kamino (Solana)`
    : `Route: SOL -> ${target} | Protocol: Kamino (Solana)`;
}

export function formatKaminoVenueLine(
  winner: Pick<KaminoCollateralCandidate, 'venueLabel'>,
  sk: boolean,
): string | null {
  const label = winner.venueLabel?.trim();
  if (!label) return null;
  return sk ? `Vault: ${label}` : `Vault: ${label}`;
}

export function formatKaminoPlanInstruction(
  winner: KaminoCollateralCandidate,
  sk: boolean,
  extraLines: string[] = [],
): string {
  const lines = [
    formatKaminoRouteLine(winner, sk),
    formatKaminoVenueLine(winner, sk),
    ...extraLines,
    formatKaminoDecisionReason(winner, sk),
  ].filter((line): line is string => Boolean(line));
  return lines.join('\n');
}
