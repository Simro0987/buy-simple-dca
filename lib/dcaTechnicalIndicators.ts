export interface OhlcBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Linear map: `value` at `low` → `scoreAtLow`, at `high` → `scoreAtHigh` */
export function lerpScore(
  value: number,
  low: number,
  high: number,
  scoreAtLow: number,
  scoreAtHigh: number,
): number {
  if (high === low) return (scoreAtLow + scoreAtHigh) / 2;
  const t = clamp((value - low) / (high - low), 0, 1);
  return scoreAtLow + t * (scoreAtHigh - scoreAtLow);
}

export function computeSma(values: number[], period: number): number {
  const slice = values.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

export function computeEma(values: number[], period: number): number {
  if (values.length < period) return 0;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

export function computeRsi14(closes: number[]): number {
  if (closes.length < 16) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= 14; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / 14;
  let avgLoss = losses / 14;
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * 13 + g) / 14;
    avgLoss = (avgLoss * 13 + l) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return clamp(100 - 100 / (1 + rs), 0, 100);
}

export function computeAtr14Pct(bars: OhlcBar[]): number {
  if (bars.length < 16) return 2;
  const trs: number[] = [];
  for (let i = bars.length - 14; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (pc > 0) trs.push((tr / pc) * 100);
  }
  return trs.length > 0
    ? trs.reduce((sum, v) => sum + v, 0) / trs.length
    : 2;
}

/** Latest daily true range as % of prior close — for Black Swan ATR spike detection. */
export function computeDailyAtrPct(bars: OhlcBar[]): number {
  if (bars.length < 2) return 0;
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  if (prev.close <= 0) return 0;
  const tr = Math.max(
    last.high - last.low,
    Math.abs(last.high - prev.close),
    Math.abs(last.low - prev.close),
  );
  return (tr / prev.close) * 100;
}

/** Approximate 24h change from the last two daily closes. */
export function computeChange24hPct(bars: OhlcBar[]): number {
  if (bars.length < 2) return 0;
  const prev = bars[bars.length - 2].close;
  const last = bars[bars.length - 1].close;
  if (prev <= 0) return 0;
  return ((last - prev) / prev) * 100;
}
