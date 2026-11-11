/** Global UI number formatting — no displayed value ever exceeds 4 decimals. */
const ok = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
/** Crypto quantity: fixed 4 decimals (0.0796). */
export const fmtQty = (n?: number | null, d = 4) => (ok(n) ? n.toFixed(Math.min(4, d)) : '—');
/** Large USD price: whole dollars ($76 098). */
export const fmtUsd0 = (n?: number | null) => (ok(n) ? `$${n.toLocaleString('sk-SK', { maximumFractionDigits: 0 })}` : '…');
/** Small USD/EUR amount: 2 decimals ($152,46). */
export const fmtUsd2 = (n?: number | null, cur = '$') => (ok(n) ? `${cur}${n.toLocaleString('sk-SK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '…');
/** Indicator / rate: 1–4 decimals. */
export const fmtInd = (n?: number | null, d = 2) => (ok(n) ? n.toFixed(Math.max(1, Math.min(4, d))) : '—');
