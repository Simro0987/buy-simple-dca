/**
 * CONTINUOUS LMT ENGINE (Dynamic Execution Engine · DCA)
 * ------------------------------------------------------
 * 100 % plynulá matematická krivka pre limitné príkazy — žiadne statické %,
 * žiadne skokové prahy, žiadne "snapovanie" presne na 50D EMA.
 *
 * 1) Základ z volatility:      base = 1× denný ATR (v % ceny)
 * 2) Plynulé škálovanie RSI:   depth = ATR% × (RSI / 50)   [clamp 0.6×–1.6×]
 * 3) Blending kĺzavých priem.: EMA50 / SMA200 pod cenou fungujú ako
 *    "gravitačné hranice" — finálna hĺbka je hladká interpolácia medzi
 *    ATR/RSI hĺbkou a vzdialenosťou k najbližšej MA pod cenou.
 *    Ak je MA prakticky na cene (napr. −0,2 %), váha MA sa kvadraticky
 *    stráca → dominuje ATR/RSI hĺbka (žiadne zbytočné −0,2 % zľavy).
 * 4) Plynulý MKT/LMT split:    čím hlbšia (lukratívnejšia) zľava, tým viac
 *    kapitálu plynulo tečie do LMT (max 70 %).
 */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Absolútne hranice hĺbky, aby limit nebol ani zbytočný, ani nedosiahnuteľný. */
const MIN_DEPTH_PCT = 1.2;
const MAX_DEPTH_PCT = 12;
/** Maximálna váha, akú môže MA získať v interpolácii. */
const MAX_MA_WEIGHT = 0.6;
/** Strop LMT alokácie pri veľmi lukratívnej zľave. */
export const MAX_LIMIT_ALLOC_PCT = 70;

export interface ContinuousLimitInput {
  price: number;
  /** Denný ATR v absolútnej cene (ATR14 preferovane, ATR7 fallback). */
  atr: number;
  /** RSI(14D). Ak nie je dostupné, použije sa 50 (neutrál). */
  rsi14?: number | null;
  ema50?: number | null;
  sma200?: number | null;
}

export interface ContinuousLimitResult {
  ok: boolean;
  /** ATR ako % ceny. */
  atrPct: number;
  rsi: number;
  /** ATR% × (RSI/50) — čistá ATR/RSI hĺbka. */
  targetDepthPct: number;
  /** ATR multiplikátor odvodený z RSI (napr. 1.4×). */
  rsiMultiple: number;
  /** Najbližšia MA pod cenou (0 ak žiadna). */
  maPrice: number;
  maLabel: 'EMA 50' | 'SMA 200' | '—';
  /** Vzdialenosť k tejto MA v % (kladné číslo = koľko % pod cenou). */
  maDistPct: number;
  /** Váha MA v interpolácii (0..0.6). */
  maWeight: number;
  /** Finálna hĺbka zľavy v % (kladné číslo). */
  discountPct: number;
  limitPrice: number;
  /** 0..1 — ako lukratívna je zľava voči ATR základu (pre split). */
  lucrativeness: number;
  /** Slovenský popis pre kartu "Prečo limit?". */
  explanation: string;
}

const EMPTY: ContinuousLimitResult = {
  ok: false, atrPct: 0, rsi: 50, targetDepthPct: 0, rsiMultiple: 1,
  maPrice: 0, maLabel: '—', maDistPct: 0, maWeight: 0,
  discountPct: 0, limitPrice: 0, lucrativeness: 0, explanation: '',
};

const fmtPrice = (v: number) =>
  v >= 1000 ? `$${v.toLocaleString('sk-SK', { maximumFractionDigits: 0 })}`
  : v >= 1 ? `$${v.toFixed(2)}`
  : `$${v.toFixed(4)}`;

