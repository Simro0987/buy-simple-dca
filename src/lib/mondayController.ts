// Monday Crypto DCA Controller — deterministic weekly capital allocation engine.
// No predictions, no AI. Pure rule-based mapping from market stress → execution plan.

import { TOKENS, MARKET_SPLIT, LIMIT_SPLIT, type PriceData } from './crypto';

export interface MondayInputs {
  capital: number;          // Total available capital this Monday (USD)
  btcPrice: number;         // BTC current price (USD)
  btc30dHigh: number;       // BTC 30-day high (USD)
  fearGreed: number;        // 0-100
  btcAbove200dMA: boolean;  // BTC trend vs 200D MA
}

export type StressBand = 'dip' | 'neutral' | 'risk_off' | 'panic';

export interface MondayPlan {
  stressScore: number;            // 0-100
  band: StressBand;
  regime: MarketRegime;           // named regime layer
  regimeReason: string;           // why this regime
  deploymentPct: number;          // 0.25 / 0.5 / 0.75 / 0.85 (after override)
  rawDeploymentPct: number;       // pre-override deployment (from stress band)
  investableUsd: number;          // capital * deploymentPct
  reservedUsd: number;            // capital - investableUsd
  marketUsd: number;              // 60% of investable
  limitUsd: number;               // 40% of investable
  rationale: string;              // WHY (short, deterministic)
  perAsset: AssetPlan[];
}

export interface AssetPlan {
  symbol: string;
  name: string;
  color: string;
  coingeckoId: string;
  weight: number;                 // 0.64 / 0.25 / 0.11
  marketUsd: number;
  limitUsd: number;
  currentPrice: number;
  limitPrice: number;             // 3-5% below current
  limitDiscountPct: number;       // 3, 4, or 5
  marketQty: number;
  limitQty: number;
}

// ----- STEP 1: Market Stress Score (0-100, higher = more stress) -----
// Components are aggregated internally and only the final score is exposed.
export function computeStressScore(inputs: MondayInputs): number {
  // 1. BTC distance from 30D high (0% drop = 0 stress, -30%+ drop = 100 stress)
  const dropPct = inputs.btc30dHigh > 0
    ? Math.max(0, (inputs.btc30dHigh - inputs.btcPrice) / inputs.btc30dHigh)
    : 0;
  const distScore = Math.min(100, (dropPct / 0.30) * 100);

  // 2. Fear & Greed: 0 (extreme fear) = 100 stress, 100 (extreme greed) = also stress
  // U-shape: stress is high at both extremes (panic AND euphoria)
  // - 0-30 (fear/panic): high stress
  // - 30-70 (neutral): low stress
  // - 70-100 (greed/euphoria): high stress (different kind, but still risk-off)
  const fg = inputs.fearGreed;
  let fgScore: number;
  if (fg <= 30) fgScore = ((30 - fg) / 30) * 100;
  else if (fg >= 70) fgScore = ((fg - 70) / 30) * 100;
  else fgScore = 0;

  // 3. BTC vs 200D MA: below = +20 stress baseline
  const maScore = inputs.btcAbove200dMA ? 0 : 60;

  // Weighted aggregate (drop is dominant, then F&G, then MA bias)
  const score = distScore * 0.5 + fgScore * 0.3 + maScore * 0.2;
  return Math.round(Math.max(0, Math.min(100, score)));
}

// ----- STEP 2: Deployment band -----
// 0–30  → 75% (dip / accumulation)
// 31–70 → 50% (neutral)
// 71–90 → 25% (risk-off / euphoria)
// 91–100 → 85% (crash / panic opportunity)
export function bandFor(score: number): { band: StressBand; pct: number } {
  if (score <= 30) return { band: 'dip', pct: 0.75 };
  if (score <= 70) return { band: 'neutral', pct: 0.50 };
  if (score <= 90) return { band: 'risk_off', pct: 0.25 };
  return { band: 'panic', pct: 0.85 };
}

