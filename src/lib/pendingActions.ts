// Cross-module hand-off objects stored in sessionStorage.
// STRICT MANUAL POLICY: každý hop medzi modulmi je samostatný user gesture.
// Nič sa nespúšťa automaticky — len sa predvyplnia formuláre.

export type PendingRebalanceLeg = { from: string; to: string; amountUsd: number };

const REBALANCE_KEY = 'pending-rebalance-v1';
const STAKE_KEY = 'pending-stake-v1';

export function setPendingRebalance(legs: PendingRebalanceLeg[]): void {
  try { sessionStorage.setItem(REBALANCE_KEY, JSON.stringify({ legs, ts: Date.now() })); } catch { /* ignore */ }
}

export function getPendingRebalance(): { legs: PendingRebalanceLeg[]; ts: number } | null {
  try {
    const raw = sessionStorage.getItem(REBALANCE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function clearPendingRebalance(): void {
  try { sessionStorage.removeItem(REBALANCE_KEY); } catch { /* ignore */ }
}

export type PendingStake = { symbol: 'BTC' | 'ETH' | 'SOL'; amount: number; source: 'dca' | 'swap' };

export function setPendingStake(p: PendingStake): void {
  try { sessionStorage.setItem(STAKE_KEY, JSON.stringify({ ...p, ts: Date.now() })); } catch { /* ignore */ }
}

export function getPendingStake(): (PendingStake & { ts: number }) | null {
  try {
    const raw = sessionStorage.getItem(STAKE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function clearPendingStake(): void {
  try { sessionStorage.removeItem(STAKE_KEY); } catch { /* ignore */ }
}

// Cross-module navigation event (Index listens, BottomNav-controlled tab switch).
export function navigateToTab(tab: string): void {
  window.dispatchEvent(new CustomEvent('app-navigate-tab', { detail: tab }));
}
