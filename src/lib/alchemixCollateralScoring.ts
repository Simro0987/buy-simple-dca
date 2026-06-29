/**
 * Layer 4 Alchemix — self-repaying strategy scoring (alETH / alUSD).
 * Criteria: transmuter/farm yield, LTV ratio, peg stability.
 */

export type AlchemixStrategyId = 'transmuter' | 'farm' | 'vault';
export type AlchemixNetwork = 'Ethereum' | 'Arbitrum';

export const FALLBACK_ALCHEMIX_STRATEGY_LABEL = 'Alchemix ETH Transmuter';

export interface AlchemixStrategyCandidate {
  strategyId: AlchemixStrategyId;
  strategyLabel: string;
  network: AlchemixNetwork;
  sourceUrl: string;
  yieldPct: number;
  ltvPct: number;
  pegStabilityPct: number;
  combinedScore: number;
}

export function safePercent(value: number | null | undefined): number {
  const n = value ?? 0;
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/** Score = yield + LTV weight + peg stability weight. */
export function computeAlchemixScore(
  yieldPct: number | null | undefined,
  ltvPct: number | null | undefined,
  pegStabilityPct: number | null | undefined,
): number {
  const y = safePercent(yieldPct);
  const ltv = safePercent(ltvPct);
  const peg = safePercent(pegStabilityPct);
  return Math.round((y + ltv * 0.35 + peg * 0.2) * 100) / 100;
}

export function buildAlchemixCandidate(input: {
  strategyId: AlchemixStrategyId;
  strategyLabel: string;
  network: AlchemixNetwork;
  sourceUrl: string;
  yieldPct?: number | null;
  ltvPct?: number | null;
  pegStabilityPct?: number | null;
}): AlchemixStrategyCandidate {
  const yieldPct = safePercent(input.yieldPct);
  const ltvPct = safePercent(input.ltvPct);
  const pegStabilityPct = safePercent(input.pegStabilityPct);
  return {
    strategyId: input.strategyId,
    strategyLabel: input.strategyLabel?.trim() || FALLBACK_ALCHEMIX_STRATEGY_LABEL,
    network: input.network,
    sourceUrl: input.sourceUrl,
    yieldPct,
    ltvPct,
    pegStabilityPct,
    combinedScore: computeAlchemixScore(yieldPct, ltvPct, pegStabilityPct),
  };
}

export function selectBestAlchemixCandidate(
  candidates: AlchemixStrategyCandidate[] | null | undefined,
): AlchemixStrategyCandidate | null {
  const list = (candidates ?? []).filter(c => c != null);
  if (list.length === 0) return null;
  return [...list].sort((a, b) => {
    if (b.combinedScore !== a.combinedScore) return b.combinedScore - a.combinedScore;
    return b.pegStabilityPct - a.pegStabilityPct;
  })[0] ?? null;
}

export function formatAlchemixDecisionReason(
  winner: Pick<AlchemixStrategyCandidate, 'strategyId' | 'yieldPct'>,
  sk: boolean,
): string {
  if (winner.strategyId === 'transmuter') {
    return sk
      ? 'Dôvod: Využitie yield-bearing aktív na automatické splácanie dlhu.'
      : 'Reason: Using yield-bearing assets for automatic debt repayment.';
  }
  if (winner.strategyId === 'farm') {
    const y = winner.yieldPct.toFixed(1);
    return sk
      ? `Dôvod: Najvyšší farm výnos (${y}%) so stabilným alUSD pegom.`
      : `Reason: Highest farm yield (${y}%) with stable alUSD peg.`;
  }
  const y = winner.yieldPct.toFixed(1);
  return sk
    ? `Dôvod: Najlepší vault výnos (${y}%) a LTV profil pre self-repaying pozíciu.`
    : `Reason: Best vault yield (${y}%) and LTV profile for self-repaying exposure.`;
}

export function formatAlchemixRouteLine(
  winner: Pick<AlchemixStrategyCandidate, 'network'>,
  sk: boolean,
): string {
  return sk
    ? `Presun: ETH -> Alchemix Vault | Protokol: Alchemix (${winner.network})`
    : `Route: ETH -> Alchemix Vault | Protocol: Alchemix (${winner.network})`;
}

export function formatAlchemixStrategyLine(
  winner: Pick<AlchemixStrategyCandidate, 'strategyLabel'>,
  sk: boolean,
): string | null {
  const label = winner.strategyLabel?.trim();
  if (!label) return null;
  return sk ? `Stratégia: ${label}` : `Strategy: ${label}`;
}

export function formatAlchemixPlanInstruction(
  winner: AlchemixStrategyCandidate,
  sk: boolean,
  extraLines: string[] = [],
): string {
  const lines = [
    formatAlchemixRouteLine(winner, sk),
    formatAlchemixStrategyLine(winner, sk),
    ...extraLines,
    formatAlchemixDecisionReason(winner, sk),
  ].filter((line): line is string => Boolean(line));
  return lines.join('\n');
}
