/**
 * Advanced Dynamic Take-Profit (Harvest) & Portfolio Rotation Engine.
 *
 * Pure math + mapping layer — no React, no fetching.
 * Mirrored (identical formulas) in `supabase/functions/_shared/harvestEngine.ts`
 * so the Telegram Daily Report and the Portfolio UI never disagree.
 *
 * Scoring: 10 layers → weighted 0–10 conviction score.
 * Take-Profit: smooth, continuous interpolation (no static brackets).
 * Routing: BTC → stablecoin · altcoins → wBTC on Arbitrum.
 */

import { computeFundamentals, type FundamentalMetrics, type FundamentalResult } from '@/lib/fundamentals';

export const HARVEST_TOKENS = ['BTC', 'ETH', 'SOL', 'HYPE', 'AAVE', 'LINK'] as const;
export type HarvestToken = typeof HARVEST_TOKENS[number];

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);
/** Maps x from [x0,x1] onto [y0,y1], clamped — the continuous building block. */
export const mapRange = (x: number, x0: number, x1: number, y0: number, y1: number) =>
  x1 === x0 ? y0 : lerp(y0, y1, (x - x0) / (x1 - x0));

// ── Token-specific fundamental tracking ──────────────────────────────────────

export interface FundamentalSpec {
  /** Metrics that define the fundamental leg for this token (what we track live). */
  metrics: string[];
  /**
   * Long-term thesis conviction 0–10 (layer 1).
   * This is the user's strategy policy, not market data — every other layer,
   * including fundamentals and tokenomics, is computed from live APIs.
   */
  thesis: number;
}

export const FUNDAMENTALS: Record<HarvestToken, FundamentalSpec> = {
  BTC: { metrics: ['MVRV / cena vs 365D', 'Fees', 'Chain TVL', 'MCap/FDV', 'Obrat'], thesis: 9.6 },
  ETH: { metrics: ['Fees & burn', 'Chain TVL 30D', 'MCap/TVL', 'Obrat'], thesis: 9.0 },
  SOL: { metrics: ['Fees (DEX aktivita)', 'Chain TVL 30D', 'MCap/TVL', 'Obrat'], thesis: 8.4 },
  HYPE: { metrics: ['Perp fees', 'HyperEVM TVL 30D', 'MCap/FDV (unlocky)', 'Obrat'], thesis: 7.2 },
  AAVE: { metrics: ['Fees & revenue', 'Protocol TVL', 'MCap/TVL', 'Float'], thesis: 7.8 },
  
  LINK: { metrics: ['Oracle/CCIP fees', 'Revenue share', 'Float', 'Obrat'], thesis: 8.0 },
};

// ── Scoring input ────────────────────────────────────────────────────────────

export interface HarvestInput {
  token: HarvestToken;
  price: number;
  /** Wilder RSI(14) on daily closes. */
  rsi14: number;
  /** 200D SMA (0 when history is short). */
  sma200: number;
  /** 50D EMA. */
  ema50: number;
  /** Distance from SMA200 in %. */
  smaDistPct: number;
  /** ATR(14) as % of price. */
  atrPct: number;
  /** 30D price change in %. */
  change30dPct: number;
  /** 90D price change in % (valuation/cycle leg). */
  change90dPct: number;
  /** BTC 30D change in % — relative-strength benchmark. */
  btcChange30dPct: number;
  /** BTC distance from its 200D SMA — market regime input. */
  btcSmaDistPct: number;
  /** Volume of the last 7 sessions vs. the previous 30 sessions (ratio, 1 = flat). */
  volumeTrend: number;
  /** Drawdown from the 365D high in % (negative number). */
  drawdownPct: number;
  /** Fear & Greed index 0–100. */
  fearGreed: number;
  /** True when live candles were unavailable and proxies are degraded. */
  degraded?: boolean;
  /** Number of daily candles available (drives the Lite-model normalization). */
  historyDays?: number;
  /** Live fundamentals (DefiLlama / CoinGecko / Binance — free tier only). No mock fallback. */
  fundamentals?: FundamentalMetrics | null;
  /** Real unrealized PnL % of the actual position (null when not configured). */
  unrealizedPnlPct?: number | null;
  /** BTC only — MVRV Z-Score (CoinMetrics / Mayer proxy). */
  mvrvZ?: number | null;
}


export interface LayerScore { key: string; label: string; score: number; weight: number; note: string; }

