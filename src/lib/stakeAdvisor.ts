// Network-aware staking + unstaking advisor.
// Pure, stateless math. Drives:
//  • routine quarterly staking recommendations (March/June/Sept/Dec, first weekend),
//  • deep-value override (score ≤ 25) → always active,
//  • overheated override (score > 55) → switch to Unstake engine,
//  • concentration risk (single protocol > 60% of staked asset),
//  • next-step routing (Swap for parabolic peaks, Lending for moderate overheating).
//
// STRICT POLICY:
//  • BTC never auto-prefills (manual entry only; badge only when liquid > $200).
//  • Every action is advisory — final signing happens on the hardware wallet.

import { Lang } from '@/lib/i18n';
import type { StakedEntry, LedgerSymbol } from '@/lib/stakingLedger';
import { getLiveApyMap } from '@/lib/stakeRoutingService';

export type AdvisorSymbol = 'BTC' | 'ETH' | 'SOL';

export interface AdvisorInput {
  symbol: AdvisorSymbol;
  liquidQty: number;
  pricePerUnit: number;
  marketScore: number;
  ledgerEntries?: StakedEntry[];
}

export interface AdvisorBreakdown {
  liquidQty: number;
  liquidUsd: number;
  gasBufferQty: number;
  gasBufferUsd: number;
  tradingReserveQty: number;
  tradingReserveUsd: number;
  recommendedQty: number;
  recommendedUsd: number;
  recommendedPct: number;
}

export interface ConcentrationInfo {
  triggered: boolean;
  dominantProtocol?: string;
  dominantPct?: number;
  recommendedProtocol: string;
  alternates: string[];
}

export interface AdvisorResult {
  symbol: AdvisorSymbol;
  eligible: boolean;
  zone: 'accumulation' | 'transition' | 'overheated';
  manualOnly: boolean;
  breakdown: AdvisorBreakdown;
  concentration: ConcentrationInfo;
}

// ===== Constants =====
const GAS_BUFFER: Record<AdvisorSymbol, number> = { BTC: 0, ETH: 0.02, SOL: 0.1 };
const DUST_USD: Record<AdvisorSymbol, number> = { BTC: 200, ETH: 30, SOL: 5 };
const DECIMALS: Record<AdvisorSymbol, number> = { BTC: 4, ETH: 3, SOL: 2 };

// Default + diversification protocols (match stakingLedger PROTOCOL_PRESETS).
const PROTOCOL_DEFAULTS: Record<AdvisorSymbol, { primary: string; fallback: string; alternates: string[] }> = {
  ETH: { primary: 'Rocket Pool (rETH)',     fallback: 'ether.fi (weETH)',    alternates: ['Kiln (Solo Manage)', 'Aave V3 Lending'] },
  SOL: { primary: 'Marinade Native (mSOL)', fallback: 'Sanctum INF (INF)',   alternates: ['Kamino Autopilot'] },
  BTC: { primary: 'Babylon Staking',        fallback: 'Babylon Staking',     alternates: ['Lombard LBTC', 'Morpho Blue LBTC'] },
};

// ===== Curve & zones =====
export function curvePct(score: number): number {
  if (score <= 25) return 90;
  if (score >= 55) return 0;
  return 90 * (1 - (score - 25) / 30);
}

export function zoneFromScore(score: number): AdvisorResult['zone'] {
  if (score <= 25) return 'accumulation';
  if (score > 55) return 'overheated';
  return 'transition';
}

export function roundQty(symbol: AdvisorSymbol, qty: number): number {
  const d = DECIMALS[symbol];
  const f = Math.pow(10, d);
  return Math.floor(qty * f) / f;
}

// ===== Concentration check =====
export function computeConcentration(symbol: AdvisorSymbol, entries: StakedEntry[] = []): ConcentrationInfo {
  const sameAsset = entries.filter(e => e.symbol === symbol);
  const total = sameAsset.reduce((s, e) => s + e.amount, 0);
  const defaults = PROTOCOL_DEFAULTS[symbol];
  if (total <= 0) {
    return { triggered: false, recommendedProtocol: defaults.primary, alternates: defaults.alternates };
  }
  // Aggregate by protocol.
  const byProto = new Map<string, number>();
  for (const e of sameAsset) byProto.set(e.protocol, (byProto.get(e.protocol) ?? 0) + e.amount);
  let dominantProtocol: string | undefined;
  let dominantPct = 0;
  for (const [proto, amt] of byProto) {
    const pct = (amt / total) * 100;
    if (pct > dominantPct) { dominantPct = pct; dominantProtocol = proto; }
  }
  const triggered = dominantPct > 60;
  // Recommend a diversification target if dominant matches primary.
  let recommended = defaults.primary;
  if (triggered && dominantProtocol) {
    if (dominantProtocol === defaults.primary) recommended = defaults.fallback;
    else {
      // pick first alternate that isn't already dominant
      recommended = defaults.alternates.find(a => a !== dominantProtocol) ?? defaults.fallback;
    }
  }
  return { triggered, dominantProtocol, dominantPct, recommendedProtocol: recommended, alternates: defaults.alternates };
}

