/**
 * DCA-Out Radar — pure business logic (Live Risk Score model).
 * UI lives in ModernPortfolioPage only.
 */
export type DcaToken = 'BTC' | 'ETH' | 'SOL';

export const DCA_TOKEN_COLORS: Record<DcaToken, string> = {
  BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF',
};
export const DCA_CG_ID: Record<DcaToken, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
};
export const DCA_SOURCES: Record<DcaToken, string[]> = {
  BTC: ['Hardware Wallet (Native BTC)'],
  ETH: ['Natívne ETH', 'rETH (Rocket Pool)', 'wstETH / weETH (ether.fi – Arbitrum)'],
  SOL: ['Natívne SOL', 'Marinade Native', 'INF (Sanctum)'],
};
export const DEFAULT_HOLD: Record<DcaToken, number> = {
  BTC: 0.0323276, ETH: 0.527723, SOL: 0,
};

export function loadDcaPrices(): Record<DcaToken, number> {
  try {
    const s = JSON.parse(localStorage.getItem('dca-out-avg-prices-v1') || '{}');
    return { BTC: 0, ETH: 0, SOL: 0, ...s };
  } catch { return { BTC: 0, ETH: 0, SOL: 0 }; }
}
export function saveDcaPrices(p: Record<DcaToken, number>) {
  try { localStorage.setItem('dca-out-avg-prices-v1', JSON.stringify(p)); } catch { /* quota */ }
}
export function loadCooldown(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('dca-out-cooldown-v1') || '{}'); } catch { return {}; }
}
export function saveCooldown(c: Record<string, number>) {
  try { localStorage.setItem('dca-out-cooldown-v1', JSON.stringify(c)); } catch { /* quota */ }
}
export function loadHoldings(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}'); } catch { return {}; }
}

export function calcRSI(closes: number[]): number {
  const p = 14;
  if (closes.length < p + 1) return 50;
  const sl = closes.slice(-(p + 1));
  let g = 0, l = 0;
  for (let i = 1; i < sl.length; i++) {
    const d = sl[i] - sl[i - 1];
    if (d > 0) g += d;
    else l -= d;
  }
  const ag = g / p, al = l / p;
  if (al === 0) return 99;
  return Math.round(Math.max(0, Math.min(100, 100 - 100 / (1 + ag / al))));
}

