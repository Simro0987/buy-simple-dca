/**
 * Real portfolio holdings — exact quantity held and average buy price (WACB)
 * per token, entered by the user and persisted in localStorage.
 *
 * Feeds: live portfolio value, unrealized PnL, asset weighting and the
 * Take-Profit (Harvest) engine's negative-PnL guard.
 */
import { useSyncExternalStore } from 'react';
import { HARVEST_TOKENS, type HarvestToken } from '@/lib/harvestEngine';

export interface HoldingEntry { qty: number; wacb: number }
export type HoldingsState = Record<HarvestToken, HoldingEntry>;

const KEY = 'portfolio-holdings-v1';

const EMPTY: HoldingsState = HARVEST_TOKENS.reduce((acc, t) => {
  acc[t] = { qty: 0, wacb: 0 };
  return acc;
}, {} as HoldingsState);

function sanitize(raw: unknown): HoldingsState {
  const src = (raw ?? {}) as Partial<Record<HarvestToken, Partial<HoldingEntry>>>;
  const out = {} as HoldingsState;
  for (const t of HARVEST_TOKENS) {
    const qty = Number(src[t]?.qty);
    const wacb = Number(src[t]?.wacb);
    out[t] = {
      qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
      wacb: Number.isFinite(wacb) && wacb > 0 ? wacb : 0,
    };
  }
  return out;
}

function load(): HoldingsState {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return EMPTY; }
}

let state: HoldingsState = load();
const listeners = new Set<() => void>();

function emit() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function setHolding(token: HarvestToken, patch: Partial<HoldingEntry>) {
  const cur = state[token];
  const next: HoldingEntry = {
    qty: patch.qty != null ? (Number.isFinite(patch.qty) && patch.qty > 0 ? patch.qty : 0) : cur.qty,
    wacb: patch.wacb != null ? (Number.isFinite(patch.wacb) && patch.wacb > 0 ? patch.wacb : 0) : cur.wacb,
  };
  state = { ...state, [token]: next };
  emit();
}

export function resetHoldings() { state = EMPTY; emit(); }

export function getHoldings(): HoldingsState { return state; }

export function useHoldings(): HoldingsState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => state,
  );
}

// ── PnL math ────────────────────────────────────────────────────────────────

export interface PositionPnl {
  token: HarvestToken;
  qty: number;
  wacb: number;
  price: number;
  valueUsd: number;
  costUsd: number;
  pnlUsd: number;
  /** null when the position or the WACB is not configured. */
  pnlPct: number | null;
  /** Share of the total portfolio value, 0..1. */
  weight: number;
}

export interface PortfolioPnl {
  positions: PositionPnl[];
  totalValueUsd: number;
  totalCostUsd: number;
  pnlUsd: number;
  pnlPct: number | null;
  configuredCount: number;
}

export function computePortfolioPnl(
  holdings: HoldingsState,
  prices: Partial<Record<HarvestToken, number>>,
): PortfolioPnl {
  const rows = HARVEST_TOKENS.map((token) => {
    const { qty, wacb } = holdings[token];
    const price = Number(prices[token]) > 0 ? Number(prices[token]) : 0;
    const valueUsd = qty * price;
    const costUsd = qty * wacb;
    return {
      token, qty, wacb, price, valueUsd, costUsd,
      pnlUsd: costUsd > 0 && price > 0 ? valueUsd - costUsd : 0,
      pnlPct: costUsd > 0 && price > 0 ? ((valueUsd - costUsd) / costUsd) * 100 : null,
      weight: 0,
    } as PositionPnl;
  });

  const totalValueUsd = rows.reduce((s, r) => s + r.valueUsd, 0);
  const totalCostUsd = rows.reduce((s, r) => s + r.costUsd, 0);
  for (const r of rows) r.weight = totalValueUsd > 0 ? r.valueUsd / totalValueUsd : 0;

  return {
    positions: rows,
    totalValueUsd,
    totalCostUsd,
    pnlUsd: totalValueUsd - totalCostUsd,
    pnlPct: totalCostUsd > 0 ? ((totalValueUsd - totalCostUsd) / totalCostUsd) * 100 : null,
    configuredCount: rows.filter((r) => r.qty > 0).length,
  };
}

/** token → unrealized PnL % (null when not configured) for the harvest engine. */
export function pnlPctMap(pnl: PortfolioPnl): Partial<Record<HarvestToken, number | null>> {
  const out: Partial<Record<HarvestToken, number | null>> = {};
  for (const p of pnl.positions) out[p.token] = p.pnlPct;
  return out;
}