// ===== Stake advice =====
export function computeAdvice(input: AdvisorInput): AdvisorResult {
  const { symbol, liquidQty, pricePerUnit, marketScore, ledgerEntries = [] } = input;
  const liquidUsd = liquidQty * pricePerUnit;
  const gasBufferQty = GAS_BUFFER[symbol];
  const gasBufferUsd = gasBufferQty * pricePerUnit;

  const postGasQty = Math.max(0, liquidQty - gasBufferQty);

  const zone = zoneFromScore(marketScore);
  const pctRaw = curvePct(marketScore);
  const manualOnly = symbol === 'BTC';
  const recommendedPct = manualOnly ? 0 : pctRaw;

  const recommendedQtyRaw = postGasQty * (recommendedPct / 100);
  const recommendedQty = roundQty(symbol, recommendedQtyRaw);
  const recommendedUsd = recommendedQty * pricePerUnit;

  const tradingReserveQty = Math.max(0, postGasQty - recommendedQtyRaw);
  const tradingReserveUsd = tradingReserveQty * pricePerUnit;

  let eligible = false;
  if (zone === 'overheated') eligible = false;
  else if (manualOnly) eligible = liquidUsd >= DUST_USD.BTC;
  else eligible = recommendedUsd >= DUST_USD[symbol] && recommendedQty > 0;

  const concentration = computeConcentration(symbol, ledgerEntries);

  return {
    symbol,
    eligible,
    zone,
    manualOnly,
    breakdown: {
      liquidQty, liquidUsd,
      gasBufferQty, gasBufferUsd,
      tradingReserveQty, tradingReserveUsd,
      recommendedQty, recommendedUsd, recommendedPct,
    },
    concentration,
  };
}

// ===== Calendar timing window =====
export type WindowPhase = 'overheated' | 'value' | 'open' | 'preview' | 'closed';

export interface TimingWindow {
  phase: WindowPhase;
  locked: boolean;          // controls actions
  visible: boolean;         // controls card render
  reason: 'override-overheated' | 'override-value' | 'weekend-open' | 'weekend-preview' | 'out-of-window';
  firstWeekendISO?: string; // for UI hint
  daysRemaining?: number;   // days until the NEXT quarterly first-Saturday window opens
  inQuarterlyMonth?: boolean;
}

const QUARTERLY_MONTH_INDICES = [2, 5, 8, 11]; // Mar, Jun, Sep, Dec (0-based)

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function firstWeekend(year: number, monthIndex: number): Date {
  // monthIndex 0..11. Returns the FIRST Saturday of that month.
  for (let d = 1; d <= 7; d++) {
    const dt = new Date(year, monthIndex, d);
    if (dt.getDay() === 6) return dt;
  }
  return new Date(year, monthIndex, 1);
}

// Returns the next first-Saturday of a quarterly month at or after `now`.
function nextQuarterlyFirstSaturday(now: Date): Date {
  const today = startOfDay(now);
  for (let y = now.getFullYear(); y <= now.getFullYear() + 1; y++) {
    for (const m of QUARTERLY_MONTH_INDICES) {
      const sat = firstWeekend(y, m);
      if (sat.getTime() >= today.getTime()) return sat;
    }
  }
  return firstWeekend(now.getFullYear() + 1, QUARTERLY_MONTH_INDICES[0]);
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.ceil((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000));
}

