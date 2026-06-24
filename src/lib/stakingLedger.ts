// Manual bi-directional staking ledger.
// STRICT MANUAL POLICY: každý záznam je user gesture, žiadne autochain.
// Storage: localStorage (decoupled od app_settings → baseline holdings ostávajú nedotknuté).
// Dispatch eventu 'staking-ledger-change' umožňuje Portfólio + ostatným UI sync v realtime.

export type LedgerSymbol = 'BTC' | 'ETH' | 'SOL';

export interface StakedEntry {
  symbol: LedgerSymbol;
  protocol: string;
  amount: number;
}

const KEY = 'staking-ledger-v1';
const EVT = 'staking-ledger-change';

// Predefined protocols matching planner categories (user can extend via free text).
export const PROTOCOL_PRESETS: Record<LedgerSymbol, string[]> = {
  BTC: ['Babylon Staking', 'Lombard LBTC', 'Morpho Blue LBTC'],
  ETH: ['Rocket Pool (rETH)', 'Alchemix Vault (ETH)', 'Kiln (Solo Manage)', 'Aave V3 Lending'],
  SOL: ['Marinade Native (mSOL)', 'Kamino Autopilot'],
};

export function getLedger(): StakedEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e => e && typeof e === 'object' && e.symbol && e.protocol && Number.isFinite(e.amount));
  } catch { return []; }
}

function persist(entries: StakedEntry[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(entries));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch { /* ignore */ }
}

// MANUAL ONLY — call from user click.
export function addStake(symbol: LedgerSymbol, protocol: string, amount: number): void {
  if (amount <= 0) return;
  const list = getLedger();
  const idx = list.findIndex(e => e.symbol === symbol && e.protocol === protocol);
  if (idx >= 0) {
    list[idx] = { ...list[idx], amount: list[idx].amount + amount };
  } else {
    list.push({ symbol, protocol, amount });
  }
  persist(list);
}

// MANUAL ONLY — call from user click. Prevents negative balances; clamps and removes empty entries.
export function removeStake(symbol: LedgerSymbol, protocol: string, amount: number): number {
  if (amount <= 0) return 0;
  const list = getLedger();
  const idx = list.findIndex(e => e.symbol === symbol && e.protocol === protocol);
  if (idx < 0) return 0;
  const current = list[idx].amount;
  const taken = Math.min(current, amount);
  const next = current - taken;
  if (next <= 1e-12) {
    list.splice(idx, 1);
  } else {
    list[idx] = { ...list[idx], amount: next };
  }
  persist(list);
  return taken;
}

export function deleteEntry(symbol: LedgerSymbol, protocol: string): void {
  const list = getLedger().filter(e => !(e.symbol === symbol && e.protocol === protocol));
  persist(list);
}

export function getStakedBySymbol(): Record<LedgerSymbol, number> {
  const out: Record<LedgerSymbol, number> = { BTC: 0, ETH: 0, SOL: 0 };
  for (const e of getLedger()) out[e.symbol] += e.amount;
  return out;
}

export function getStakedBreakdown(): Record<LedgerSymbol, StakedEntry[]> {
  const out: Record<LedgerSymbol, StakedEntry[]> = { BTC: [], ETH: [], SOL: [] };
  for (const e of getLedger()) out[e.symbol].push(e);
  return out;
}

export const STAKING_LEDGER_EVENT = EVT;