export type HarvestCategory = 'A' | 'WATCH' | 'B' | 'C' | 'D';

export interface HarvestVerdict {
  token: HarvestToken;
  /** 0–10 conviction score. */
  score: number;
  category: HarvestCategory;
  categoryLabel: string;
  /** Continuous recommended take-profit percentage of the position. */
  tpPct: number;
  /** 0–100 overheat / temperature. */
  overheat: number;
  /** Slovak "Kedy vybrať" line. */
  whenText: string;
  /** Slovak "Koľko vybrať" line. */
  howMuchText: string;
  routing: RoutingTarget;
  layers: LayerScore[];
  degraded: boolean;
  /** True when the overheat score was normalized from partial data ("Lite model"). */
  liteModel: boolean;
  /** Available factor weight of the overheat model (0..1). */
  overheatCoverage: number;
  /** Names of the factors that were unavailable. */
  missingFactors: string[];

  /** Live fundamental breakdown, null when every endpoint failed. */
  fundamentals: FundamentalResult | null;
  /** Real unrealized PnL % used for the guard (null when not configured). */
  unrealizedPnlPct: number | null;
  /** True when a TP recommendation was blocked by the negative-PnL rule. */
  pnlGated: boolean;
}

export interface RoutingTarget {
  kind: 'stable' | 'wbtc';
  /** Display tag, e.g. "wBTC (ARB)". */
  label: string;
  network: string;
  note: string;
}

export function routingFor(token: HarvestToken): RoutingTarget {
  if (token === 'BTC') {
    return {
      kind: 'stable',
      label: 'USDC / USDT',
      network: 'Arbitrum / Ethereum',
      note: 'BTC zisky idú do stablecoinu — BTC sám seba nekupuje.',
    };
  }
  return {
    kind: 'wbtc',
    label: 'wBTC (ARB)',
    network: 'Arbitrum One',
    note: 'Altcoin zisky rotujú do wBTC na Arbitrume (cieľ: 1 BTC).',
  };
}

// ── 10-layer scoring ─────────────────────────────────────────────────────────

const WEIGHTS: Record<string, number> = {
  thesis: 1.4,
  fundamentals: 1.4,
  valuation: 1.3,
  regime: 1.1,
  relStrength: 1.0,
  momentum: 1.0,
  tokenomics: 0.8,
  onchain: 0.8,
  sentiment: 0.6,
  technical: 1.6,
};