// ===== Emergency bypass — overrides time-lock, instantly opens the window =====
const BYPASS_KEY = 'stake-emergency-bypass-v1';
export function isEmergencyBypassActive(): boolean {
  try {
    const raw = localStorage.getItem(BYPASS_KEY);
    if (!raw) return false;
    const ts = Number(raw);
    if (!Number.isFinite(ts)) return false;
    // bypass auto-expires after 24h to prevent permanently leaving the lock open
    return Date.now() - ts < 24 * 3600 * 1000;
  } catch { return false; }
}
export function setEmergencyBypass(active: boolean): void {
  try {
    if (active) localStorage.setItem(BYPASS_KEY, String(Date.now()));
    else localStorage.removeItem(BYPASS_KEY);
    window.dispatchEvent(new CustomEvent('stake-bypass-changed', { detail: active }));
  } catch { /* noop */ }
}

export function getTimingWindow(score: number, now: Date = new Date()): TimingWindow {
  // Compute next quarterly-Saturday window + days remaining (used by all branches).
  const nextSat = nextQuarterlyFirstSaturday(now);
  const daysRemaining = daysBetween(now, nextSat);
  const monthIdx = now.getMonth();
  const isQuarterly = QUARTERLY_MONTH_INDICES.includes(monthIdx);
  const thisMonthSat = isQuarterly ? firstWeekend(now.getFullYear(), monthIdx) : null;
  const inQuarterlyMonth = isQuarterly;

  // Emergency bypass — manual override forces the window open
  if (isEmergencyBypassActive()) {
    return {
      phase: 'open', locked: false, visible: true, reason: 'weekend-open',
      firstWeekendISO: thisMonthSat?.toISOString() ?? nextSat.toISOString(),
      daysRemaining: 0, inQuarterlyMonth,
    };
  }

  // Override: overheated forces Unstake UI regardless of calendar.
  if (score > 55) {
    return {
      phase: 'overheated', locked: false, visible: true, reason: 'override-overheated',
      daysRemaining, inQuarterlyMonth,
    };
  }
  // Override: deep-value bypasses calendar and weekend rules entirely.
  if (score <= 25) {
    return {
      phase: 'value', locked: false, visible: true, reason: 'override-value',
      daysRemaining, inQuarterlyMonth,
    };
  }
  // Window open: ONLY during the first-Saturday + first-Sunday of the quarterly month.
  // After Sunday (i.e. from Monday onwards) the window closes and we fall back to muted preview/countdown.
  if (isQuarterly && thisMonthSat) {
    const satStart = startOfDay(thisMonthSat).getTime();
    const monStart = satStart + 2 * 86_400_000; // exclusive — covers Sat (0d) and Sun (1d) only
    const t = startOfDay(now).getTime();
    if (t >= satStart && t < monStart) {
      return {
        phase: 'open', locked: false, visible: true, reason: 'weekend-open',
        firstWeekendISO: thisMonthSat.toISOString(),
        daysRemaining: 0, inQuarterlyMonth,
      };
    }
  }
  // Otherwise PREVIEW — always visible, muted, with a live countdown until the next
  // first-Saturday of the next quarterly month (even when we are outside Mar/Jun/Sep/Dec).
  return {
    phase: 'preview', locked: true, visible: true, reason: 'weekend-preview',
    firstWeekendISO: nextSat.toISOString(),
    daysRemaining, inQuarterlyMonth,
  };
}

// ===== Unstake engine (score > 55) =====
export interface UnstakeAdvice {
  symbol: AdvisorSymbol;
  protocol: string;
  unstakeQty: number;
  unstakePct: number;       // 0..100 of that protocol's balance
  protocolBalance: number;
  nextStep: 'swap' | 'lending';
  score: number;
}

export function unstakeCurvePct(score: number): number {
  if (score <= 55) return 0;
  if (score >= 80) return 100;
  // 56 → 10%, linear up to 80 → 100%
  // Anchor: at 56 → 10, at 80 → 100. slope = 90/24 = 3.75 per point
  const pct = 10 + (score - 56) * (90 / 24);
  return Math.max(10, Math.min(100, pct));
}

export function nextStepFromScore(score: number): 'swap' | 'lending' {
  return score > 70 ? 'swap' : 'lending';
}