export async function fetchAllRSI(): Promise<Record<DcaToken, number>> {
  const fetch1 = async (sym: string): Promise<number> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      const ctrl = new AbortController();
      timeoutId = setTimeout(() => ctrl.abort(), 10_000);
      const r = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${sym}&interval=1d&limit=30`,
        { signal: ctrl.signal },
      );
      if (!r.ok) return 50;
      const d = await r.json() as [number, string, string, string, string, string, ...unknown[]][];
      return calcRSI(d.map(k => parseFloat(k[4])));
    } catch { return 50; }
    finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  };
  const [btc, eth, sol] = await Promise.all([fetch1('BTCUSDT'), fetch1('ETHUSDT'), fetch1('SOLUSDT')]);
  return { BTC: btc, ETH: eth, SOL: sol };
}

export function liveRiskScore(fg: number, rsi: number, pnlPct: number): number {
  return (fg * 0.4) + (rsi * 0.4) + (pnlPct * 0.2);
}

export function sellPctFromScore(score: number): number {
  if (score <= 30) return 0;
  if (score >= 85) return 15;
  const raw = 2 + ((score - 30) / (85 - 30)) * 13;
  return Math.round(raw * 10) / 10;
}

export type RadarStatus = 'ACCUMULATE' | 'HOLD' | 'SELL';

export function radarGlowClass(score: number, status: RadarStatus, sellPct: number): string {
  if (status !== 'SELL') return '';
  if (sellPct >= 10 || score >= 70) return 'shadow-[0_0_48px_-4px_rgba(239,68,68,0.55)] border-red-500/40 animate-pulse';
  if (sellPct >= 5 || score >= 50) return 'shadow-[0_0_32px_-6px_rgba(249,115,22,0.45)] border-orange-500/35';
  return 'shadow-[0_0_24px_-8px_rgba(168,85,247,0.35)]';
}

export function generateSellReason(fg: number, rsi: number, pnlPct: number, sym: DcaToken, score: number): string {
  const fgC = fg * 0.4;
  const rsiC = rsi * 0.4;
  const pnlC = pnlPct * 0.2;
  const max = Math.max(fgC, rsiC, pnlC);

  if (max === fgC && fg >= 70) {
    if (fg > 85) return `Extrémne trhové FOMO. Globálna eufória (F&G: ${fg}) ťahá trh na vrchol. PnL: +${pnlPct.toFixed(1)}%. Ideálny čas na zníženie rizika.`;
    return `Vysoká trhová eufória (F&G: ${fg}). PnL ${sym}: +${pnlPct.toFixed(1)}%. Odporúčam postupne znižovať expozíciu.`;
  }
  if (max === rsiC && rsi > 70) {
    const mktMood = fg < 45 ? 'globálny trh je ešte v neutrálnej zóne' : 'globálny trh rastie';
    return `Lokálna pumpa ${sym}. RSI(14d): ${rsi} – minca je prekúpená. ${mktMood} (F&G: ${fg}). PnL: +${pnlPct.toFixed(1)}%.`;
  }
  if (score < 50) return `Mierny rast. ${sym} +${pnlPct.toFixed(1)}%, F&G: ${fg}, RSI: ${rsi}. Plynulé odkrajovanie do Profit Reservoiru.`;
  return `Kombinovaný signál. F&G: ${fg}, RSI ${sym}: ${rsi}, PnL: +${pnlPct.toFixed(1)}%. Viacero indikátorov ukazuje na zníženie rizika.`;
}

export function confirmDcaSell(sym: DcaToken, sellQty: number, currentPrice: number) {
  const h = loadHoldings();
  const key = sym.toLowerCase();
  h[key] = Math.max(0, (h[key] ?? DEFAULT_HOLD[sym]) - sellQty);
  localStorage.setItem('smart-alloc-holdings', JSON.stringify(h));

  const soldUsd = sellQty * currentPrice;
  const prevCash = parseFloat(localStorage.getItem('free-cash') || '0') || 0;
  localStorage.setItem('free-cash', String(prevCash + soldUsd));

  const cd = loadCooldown();
  cd[sym] = currentPrice;
  saveCooldown(cd);

  window.dispatchEvent(new Event('portfolio-updated'));
}

export function computeTokenRadar(
  sym: DcaToken,
  currentPrice: number,
  rsi: number,
  fg: number,
  dcaPrice: number,
) {
  const holdings = loadHoldings();
  const hold = holdings[sym.toLowerCase()] ?? DEFAULT_HOLD[sym];
  const pnlPct = dcaPrice > 0 && currentPrice > 0 ? ((currentPrice - dcaPrice) / dcaPrice) * 100 : 0;
  const inProfit = pnlPct > 0;
  const score = inProfit ? liveRiskScore(fg, rsi, pnlPct) : 0;
  const sellPct = inProfit ? sellPctFromScore(score) : 0;
  const maxSell = hold * 0.85;
  const sellQtyRaw = hold * (sellPct / 100);
  const sellQty = Math.min(sellQtyRaw, maxSell);
  const moonOk = sellQty > 0 && sellQtyRaw <= maxSell;

  const cd = loadCooldown();
  const cdPrice = cd[sym] ?? 0;
  const cdActive = cdPrice > 0 && currentPrice < cdPrice * 1.05;

  const status: RadarStatus =
    !inProfit ? 'ACCUMULATE' :
    sellPct === 0 || cdActive || !moonOk ? 'HOLD' :
    'SELL';

  return {
    sym, hold, pnlPct, inProfit, score, sellPct, sellQty, moonOk,
    cdActive, cdPrice, status,
    reason: generateSellReason(fg, rsi, pnlPct, sym, score),
  };
}