export function computeLayers(i: HarvestInput): LayerScore[] {
  // Nové (dynamicky pridané) tokeny nemajú vlastný fundamentálny profil —
  // použije sa neutrálna téza, aby karta nikdy nespadla na undefined.
  const spec = FUNDAMENTALS[i.token] ?? { metrics: [], thesis: 6.5 };


  // 1 · Thesis — long-term conviction, slightly cut if the trend broke down hard.
  const thesisPenalty = i.smaDistPct < -35 ? mapRange(i.smaDistPct, -35, -70, 0, 3) : 0;
  const thesis = clamp(spec.thesis - thesisPenalty, 0, 10);

  // 2 · Fundamentals — 100 % live (DefiLlama fees/revenue/TVL + CoinGecko caps).
  const fund = i.fundamentals ? computeFundamentals(i.fundamentals) : null;
  const fundamentals = fund?.score ?? 0;
  const fundamentalsWeight = fund?.score != null ? WEIGHTS.fundamentals : 0;

  // 3 · Valuation — cheap far below SMA200, expensive when stretched above.
  const valuation = clamp(
    mapRange(i.smaDistPct, -40, 90, 10, 0.5) - mapRange(i.change90dPct, 40, 200, 0, 2),
    0, 10,
  );

  // 4 · Market regime — driven by BTC vs. its own 200D SMA.
  const regime = clamp(mapRange(i.btcSmaDistPct, -25, 60, 2, 9.5), 0, 10);

  // 5 · Relative strength vs BTC (30D).
  const rs = i.change30dPct - i.btcChange30dPct;
  const relStrength = i.token === 'BTC' ? 6.5 : clamp(mapRange(rs, -25, 25, 2, 9), 0, 10);

  // 6 · Momentum — price vs. 50D EMA, tempered by 30D change.
  const emaDist = i.ema50 > 0 ? ((i.price - i.ema50) / i.ema50) * 100 : 0;
  const momentum = clamp(
    mapRange(emaDist, -18, 18, 2.5, 8.5) * 0.6 + mapRange(i.change30dPct, -30, 45, 2, 9) * 0.4,
    0, 10,
  );

  // 7 · Tokenomics — live float (MCap/FDV) + revenue capture legs.
  const tokLegs = (fund?.legs ?? []).filter((l) => l.key === 'float' || l.key === 'revenueQuality');
  const tokenomics = tokLegs.length
    ? tokLegs.reduce((s, l) => s + l.score, 0) / tokLegs.length
    : 0;
  const tokenomicsWeight = tokLegs.length ? WEIGHTS.tokenomics : 0;

  // 8 · On-chain / usage proxy — volume expansion with trend confirmation.
  const onchain = clamp(
    mapRange(i.volumeTrend, 0.5, 1.8, 3, 9) * 0.7 + mapRange(i.smaDistPct, -30, 30, 3, 8) * 0.3,
    0, 10,
  );

  // 9 · Sentiment — euphoria is a sell signal, fear is an accumulation signal.
  const sentiment = clamp(mapRange(i.fearGreed, 10, 90, 9, 1.5), 0, 10);

  // 10 · Technicals — RSI + stretch above SMA200 + volatility blow-off.
  const technical = clamp(
    mapRange(i.rsi14, 78, 38, 1, 9) * 0.6
    + mapRange(i.smaDistPct, 100, -20, 1, 8.5) * 0.3
    + mapRange(i.atrPct, 12, 2, 3, 8) * 0.1,
    0, 10,
  );

  // BTC stratégia: iba Sentiment, Technika (14D RSI) a Valuácia — altcoinové metriky skryté.
  if (i.token === 'BTC') {
    const rsiScore = clamp(mapRange(i.rsi14, 78, 30, 1, 9.5), 0, 10);
    const mvrvZ = i.mvrvZ;
    const valBtc = mvrvZ != null && Number.isFinite(mvrvZ)
      ? clamp(valuation * 0.5 + mapRange(mvrvZ, 7, -0.5, 0.5, 10) * 0.5, 0, 10) : valuation;
    return [
      { key: 'sentiment', label: 'Sentiment (Fear & Greed)', score: sentiment, weight: WEIGHTS.sentiment, note: `Fear & Greed ${Math.round(i.fearGreed)}` },
      { key: 'technical', label: 'Technika (14D RSI)', score: rsiScore, weight: WEIGHTS.technical, note: `RSI ${i.rsi14.toFixed(1)}` },
      { key: 'valuation', label: 'Valuácia (200D SMA + MVRV Z)', score: valBtc, weight: WEIGHTS.valuation, note: `${i.smaDistPct >= 0 ? '+' : ''}${i.smaDistPct.toFixed(1)} % vs 200D SMA${mvrvZ != null ? ` · MVRV Z ${mvrvZ.toFixed(2)}` : ''}` },
    ];
  }

  return [
    { key: 'thesis', label: 'Téza', score: thesis, weight: WEIGHTS.thesis, note: 'Dlhodobá konvikcia' },
    {
      key: 'fundamentals', label: 'Fundamenty', score: fundamentals, weight: fundamentalsWeight,
      note: fund
        ? `${fund.note}${fund.sources.length ? ` · ${fund.sources.join(' + ')}` : ''}`
        : '⛔️ Live fundamenty nedostupné',
    },
    { key: 'valuation', label: 'Valuácia', score: valuation, weight: WEIGHTS.valuation, note: `${i.smaDistPct >= 0 ? '+' : ''}${i.smaDistPct.toFixed(1)} % vs 200D SMA` },
    { key: 'regime', label: 'Režim trhu', score: regime, weight: WEIGHTS.regime, note: `BTC ${i.btcSmaDistPct >= 0 ? '+' : ''}${i.btcSmaDistPct.toFixed(1)} % vs 200D SMA` },
    { key: 'relStrength', label: 'Sila vs BTC', score: relStrength, weight: WEIGHTS.relStrength, note: `30D alfa ${rs >= 0 ? '+' : ''}${rs.toFixed(1)} %` },
    { key: 'momentum', label: 'Momentum', score: momentum, weight: WEIGHTS.momentum, note: `50D EMA ${emaDist >= 0 ? '+' : ''}${emaDist.toFixed(1)} %` },
    {
      key: 'tokenomics', label: 'Tokenomika', score: tokenomics, weight: tokenomicsWeight,
      note: tokLegs.length ? tokLegs.map((l) => l.detail).join(' · ') : '⛔️ Float/revenue dáta nedostupné',
    },
    { key: 'onchain', label: 'On-chain', score: onchain, weight: WEIGHTS.onchain, note: `Objem ×${i.volumeTrend.toFixed(2)}` },
    { key: 'sentiment', label: 'Sentiment', score: sentiment, weight: WEIGHTS.sentiment, note: `Fear & Greed ${Math.round(i.fearGreed)}` },
    { key: 'technical', label: 'Technika', score: technical, weight: WEIGHTS.technical, note: `RSI ${i.rsi14.toFixed(1)} · ATR ${i.atrPct.toFixed(2)} %` },
  ];
}

