/** Automated weekly DCA budget: 10% of free stable balance (cap $200); else 0.5% of portfolio per week. */
export const FREE_BALANCE_PCT = 0.10;
export const FREE_BALANCE_CAP = 200;
export const PORTFOLIO_WEEKLY_PCT = 0.005;

export function weeklyBudget(freeStableUsd: number | null | undefined, portfolioUsd: number | null | undefined) {
  const free = Number(freeStableUsd) || 0;
  if (free > 0) return { amount: Math.min(free * FREE_BALANCE_PCT, FREE_BALANCE_CAP), source: 'wallet' as const };
  const pf = Math.max(0, Number(portfolioUsd) || 0);
  return { amount: pf * PORTFOLIO_WEEKLY_PCT, source: 'portfolio' as const };
}
