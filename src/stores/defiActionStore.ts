/**
 * Global DeFi action store — records confirmed manual executions (advisory
 * dashboards). Persisted in localStorage and broadcast so every mounted card
 * reacts instantly.
 */
export { usePortfolioActionStore as useDefiActions } from './portfolioActionStore';
export type { DefiActionRecord } from './portfolioActionStore';