export function computeUnstakeAdvice(
  symbol: AdvisorSymbol,
  ledgerEntries: StakedEntry[],
  score: number,
): UnstakeAdvice | null {
  if (score <= 55 || symbol === 'BTC') return null; // BTC unstake stays manual (Babylon long unbonding)
  const sameAsset = ledgerEntries.filter(e => e.symbol === symbol);
  if (sameAsset.length === 0) return null;
  // Find protocol with the HIGHEST concentration.
  const byProto = new Map<string, number>();
  for (const e of sameAsset) byProto.set(e.protocol, (byProto.get(e.protocol) ?? 0) + e.amount);
  let topProto = ''; let topAmt = 0;
  for (const [p, a] of byProto) { if (a > topAmt) { topAmt = a; topProto = p; } }
  if (!topProto || topAmt <= 0) return null;
  const pct = unstakeCurvePct(score);
  const unstakeQty = roundQty(symbol, topAmt * (pct / 100));
  if (unstakeQty <= 0) return null;
  return {
    symbol,
    protocol: topProto,
    unstakeQty,
    unstakePct: pct,
    protocolBalance: topAmt,
    nextStep: nextStepFromScore(score),
    score,
  };
}

// ===== Commentary =====
export function strategyCommentary(
  score: number,
  lang: Lang,
  ctx?: { concentration?: ConcentrationInfo; phase?: WindowPhase },
): { icon: string; text: string } {
  const sk = lang === 'sk';
  const conc = ctx?.concentration;
  if (conc?.triggered && score <= 55 && score > 25) {
    return {
      icon: '⚠️',
      text: sk
        ? `Odporúčame diverzifikáciu do protokolu ${conc.recommendedProtocol} z dôvodu riadenia rizika. Tvoja expozícia v protokole ${conc.dominantProtocol} presiahla 60%, chránime portfólio pred zlyhaním jedného smart kontraktu.`
        : `We recommend diversifying into ${conc.recommendedProtocol}. Your exposure in ${conc.dominantProtocol} exceeds 60% — protecting the portfolio from single-contract failure.`,
    };
  }
  if (score <= 25) {
    return {
      icon: '🟢',
      text: sk
        ? 'Trh je na dne cyklu (Kapitulácia). Override aktívny – kvartálne a víkendové pravidlá sú ignorované. Maximalizujeme pasívny príjem až do 90% voľného objemu.'
        : 'Market is at cycle bottom (capitulation). Override active — quarterly and weekend rules bypassed. Maximizing passive yield up to 90% of free balance.',
    };
  }
  if (score > 70) {
    return {
      icon: '🔴',
      text: sk
        ? `Trh je v parabolickom vrchole (${Math.round(score)}). Po dokončení Unstaku klikni na akčné tlačidlo pre okamžitý Swap do stablecoinov, čím definitívne uzamkneš zisky pred prepadom trhu.`
        : `Market is at a parabolic peak (${Math.round(score)}). After Unstake, click the action button for an immediate Swap into stablecoins to lock profits before the drop.`,
    };
  }
  if (score > 55) {
    return {
      icon: '🟠',
      text: sk
        ? 'Trh rástol príliš rýchlo. Odporúčame Unstake a následný presun na Lending / Liquidity, kde mince zarábajú, no ostávajú likvidné na okamžitý predaj bez čakania.'
        : 'Market rose too fast. Recommend Unstake then move to Lending / Liquidity — coins still earn but stay liquid for immediate sale.',
    };
  }
  if (ctx?.phase === 'preview') {
    return {
      icon: '🟡',
      text: sk
        ? 'Trh je v stabilnej kvartálnej fáze. Sme v aktuálnom kvartálnom okne, odporúčanie sa plne odomkne počas najbližšieho víkendu. Udržujeme vyvážený prístup.'
        : 'Market is in a stable quarterly phase. We are inside the quarterly window — recommendation fully unlocks during the upcoming weekend.',
    };
  }
  if (conc && !conc.triggered) {
    return {
      icon: '🟡',
      text: sk
        ? `Navýšenie tvojej existujúcej bezpečnej pozície v protokole ${conc.recommendedProtocol} pre zachovanie konzistentného on-chain výnosu.`
        : `Increasing your existing safe position in ${conc.recommendedProtocol} to maintain consistent on-chain yield.`,
    };
  }
  return {
    icon: '🟡',
    text: sk
      ? 'Trh je v stabilnej fáze. Udržujeme vyvážený prístup – väčšinu voľných mincí smerujeme do stakingu, ale plynule budujeme 25–30% likvidnú natívnu rezervu.'
      : 'Market is stable. Balanced approach — most coins go to staking while building a 25–30% native liquid reserve.',
  };
}

