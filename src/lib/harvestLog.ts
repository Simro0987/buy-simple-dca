/**
 * Harvest log — persistent record of executed take-profits plus the
 * local "overheat pressure" release that follows a logged harvest.
 */
import { useSyncExternalStore } from 'react';

export interface HarvestLogEntry {
  ts: number;
  token: string;
  score: number;
  tpPct: number;
  destination: string;
  overheat: number;
}

export interface HarvestLogState {
  log: HarvestLogEntry[];
  /** token → epoch ms of the last logged harvest. */
  lastHarvest: Record<string, number>;
}

const KEY = 'harvest-log-v1';
const DEFAULT: HarvestLogState = { log: [], lastHarvest: {} };
/** Pressure release window: overheat is visually damped for 48 h after a harvest. */
export const PRESSURE_WINDOW_MS = 48 * 60 * 60 * 1000;

function load(): HarvestLogState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { return DEFAULT; }
}

let state: HarvestLogState = load();
const listeners = new Set<() => void>();

function emit() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach(l => l());
}

export function logHarvest(e: Omit<HarvestLogEntry, 'ts'>) {
  const entry: HarvestLogEntry = { ...e, ts: Date.now() };
  state = {
    log: [entry, ...state.log].slice(0, 200),
    lastHarvest: { ...state.lastHarvest, [e.token]: entry.ts },
  };
  emit();
}

export function clearHarvestPressure(token: string) {
  const next = { ...state.lastHarvest };
  delete next[token];
  state = { ...state, lastHarvest: next };
  emit();
}

/** 0..1 damping factor applied to the displayed overheat after a harvest. */
export function pressureRelief(token: string, now = Date.now()): number {
  const last = state.lastHarvest[token];
  if (!last) return 1;
  const elapsed = now - last;
  if (elapsed >= PRESSURE_WINDOW_MS) return 1;
  // Fresh harvest → 45 % of the pressure shown, recovering linearly to 100 %.
  return 0.45 + 0.55 * (elapsed / PRESSURE_WINDOW_MS);
}

export function useHarvestLog(): HarvestLogState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => state,
  );
}