export function rationaleFor(band: StressBand, score: number): string {
  switch (band) {
    case 'dip':
      return `Stress score ${score}/100 — pokojný trh / mierna korekcia. Akumulácia: nasadiť 75 % kapitálu.`;
    case 'neutral':
      return `Stress score ${score}/100 — neutrálny režim. Štandardné nasadenie 50 % kapitálu.`;
    case 'risk_off':
      return `Stress score ${score}/100 — euforia alebo riziko vrcholu. Defenzívne 25 % kapitálu, zvyšok držať v hotovosti.`;
    case 'panic':
      return `Stress score ${score}/100 — panika / krach. Príležitosť na vyššie nasadenie 85 % kapitálu.`;
  }
}

// Deterministic limit discount per asset (existing token configs use 0.97 / 0.96 / 0.95 → 3 / 4 / 5%)
function discountPctFor(coingeckoId: string): number {
  const t = TOKENS.find(x => x.coingeckoId === coingeckoId);
  if (!t) return 4;
  return Math.round((1 - t.limitDiscount) * 100);
}

// ----- STEP 3 + 4: Execution split & per-asset distribution -----
export function buildPlan(inputs: MondayInputs, prices?: PriceData): MondayPlan {
  const score = computeStressScore(inputs);
  const { band, pct: rawPct } = bandFor(score);
  const regimeRes = classifyRegime(inputs);
  // Apply regime cap if present (e.g. F&G>80 + ATH → max 25 %)
  const pct = typeof regimeRes.capPct === 'number' ? Math.min(rawPct, regimeRes.capPct) : rawPct;

  const investableUsd = inputs.capital * pct;
  const reservedUsd = inputs.capital - investableUsd;
  const marketUsd = investableUsd * MARKET_SPLIT;
  const limitUsd = investableUsd * LIMIT_SPLIT;

  const perAsset: AssetPlan[] = TOKENS.map(t => {
    const assetMarket = marketUsd * t.allocation;
    const assetLimit = limitUsd * t.allocation;
    const livePrice = prices?.[t.coingeckoId]?.usd;
    const currentPrice = livePrice && livePrice > 0
      ? livePrice
      : (t.coingeckoId === 'bitcoin' ? inputs.btcPrice : 0);
    const limitPrice = currentPrice * t.limitDiscount;
    return {
      symbol: t.symbol,
      name: t.name,
      color: t.color,
      coingeckoId: t.coingeckoId,
      weight: t.allocation,
      marketUsd: assetMarket,
      limitUsd: assetLimit,
      currentPrice,
      limitPrice,
      limitDiscountPct: discountPctFor(t.coingeckoId),
      marketQty: currentPrice > 0 ? assetMarket / currentPrice : 0,
      limitQty: limitPrice > 0 ? assetLimit / limitPrice : 0,
    };
  });

  return {
    stressScore: score,
    band,
    regime: regimeRes.regime,
    regimeReason: regimeRes.reason,
    deploymentPct: pct,
    rawDeploymentPct: rawPct,
    investableUsd,
    reservedUsd,
    marketUsd,
    limitUsd,
    rationale: rationaleFor(band, score),
    perAsset,
  };
}

// ----- Market Regime classification (named, on top of stress score) -----
// ACCUMULATION / NORMAL / DISTRIBUTION / STRESS_EVENT with override:
//   F&G > 80 AND BTC at ATH (within 2% of 30D high) → cap deployment at 25% (DISTRIBUTION).
export type MarketRegime = 'ACCUMULATION' | 'NORMAL' | 'DISTRIBUTION' | 'STRESS_EVENT';

export interface RegimeResult {
  regime: MarketRegime;
  reason: string;        // short SK explanation
  capPct?: number;       // optional override cap (e.g. 0.25)
}

