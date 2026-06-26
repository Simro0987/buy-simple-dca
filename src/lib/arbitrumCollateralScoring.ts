/**
 * Layer 3 Tactical Collateral — dynamic scoring across ETH/LST candidates on Arbitrum.
 * Combines max LTV, base (staking) yield, and protocol supply APY.
 */

export type ArbitrumCollateralToken = 'ETH' | 'wETH' | 'wstETH' | 'weETH' | 'rETH';
export type ArbitrumProtocolId = 'aave' | 'morpho';

export const ARBITRUM_COLLATERAL_TOKENS: ArbitrumCollateralToken[] = [
  'ETH',
  'wETH',
  'wstETH',
  'weETH',
  'rETH',
];

/** Default LST base yields when live feeds are unavailable (percent). */
export const FALLBACK_BASE_YIELDS: Record<ArbitrumCollateralToken, number> = {
  ETH: 0,
  wETH: 0,
  wstETH: 3.4,
  weETH: 4.38,
  rETH: 3.05,
};

export interface ArbitrumCollateralCandidate {
  protocolId: ArbitrumProtocolId;
  protocolName: string;
  sourceUrl: string;
  collateralToken: ArbitrumCollateralToken;
  collateralAddress: string;
  loanSymbol: 'USDC';
  maxLtvPct: number;
  supplyApyPct: number;
  baseYieldPct: number;
  usdcBorrowApyPct: number;
  combinedScore: number;
}

export function safePercent(value: number | null | undefined): number {
  const n = value ?? 0;
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Combined score = max LTV + base yield + supply APY (all in percent). */
export function computeCollateralScore(
  maxLtvPct: number | null | undefined,
  baseYieldPct: number | null | undefined,
  supplyApyPct: number | null | undefined,
): number {
  const ltv = safePercent(maxLtvPct);
  const base = safePercent(baseYieldPct);
  const supply = safePercent(supplyApyPct);
  return Math.round((ltv + base + supply) * 100) / 100;
}

export function buildCollateralCandidate(input: {
  protocolId: ArbitrumProtocolId;
  protocolName: string;
  sourceUrl: string;
  collateralToken: ArbitrumCollateralToken;
  collateralAddress: string;
  maxLtvPct?: number | null;
  supplyApyPct?: number | null;
  baseYieldPct?: number | null;
  usdcBorrowApyPct?: number | null;
}): ArbitrumCollateralCandidate {
  const maxLtvPct = safePercent(input.maxLtvPct);
  const supplyApyPct = safePercent(input.supplyApyPct);
  const baseYieldPct = safePercent(input.baseYieldPct);
  const usdcBorrowApyPct = safePercent(input.usdcBorrowApyPct);
  return {
    protocolId: input.protocolId,
    protocolName: input.protocolName,
    sourceUrl: input.sourceUrl,
    collateralToken: input.collateralToken,
    collateralAddress: input.collateralAddress,
    loanSymbol: 'USDC',
    maxLtvPct,
    supplyApyPct,
    baseYieldPct,
    usdcBorrowApyPct,
    combinedScore: computeCollateralScore(maxLtvPct, baseYieldPct, supplyApyPct),
  };
}

function candidateSortKey(candidate: ArbitrumCollateralCandidate): [number, number, number, number] {
  const totalYield = candidate.baseYieldPct + candidate.supplyApyPct;
  return [candidate.combinedScore, candidate.maxLtvPct, totalYield, -ARBITRUM_COLLATERAL_TOKENS.indexOf(candidate.collateralToken)];
}

export function compareCollateralCandidates(
  a: ArbitrumCollateralCandidate,
  b: ArbitrumCollateralCandidate,
): number {
  const ka = candidateSortKey(a);
  const kb = candidateSortKey(b);
  for (let i = 0; i < ka.length; i += 1) {
    if (ka[i] !== kb[i]) return kb[i] - ka[i];
  }
  return 0;
}

/** Pick the highest-scoring (token, protocol) pair; tie-break on LTV then total yield. */
export function selectBestCollateralCandidate(
  candidates: ArbitrumCollateralCandidate[] | null | undefined,
): ArbitrumCollateralCandidate | null {
  const list = (candidates ?? []).filter(c => c != null && c.maxLtvPct > 0);
  if (list.length === 0) return null;
  return [...list].sort(compareCollateralCandidates)[0] ?? null;
}

export function isLstToken(token: ArbitrumCollateralToken): boolean {
  return token === 'wstETH' || token === 'weETH' || token === 'rETH';
}

export function formatCollateralDecisionReason(
  winner: Pick<ArbitrumCollateralCandidate, 'maxLtvPct' | 'baseYieldPct' | 'supplyApyPct' | 'collateralToken'>,
  sk: boolean,
): string {
  const ltv = winner.maxLtvPct.toFixed(0);
  const base = winner.baseYieldPct.toFixed(1);
  const supply = winner.supplyApyPct.toFixed(2);

  if (isLstToken(winner.collateralToken) && winner.baseYieldPct > 0) {
    return sk
      ? `Dôvod: Najvyššie kombo LTV (${ltv}%) a LST výnosu (${base}%).`
      : `Reason: Highest LTV (${ltv}%) and LST yield (${base}%) combo.`;
  }

  if (winner.supplyApyPct > 0) {
    return sk
      ? `Dôvod: Najvyšší LTV (${ltv}%) a supply APY (${supply}%).`
      : `Reason: Highest LTV (${ltv}%) and supply APY (${supply}%).`;
  }

  return sk
    ? `Dôvod: Najvyšší dostupný LTV (${ltv}%).`
    : `Reason: Highest available LTV (${ltv}%).`;
}

export function formatCollateralRouteLine(
  winner: Pick<ArbitrumCollateralCandidate, 'collateralToken' | 'protocolName'>,
  sk: boolean,
): string {
  const target = winner.collateralToken === 'ETH' ? 'wETH' : winner.collateralToken;
  return sk
    ? `Presun: ETH -> ${target} | Protokol: ${winner.protocolName} (Arbitrum)`
    : `Route: ETH -> ${target} | Protocol: ${winner.protocolName} (Arbitrum)`;
}

export function formatCollateralPlanInstruction(
  winner: ArbitrumCollateralCandidate,
  sk: boolean,
): string {
  return `${formatCollateralRouteLine(winner, sk)} · ${formatCollateralDecisionReason(winner, sk)}`;
}