export function categorize(score: number): { category: HarvestCategory; label: string } {
  if (score >= 8) return { category: 'A', label: 'A — HOLD / AKUMULOVAŤ' };
  if (score >= 6) return { category: 'WATCH', label: 'WATCH / AKUMULOVAŤ' };
  if (score >= 4) return { category: 'B', label: 'B — ČIASTOČNÝ TAKE PROFIT' };
  if (score >= 2) return { category: 'C', label: 'C — AGRESÍVNY TAKE PROFIT' };
  return { category: 'D', label: 'D — EXIT / TÉZA ZLOMENÁ' };
}

/** Minimum real unrealized profit (%) before any TP is recommended. */
export const MIN_PROFIT_GATE_PCT = 15;

/**
 * Continuous score → base take-profit percentage.
 * Smooth exponential decay (no brackets, no steps): score 0 → ~45 %,
 * score 5 → ~2 %, score ≥ 9 → 0 %, with a soft taper at the top.
 */
export function tpPctFromScore(score: number): number {
  const s = clamp(score, 0, 10);
  const decay = 45 * Math.exp(-0.62 * s);
  const taper = clamp((9 - s) / 1.5, 0, 1);
  return clamp(decay * taper, 0, 60);
}

/**
 * Continuous PnL aggression multiplier.
 * Exactly 0 at the +15 % gate (so there is no jump when it opens) and then
 * grows fluidly with the real unrealized PnL, saturating around 1,6×.
 */
export function pnlAggression(pnlPct: number | null | undefined): number {
  if (pnlPct == null) return 0;
  const excess = pnlPct - MIN_PROFIT_GATE_PCT;
  if (excess <= 0) return 0;
  return 1.6 * (1 - Math.exp(-excess / 25));
}


/**
 * 0–100 temperature from RSI, SMA stretch, sentiment and volatility.
 *
 * Dynamic normalization: factors that could not be computed (short candle
 * history, missing 200D SMA, no ATR) are dropped from BOTH the numerator and
 * the denominator, so a young token like HYPE gets a fair score on the same
 * 0–100 scale instead of an artificially low one.
 */
export interface OverheatDetail {
  score: number;
  /** Share of the full factor weight that was actually available (0..1). */
  coverage: number;
  /** True when at least one factor was missing → "Lite model". */
  lite: boolean;
  usedFactors: string[];
  missingFactors: string[];
}

export function overheatDetail(i: HarvestInput): OverheatDetail {
  const days = i.historyDays ?? 400;
  const factors: Array<{ key: string; weight: number; value: number | null }> = [
    { key: 'RSI 14', weight: 0.45, value: days >= 20 ? mapRange(i.rsi14, 35, 85, 5, 95) : null },
    {
      key: '200D SMA',
      weight: 0.30,
      value: i.sma200 > 0 && days >= 60 ? mapRange(i.smaDistPct, -10, 90, 5, 95) : null,
    },
    { key: 'Fear & Greed', weight: 0.15, value: Number.isFinite(i.fearGreed) ? mapRange(i.fearGreed, 20, 90, 10, 90) : null },
    { key: 'ATR', weight: 0.10, value: i.atrPct > 0 ? mapRange(i.atrPct, 2, 12, 10, 80) : null },
  ];

  const used = factors.filter((f) => f.value != null);
  const availableWeight = used.reduce((s, f) => s + f.weight, 0);
  if (!availableWeight) {
    return { score: 0, coverage: 0, lite: true, usedFactors: [], missingFactors: factors.map((f) => f.key) };
  }

  const score = clamp(
    used.reduce((s, f) => s + (f.value as number) * f.weight, 0) / availableWeight,
    0, 100,
  );

  return {
    score,
    coverage: availableWeight,
    lite: used.length < factors.length,
    usedFactors: used.map((f) => f.key),
    missingFactors: factors.filter((f) => f.value == null).map((f) => f.key),
  };
}

