/**
 * Jediný zdroj RSI(14) — Wilderov vzorec.
 * 1) Prvý avgGain/avgLoss = jednoduchý priemer ziskov/strát za prvých `period` zmien.
 * 2) Ďalej Wilderovo vyhladenie: avg = (avgPrev × (period−1) + current) / period.
 * RSI = 100 − 100 / (1 + avgGain / avgLoss). Vstup = zatváracie ceny v časovom poradí.
 */
export function wilderRsi(closes: number[], period = 14): number {
  const v = closes.filter(n => Number.isFinite(n) && n > 0);
  if (v.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = v[i] - v[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}