export function overheatedWarning(lang: Lang): string {
  return lang === 'sk'
    ? '⚠️ Trh je v prehriatej fáze. Nový staking sa neodporúča. Udržuj 100% natívnu likviditu pre okamžitý Take Profit odpredaj.'
    : '⚠️ Market is overheated. New staking is discouraged — keep 100% native liquidity for immediate take-profit selling.';
}

function dniLabel(n: number): string {
  if (n === 1) return 'deň';
  if (n >= 2 && n <= 4) return 'dni';
  return 'dní';
}

function daysLabel(n: number): string {
  return n === 1 ? 'day' : 'days';
}

export function previewWindowNote(lang: Lang, daysRemaining?: number): string {
  if (lang === 'sk') {
    if (typeof daysRemaining === 'number' && daysRemaining > 0) {
      return `🔒 Kvartálne okno sa plne aktivuje cez víkend (o ${daysRemaining} ${dniLabel(daysRemaining)}).`;
    }
    if (daysRemaining === 0) {
      return '🔒 Kvartálne okno sa otvára dnes.';
    }
    return '🔒 Kvartálne okno sa plne aktivuje cez víkend.';
  }
  if (typeof daysRemaining === 'number' && daysRemaining > 0) {
    return `🔒 Quarterly window fully unlocks on the upcoming weekend (in ${daysRemaining} ${daysLabel(daysRemaining)}).`;
  }
  if (daysRemaining === 0) {
    return '🔒 Quarterly window opens today.';
  }
  return '🔒 Quarterly window fully unlocks on the upcoming weekend.';
}

// ===== Dynamic Stake Split — Self-Learning Engine =====
// Replaces hardcoded 50/50 (SOL) and 60/40 (ETH) splits with a dynamic
// allocator driven by live APY differential + market-risk appetite.
// Targets are FIXED (per product requirements), only the percentages flex.
export type DynamicStakeSymbol = 'ETH' | 'SOL';

export interface DynamicStakeTarget {
  key: string;
  protocol: string;       // human label, e.g. "Marinade Native"
  outputToken: string;    // resulting LST, e.g. "mSOL"
  officialUrl: string;    // anti-phishing pinned domain
  apy: number;            // live (jittered) APY %
  pct: number;            // dynamic allocation % (0..100)
}

interface RawTarget { key: string; protocol: string; outputToken: string; officialUrl: string; apy: number; }

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

/**
 * Self-Learning split engine.
 *  - Anchor 50/50.
 *  - Yield tilt: skew toward whichever target shows higher live APY.
 *  - Risk-appetite tilt: low market score (accumulation) → chase yield (B);
 *    high market score (heating up) → prefer the more audited/conservative (A).
 * Output is clamped to 25..75 to preserve diversification at all times.
 */
function dynamicSplit(a: RawTarget, b: RawTarget, marketScore: number): DynamicStakeTarget[] {
  const yieldTilt = clamp((a.apy - b.apy) * 6, -22, 22);   // APY diff (%) → ±22
  const riskAppetite = clamp((40 - marketScore) * 0.4, -16, 16); // <40 → chase B
  let aPct = 50 + yieldTilt * 0.4 - riskAppetite * 0.6;
  aPct = clamp(aPct, 25, 75);
  const bPct = 100 - aPct;
  return [
    { ...a, pct: Math.round(aPct * 10) / 10 },
    { ...b, pct: Math.round(bPct * 10) / 10 },
  ];
}

export function computeDynamicStakeSplit(
  symbol: DynamicStakeSymbol,
  marketScore: number,
  tick: number,
): DynamicStakeTarget[] {
  const apys = getLiveApyMap(tick);
  if (symbol === 'SOL') {
    return dynamicSplit(
      { key: 'marinade_native', protocol: 'Marinade Native', outputToken: 'mSOL', officialUrl: 'marinade.finance', apy: apys.solMarinadeNative },
      { key: 'sanctum_inf',     protocol: 'Sanctum INF',     outputToken: 'INF',  officialUrl: 'sanctum.so',       apy: apys.solSanctumInf },
      marketScore,
    );
  }
  // ETH — Arbitrum rails
  return dynamicSplit(
    { key: 'rocket_pool', protocol: 'Rocket Pool (rETH)', outputToken: 'rETH',  officialUrl: 'rocketpool.net', apy: apys.ethRocketPool },
    { key: 'etherfi',     protocol: 'ether.fi (weETH)',   outputToken: 'weETH', officialUrl: 'ether.fi',       apy: apys.ethEtherfi },
    marketScore,
  );
}