export function overheatFromInput(i: HarvestInput): number {
  return overheatDetail(i).score;
}


export function whenTextFor(overheat: number, category: HarvestCategory): string {
  if (category === 'D') return '🚨 Téza zlomená — výber bez ohľadu na teplotu';
  if (overheat >= 85) return '🚨 Extrémna zóna — vyberať teraz';
  if (overheat >= 70) return '🔥 Silné prehriatie — vyberať po tranžiach';
  if (overheat >= 55) return '🔥 Mierne prehriatie — priprav si limitné výbery';
  if (overheat >= 35) return 'Trh je stabilný — držať, čakať na prehriatie';
  return '🧊 Chladná zóna — akumulovať, nevyberať';
}

/**
 * Full verdict for one token.
 *
 * STRICT RULE: a take-profit recommendation is only issued once the REAL
 * unrealized PnL crosses +15 %. Above that gate the percentage scales
 * continuously (exponential curve) with PnL and the overheat score — no
 * brackets, no steps. Zone D (thesis broken) is the only exit exception.
 */
export function computeHarvest(i: HarvestInput): HarvestVerdict {
  const layers = computeLayers(i);
  const totalW = layers.reduce((s, l) => s + l.weight, 0);
  const score = totalW > 0
    ? clamp(layers.reduce((s, l) => s + l.score * l.weight, 0) / totalW, 0, 10)
    : 0;
  const { category, label } = categorize(score);
  const oh = overheatDetail(i);
  const overheat = oh.score;

  // Continuous TP with a smooth overheat tilt (±35 %) — keeps values non-round.
  const base = tpPctFromScore(score);
  const tilt = 1 + mapRange(overheat, 30, 95, -0.25, 0.35);
  let tpPct = clamp(base * tilt, 0, 60);

  const pnlPct = i.unrealizedPnlPct ?? null;
  // Continuous aggression: 0 at +15 %, then fluid growth with PnL.
  const aggression = pnlAggression(pnlPct);
  const belowGate = category !== 'D' && (pnlPct == null || pnlPct < MIN_PROFIT_GATE_PCT);
  const pnlGated = belowGate && tpPct > 0;
  if (category === 'D') {
    // thesis broken → exit regardless of profit
  } else if (pnlGated) {
    tpPct = 0;
  } else {
    tpPct = clamp(tpPct * aggression, 0, 60);
  }

  const fundamentals = i.fundamentals ? computeFundamentals(i.fundamentals) : null;

  return {
    token: i.token,
    score,
    category,
    categoryLabel: label,
    tpPct,
    overheat,
    whenText: pnlGated
      ? `🔒 TP zablokované: Zisk pod limitom (+15 %)${pnlPct != null ? ` — teraz ${pnlPct.toFixed(2).replace('.', ',')} %` : ''}`
      : whenTextFor(overheat, category),
    howMuchText: pnlGated
      ? 'Odporúčaný výber: 0 % — TP zablokované: Zisk pod limitom (+15 %)'
      : tpPct < 0.05
        ? 'Odporúčaný výber: 0 % — držať celú pozíciu'
        : `Odporúčaný výber: ${tpPct.toFixed(2).replace('.', ',')} % pozície`,
    routing: routingFor(i.token),
    layers,
    degraded: !!i.degraded,
    liteModel: oh.lite || !!i.degraded,
    overheatCoverage: oh.coverage,
    missingFactors: oh.missingFactors,
    fundamentals,
    unrealizedPnlPct: pnlPct,
    pnlGated,
  };
}

// ── wBTC Risk Check ──────────────────────────────────────────────────────────

export interface WbtcRiskCheck { key: string; label: string; status: 'ok' | 'warn' | 'fail'; detail: string; }
export interface WbtcRiskReport {
  status: 'ok' | 'warn' | 'fail';
  verdict: string;
  checks: WbtcRiskCheck[];
}

export interface WbtcRiskInput {
  /** wBTC price on the routing venue (0 when unknown). */
  wbtcPrice: number;
  /** BTC spot price. */
  btcPrice: number;
  /** BTC ATR% — proxy for execution/slippage risk. */
  btcAtrPct: number;
}