export function classifyRegime(inputs: MondayInputs): RegimeResult {
  const dropPct = inputs.btc30dHigh > 0
    ? (inputs.btc30dHigh - inputs.btcPrice) / inputs.btc30dHigh
    : 0;
  const nearAth = dropPct <= 0.02; // within 2% of 30D high
  const fg = inputs.fearGreed;

  // Override: extreme greed at ATH → defenzíva
  if (fg > 80 && nearAth) {
    return {
      regime: 'DISTRIBUTION',
      reason: `F&G ${fg} (chamtivosť) + BTC pri ATH → max 25 % nasadenia.`,
      capPct: 0.25,
    };
  }

  // STRESS_EVENT: rýchly prepad ≥15 % od 30D high + extrémny strach
  if (dropPct >= 0.15 && fg < 25) {
    return {
      regime: 'STRESS_EVENT',
      reason: `BTC ${(dropPct * 100).toFixed(0)} % pod 30D high + extrémny strach (F&G ${fg}). Panika = príležitosť.`,
    };
  }

  // ACCUMULATION: pokles ≥10 %, F&G < 30, BTC nad 200D MA
  if (dropPct >= 0.10 && fg < 30 && inputs.btcAbove200dMA) {
    return {
      regime: 'ACCUMULATION',
      reason: `BTC ${(dropPct * 100).toFixed(0)} % pod 30D high, F&G ${fg}, nad 200D MA → akumulácia.`,
    };
  }

  // DISTRIBUTION: chamtivosť alebo BTC pod 200D MA / pri ATH
  if (fg > 70 || nearAth || !inputs.btcAbove200dMA) {
    const why = !inputs.btcAbove200dMA
      ? 'BTC pod 200D MA → defenzíva.'
      : nearAth
        ? `BTC pri ATH (≤2 % od 30D high), F&G ${fg} → redukcia rizika.`
        : `F&G ${fg} (chamtivosť) → redukcia rizika.`;
    return { regime: 'DISTRIBUTION', reason: why };
  }

  return {
    regime: 'NORMAL',
    reason: 'Bez extrémnych podmienok → štandardné nasadenie.',
  };
}

export function regimeLabel(r: MarketRegime): string {
  switch (r) {
    case 'ACCUMULATION': return 'AKUMULÁCIA';
    case 'NORMAL': return 'NORMÁL';
    case 'DISTRIBUTION': return 'DISTRIBÚCIA';
    case 'STRESS_EVENT': return 'STRESS EVENT';
  }
}

export function bandLabel(band: StressBand): string {
  switch (band) {
    case 'dip': return 'Akumulácia';
    case 'neutral': return 'Neutrál';
    case 'risk_off': return 'Defenzíva';
    case 'panic': return 'Príležitosť';
  }
}

// ----- History persistence -----
const HISTORY_KEY = 'monday-controller-history-v1';

export interface HistoryEntry {
  date: string;            // ISO Monday date
  inputs: MondayInputs;
  plan: {
    stressScore: number;
    band: StressBand;
    deploymentPct: number;
    investableUsd: number;
    reservedUsd: number;
  };
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry): HistoryEntry[] {
  const all = loadHistory();
  // Replace if same date already saved, else prepend
  const filtered = all.filter(h => h.date !== entry.date);
  const next = [entry, ...filtered].slice(0, 52); // keep last year
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

export function clearHistory(): void {
  localStorage.removeItem(HISTORY_KEY);
}

export function thisMondayIso(): string {
  const d = new Date();
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day + 6) % 7; // back to Monday
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function exportHistoryCsv(history: HistoryEntry[]): string {
  const headers = ['date', 'capital', 'btcPrice', 'btc30dHigh', 'fearGreed', 'above200dMA', 'stressScore', 'band', 'deploymentPct', 'investableUsd', 'reservedUsd'];
  const rows = history.map(h => [
    h.date,
    h.inputs.capital,
    h.inputs.btcPrice,
    h.inputs.btc30dHigh,
    h.inputs.fearGreed,
    h.inputs.btcAbove200dMA ? 'Y' : 'N',
    h.plan.stressScore,
    h.plan.band,
    h.plan.deploymentPct,
    h.plan.investableUsd.toFixed(2),
    h.plan.reservedUsd.toFixed(2),
  ].join(','));
  return [headers.join(','), ...rows].join('\n');
}
