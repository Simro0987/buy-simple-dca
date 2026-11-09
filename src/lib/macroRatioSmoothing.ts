// ─────────────────────────────────────────────────────────────
// SMOOTH MACRO RATIO (Core BTC vs Satellites)
//
// Makro pomer Core/Satelity sa nikdy nemení skokovo. Cieľová hodnota
// z 5-faktorového engine sa filtruje:
//   1) EMA s polčasom rozpadu (default 36 h) — plynulý prechod
//   2) tvrdý strop rýchlosti zmeny (default 2.5 pp / 24 h)
//   3) BTC floor 50 % je vždy vynútený (nikdy nie nižšie)
// Stav sa persistuje v localStorage, takže smoothing prežije reload.
// ─────────────────────────────────────────────────────────────

export const CORE_FLOOR_PCT = 50;
export const CORE_CEIL_PCT = 80;

const KEY = 'dca-core-sat-ratio-smooth-v1';

export interface RatioSmoothState {
  /** Posledná vyhladená hodnota Core (BTC) v %. */
  core: number;
  /** Timestamp (ms) poslednej aktualizácie. */
  ts: number;
}

export interface SmoothOptions {
  /** Polčas EMA v hodinách (default 36). */
  halfLifeHours?: number;
  /** Max. povolená zmena v pp za 24 h (default 2.5). */
  maxStepPpPerDay?: number;
  now?: number;
}

export interface SmoothResult {
  /** Vyhladená hodnota Core (BTC) v %, vždy ≥ 50. */
  core: number;
  /** Nevyhladený (raw) makro cieľ v %. */
  target: number;
  /** Rozdiel target − core v pp (koľko ešte "dobehne"). */
  gapPp: number;
  /** Smoothing práve tlmí pohyb (|gap| > 0.2 pp). */
  drifting: boolean;
  /** Nový stav na persistovanie. */
  state: RatioSmoothState;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Čisté vyhladenie — bez side-effectov, deterministické. */
export function smoothCoreWeight(
  rawTarget: number,
  prev: RatioSmoothState | null,
  opts: SmoothOptions = {},
): SmoothResult {
  const halfLife = Math.max(1, opts.halfLifeHours ?? 36);
  const maxStep = Math.max(0.25, opts.maxStepPpPerDay ?? 2.5);
  const now = opts.now ?? Date.now();

  const target = clamp(Number.isFinite(rawTarget) ? rawTarget : CORE_FLOOR_PCT, CORE_FLOOR_PCT, CORE_CEIL_PCT);

  if (!prev || !Number.isFinite(prev.core) || !Number.isFinite(prev.ts)) {
    const state = { core: target, ts: now };
    return { core: target, target, gapPp: 0, drifting: false, state };
  }

  const prevCore = clamp(prev.core, CORE_FLOOR_PCT, CORE_CEIL_PCT);
  const hours = Math.max(0, (now - prev.ts) / 3_600_000);

  // EMA váha z polčasu rozpadu → plynulá konvergencia k cieľu.
  const alpha = 1 - Math.pow(0.5, hours / halfLife);
  let next = prevCore + (target - prevCore) * alpha;

  // Rate limiter — max pp za deň (chráni pred nočným skokom).
  const cap = (maxStep * hours) / 24;
  const delta = clamp(next - prevCore, -cap, cap);
  next = clamp(prevCore + delta, CORE_FLOOR_PCT, CORE_CEIL_PCT);

  const core = Math.round(next * 10) / 10;
  const gapPp = Math.round((target - core) * 10) / 10;

  return {
    core,
    target,
    gapPp,
    drifting: Math.abs(gapPp) > 0.2,
    state: { core, ts: now },
  };
}

export function readRatioState(): RatioSmoothState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RatioSmoothState;
    return Number.isFinite(parsed?.core) && Number.isFinite(parsed?.ts) ? parsed : null;
  } catch { return null; }
}

export function writeRatioState(state: RatioSmoothState): void {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* noop */ }
}