/**
 * Custodian / bridge / smart-contract risk gate before confirming
 * an altcoin → wBTC (Arbitrum) rotation.
 */
export function checkWbtcRisk(i: WbtcRiskInput): WbtcRiskReport {
  const checks: WbtcRiskCheck[] = [];

  const pegDiff = i.btcPrice > 0 && i.wbtcPrice > 0
    ? ((i.wbtcPrice - i.btcPrice) / i.btcPrice) * 100
    : 0;
  const pegKnown = i.btcPrice > 0 && i.wbtcPrice > 0;
  checks.push({
    key: 'custodian',
    label: 'Kustódia (BitGo / peg 1:1)',
    status: !pegKnown ? 'warn' : Math.abs(pegDiff) > 1.5 ? 'fail' : Math.abs(pegDiff) > 0.5 ? 'warn' : 'ok',
    detail: pegKnown
      ? `wBTC/BTC odchýlka ${pegDiff >= 0 ? '+' : ''}${pegDiff.toFixed(2).replace('.', ',')} %`
      : 'Peg sa nepodarilo overiť — over cenu wBTC pred swapom',
  });

  checks.push({
    key: 'bridge',
    label: 'Bridge (Arbitrum canonical)',
    status: 'ok',
    detail: 'Kanonický Arbitrum bridge — bez third-party wrapperu; nepoužívaj exotické mosty',
  });

  checks.push({
    key: 'contract',
    label: 'Smart-contract riziko',
    status: 'ok',
    detail: 'wBTC ERC-20 je auditovaný a nemenný; swapuj len cez overený router',
  });

  checks.push({
    key: 'execution',
    label: 'Exekúcia / slippage',
    status: i.btcAtrPct > 8 ? 'warn' : 'ok',
    detail: `BTC ATR ${i.btcAtrPct.toFixed(2).replace('.', ',')} % — ${i.btcAtrPct > 8 ? 'rozdeľ swap na tranže' : 'swap naraz je v poriadku'}`,
  });

  const status: WbtcRiskReport['status'] = checks.some(c => c.status === 'fail')
    ? 'fail'
    : checks.some(c => c.status === 'warn') ? 'warn' : 'ok';

  return {
    status,
    verdict: status === 'ok'
      ? 'wBTC (ARB) routing je bezpečný — môžeš potvrdiť.'
      : status === 'warn'
        ? 'wBTC routing s výhradou — over peg a rozdeľ swap na tranže.'
        : 'wBTC routing zamietnutý — peg mimo tolerancie, presuň zisk do stablecoinu.',
    checks,
  };
}

// ── Contrarian check (anti confirmation-bias) ────────────────────────────────

/** "Kde je najväčšie riziko, že sa mýlime?" — derived from the actual verdicts. */
export function contrarianCheck(verdicts: HarvestVerdict[], input: Record<string, HarvestInput>): string {
  const selling = verdicts.filter(v => v.tpPct > 0.5).sort((a, b) => b.tpPct - a.tpPct);
  if (!selling.length) {
    return 'Držíme všetko — najväčšie riziko je, že cyklus vrcholí a my nevyberieme nič. '
      + 'Skontroluj, či RSI a odchýlka od 200D SMA nerastú rýchlejšie než skóre klesá.';
  }
  const top = selling[0];
  const ind = input[top.token];
  const strongTrend = ind && ind.smaDistPct > 15 && ind.change30dPct > 10;
  const parts = [
    `Najviac predávame *${top.token}* (${top.tpPct.toFixed(2).replace('.', ',')} %).`,
  ];
  if (strongTrend) {
    parts.push('Riziko: token je v silnom trende nad 200D SMA — predaj do sily môže znamenať '
      + 'ukrojenie zo víťaza a stratu zvyšku impulzu.');
  } else {
    parts.push('Riziko: skóre padá kvôli technike, nie fundamentom — môže ísť len o korekciu '
      + 'a predávame do slabosti (najhoršia cena).');
  }
  if (top.routing.kind === 'wbtc') {
    parts.push('Druhé riziko: rotácia do wBTC predpokladá, že BTC outperformuje — ak alt-season '
      + 'pokračuje, rotácia stojí výkonnosť.');
  } else {
    parts.push('Druhé riziko: držanie stablecoinu je pri pokračujúcom bull trende reálna strata kúpnej sily.');
  }
  return parts.join(' ');
}