export function computeContinuousLimit(input: ContinuousLimitInput): ContinuousLimitResult {
  const { price, atr } = input;
  if (!(price > 0) || !(atr > 0)) return { ...EMPTY };

  const atrPct = (atr / price) * 100;
  const rsi = typeof input.rsi14 === 'number' && Number.isFinite(input.rsi14)
    ? clamp(input.rsi14, 5, 95) : 50;

  // ── 2) Plynulé škálovanie RSI (bez stupňov) ──
  const rsiMultiple = clamp(rsi / 50, 0.6, 1.6);
  const targetDepthPct = clamp(atrPct * rsiMultiple, MIN_DEPTH_PCT, MAX_DEPTH_PCT);

  // ── 3) Gravitačné hranice: najbližšia MA POD cenou ──
  const candidates: Array<{ label: 'EMA 50' | 'SMA 200'; v: number }> = [];
  if (typeof input.ema50 === 'number' && input.ema50 > 0 && input.ema50 < price) {
    candidates.push({ label: 'EMA 50', v: input.ema50 });
  }
  if (typeof input.sma200 === 'number' && input.sma200 > 0 && input.sma200 < price) {
    candidates.push({ label: 'SMA 200', v: input.sma200 });
  }
  // najbližšia = najvyššia hodnota pod cenou
  const nearest = candidates.sort((a, b) => b.v - a.v)[0];
  const maPrice = nearest?.v ?? 0;
  const maLabel = nearest?.label ?? '—';
  const maDistPct = maPrice > 0 ? ((price - maPrice) / price) * 100 : 0;

  // Kvadratická váha: MA blízko ceny → váha ~0 (dominuje ATR/RSI hĺbka).
  const ratio = targetDepthPct > 0 ? clamp(maDistPct / targetDepthPct, 0, 1.8) : 0;
  const maWeight = maPrice > 0
    ? MAX_MA_WEIGHT * (Math.min(ratio, 1) ** 2)
    : 0;

  const blended = targetDepthPct * (1 - maWeight) + maDistPct * maWeight;
  // Nikdy nespadneme pod ATR/RSI hĺbku o viac než 15 %, a max 1.8× nad ňu.
  const discountPct = clamp(
    clamp(blended, targetDepthPct * 0.85, targetDepthPct * 1.8),
    MIN_DEPTH_PCT,
    MAX_DEPTH_PCT,
  );

  const limitPrice = price * (1 - discountPct / 100);
  const lucrativeness = clamp((discountPct / Math.max(atrPct, 0.01) - 0.7) / 1.1, 0, 1);

  const maTxt = maPrice > 0
    ? maWeight < 0.08
      ? `${maLabel} je len −${maDistPct.toFixed(2)} % pod cenou → jej váha je potlačená (${(maWeight * 100).toFixed(0)} %), aby zľava zostala štatisticky zmysluplná`
      : `zmiešané s ${maLabel} (${fmtPrice(maPrice)}, −${maDistPct.toFixed(2)} %) s váhou ${(maWeight * 100).toFixed(0)} %`
    : 'žiadna kĺzavá priemer pod cenou → 100 % ATR/RSI hĺbka';

  const explanation =
    `Plynulá kalkulácia: základ z dennej volatility (ATR ${atrPct.toFixed(2)} %), ` +
    `upravený náladou trhu (RSI ${rsi.toFixed(0)} → ${rsiMultiple.toFixed(2)}× ATR) ` +
    `pre cieľovú hĺbku −${targetDepthPct.toFixed(2)} %; ${maTxt}. ` +
    `Finálna zľava −${discountPct.toFixed(2)} % → limit ${fmtPrice(limitPrice)}.`;

  return {
    ok: true, atrPct, rsi, targetDepthPct, rsiMultiple,
    maPrice, maLabel, maDistPct, maWeight,
    discountPct, limitPrice, lucrativeness, explanation,
  };
}

/**
 * Plynulý posun alokácie do LMT podľa lukratívnosti zľavy.
 * Žiadne stupne — lineárne od základného splitu po strop 70 %.
 */
export function continuousLimitAllocPct(baseLimitPct: number, lucrativeness: number): number {
  const target = Math.max(baseLimitPct, MAX_LIMIT_ALLOC_PCT);
  const shifted = baseLimitPct + (target - baseLimitPct) * clamp(lucrativeness, 0, 1);
  return Math.round(clamp(shifted, 0, MAX_LIMIT_ALLOC_PCT));
}
