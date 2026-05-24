/**
 * Profit Reservoir — global synchronized store for the
 * "Stablecoin Profit Reservoir" balance, token deductions
 * from take-profit sells, and the take-profit history log.
 *
 * Used by:
 *  - Portfolio · DynamicTakeProfitCard  (writes profit → reservoir)
 *  - DCA · BtcFundingSplitterCard       (reads & deducts reservoir on BTC DCA)
 *  - usePortfolioMetrics                (reads sells → reduces displayed holdings)
 */
import { useSyncExternalStore } from 'react';

export interface ProfitLogEntry {
  ts: number;
  kind: 'TAKE_PROFIT' | 'DCA_SPLIT';
  symbol: string;
  tokens?: number;
  usd: number;
  price?: number;
  pct?: number;
  note?: string;
}

export interface ReservoirState {
  stable: number;                       // USD in reservoir
  sells: Record<string, number>;        // tokens sold per symbol (cumulative)
  log: ProfitLogEntry[];
}

const KEY = 'profit-reservoir-v1';

const DEFAULT: ReservoirState = { stable: 0, sells: {}, log: [] };

function load(): ReservoirState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      // migrate from legacy keys (DynamicTakeProfitCard v1)
      try {
        const legacyStable = Number(localStorage.getItem('dynamic-take-profit-stable-v1') || '0');
        const legacySells = JSON.parse(localStorage.getItem('dynamic-take-profit-sells-v1') || '{}');
        const legacyLog = JSON.parse(localStorage.getItem('dynamic-take-profit-log-v1') || '[]');
        if (legacyStable || Object.keys(legacySells || {}).length) {
          const migrated: ReservoirState = {
            stable: legacyStable || 0,
            sells: legacySells || {},
            log: Array.isArray(legacyLog)
              ? legacyLog.map((e: { ts: number; symbol: string; tokens: number; usd: number; price: number; pct: number }) => ({ ...e, kind: 'TAKE_PROFIT' as const }))
              : [],
          };
          localStorage.setItem(KEY, JSON.stringify(migrated));
          return migrated;
        }
      } catch { /* ignore */ }
      return DEFAULT;
    }
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { return DEFAULT; }
}

let state: ReservoirState = load();
const listeners = new Set<() => void>();

function emit() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach(l => l());
}

function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
function getSnapshot() { return state; }

// ── Mutations ────────────────────────────────────────────────────────────────
export function addTakeProfit(symbol: string, tokens: number, usd: number, price: number, pct: number) {
  const sells = { ...state.sells, [symbol]: (state.sells[symbol] ?? 0) + tokens };
  state = {
    stable: state.stable + usd,
    sells,
    log: [{ ts: Date.now(), kind: 'TAKE_PROFIT', symbol, tokens, usd, price, pct }, ...state.log].slice(0, 200),
  };
  emit();
}

export function deductReservoir(usd: number, note?: string) {
  const next = Math.max(0, state.stable - usd);
  state = {
    ...state,
    stable: next,
    log: [{ ts: Date.now(), kind: 'DCA_SPLIT', symbol: 'BTC', usd, note }, ...state.log].slice(0, 200),
  };
  emit();
}

export function resetReservoir() {
  state = { ...DEFAULT };
  emit();
}

// Sync hook
export function useProfitReservoir() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

// Non-hook snapshot (for code outside react)
export function getReservoir(): ReservoirState { return state; }
