// MONEY MODE — self-evaluating performance engine.
// Tracks Plain DCA vs Smart DCA side-by-side using existing weekly history,
// computes risk/return metrics, and proposes deterministic parameter tweaks
// every 12 weeks within strict safe ranges.
//
// PURE & DETERMINISTIC. No predictions, no randomness.

import { TOKENS, type PriceData } from './crypto';
import type { HistoryEntry } from './mondayController';

// ============================================================
// Tunable parameters (auto-tuning lives within these bounds)
// ============================================================

export interface TuningParams {
  minAllocationPct: number;       // 22..35
  maxAllocationPct: number;       // 75..85
  confLowMult: number;            // 0.82..0.90
  confMedMult: number;            // 0.90..0.96
  confHighMult: number;           // fixed at 1.00
  limitDiscountDefaultPct: number;// 3..5
  highScoreReducerPct: number;    // 0..5  (subtract from base alloc when score > 75)
  maReclaimBonusPct: number;      // 0..5  (add when BTC reclaims 200D MA)
}

export const DEFAULT_TUNING: TuningParams = {
  minAllocationPct: 22,
  maxAllocationPct: 80,
  confLowMult: 0.85,
  confMedMult: 0.93,
  confHighMult: 1.00,
  limitDiscountDefaultPct: 4,
  highScoreReducerPct: 0,
  maReclaimBonusPct: 0,
};

export const TUNING_BOUNDS = {
  minAllocationPct:        { lo: 22, hi: 35 },
  maxAllocationPct:        { lo: 75, hi: 85 },
  confLowMult:             { lo: 0.82, hi: 0.90 },
  confMedMult:             { lo: 0.90, hi: 0.96 },
  confHighMult:            { lo: 1.00, hi: 1.00 },
  limitDiscountDefaultPct: { lo: 3, hi: 5 },
  highScoreReducerPct:     { lo: 0, hi: 5 },
  maReclaimBonusPct:       { lo: 0, hi: 5 },
} as const;

const TUNING_KEY = 'money-mode-tuning-v1';
const ENABLED_KEY = 'money-mode-autotune-enabled-v1';

export function loadTuning(): TuningParams {
  try {
    const raw = localStorage.getItem(TUNING_KEY);
    if (!raw) return DEFAULT_TUNING;
    return { ...DEFAULT_TUNING, ...JSON.parse(raw) };
  } catch { return DEFAULT_TUNING; }
}

export function saveTuning(t: TuningParams): void {
  localStorage.setItem(TUNING_KEY, JSON.stringify(t));
}

export function loadAutoTuneEnabled(): boolean {
  return localStorage.getItem(ENABLED_KEY) !== '0';
}

export function saveAutoTuneEnabled(on: boolean): void {
  localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ============================================================
// Strategy simulation
// ============================================================
//
// We replay the saved history (each entry has the Monday capital, BTC price,
// regime, and Smart deployment %). For each week we accumulate qty purchased
// per asset using the BTC price recorded that week. ETH and SOL prices for
// past weeks are not stored, so we approximate alt qty using proportional
// scaling from current prices (deterministic and stable).

const PORTFOLIO_WEIGHTS = { btc: 0.64, eth: 0.25, sol: 0.11 };

export interface WeekPoint {
  date: string;
  // Plain DCA leg
  plainContribUsd: number;
  plainCashUsd: number;
  plainPortfolioUsd: number;
  plainTotalValueUsd: number;     // portfolio + cash (always = total contributions for plain in nominal)
  // Smart DCA leg
  smartContribUsd: number;        // = capital that week (same as plain — deposits are equal)
  smartDeployedUsd: number;       // capital × deployment%
  smartCashUsd: number;
  smartPortfolioUsd: number;
  smartTotalValueUsd: number;
  // Shared
  btcPrice: number;
  smartDeploymentPct: number;
}

export interface MoneyModeReport {
  weeks: WeekPoint[];
  // Totals
  totalContributions: number;
  plainPortfolioUsd: number;
  plainTotalUsd: number;
  smartPortfolioUsd: number;
  smartTotalUsd: number;
  smartCashUsd: number;
  // Returns
  plainReturnPct: number;         // (total - contributions) / contributions
  smartReturnPct: number;
  returnDiffPct: number;          // smart - plain (percentage points)
  // Risk
  plainMaxDrawdownPct: number;
  smartMaxDrawdownPct: number;
  drawdownSavedPct: number;       // plainDD - smartDD (positive = smart safer)
  plainVolatilityPct: number;
  smartVolatilityPct: number;
  // Capital efficiency
  cashDragPct: number;            // smart cash / smart contributions
  capitalDeployedPct: number;     // 100 - cashDrag
  averageSmartDeploymentPct: number;
  // Sharpe-lite (return / vol)
  plainSharpeLite: number;
  smartSharpeLite: number;
  // Entry quality
  averageEntryImprovementPct: number; // smart avg btc entry vs plain avg btc entry
  buyTheDipScore: number;            // 0..100 — how much Smart over-deploys when BTC < 30D high
  deploymentEfficiency: number;      // 0..100 — return per $ deployed vs plain
  // Head-to-head
  weeksWon: number;                  // weeks where smart total > plain total
  weeksLost: number;
  // Verdict + recommendations
  status: 'winning' | 'neutral' | 'losing';
  recommendations: Recommendation[];
  proposedTuning: TuningParams | null;
  weeksUntilNextReview: number;      // 12-week cadence
}

export interface Recommendation {
  id: 'increase_min_alloc' | 'reduce_high_score' | 'add_reclaim_bonus' | 'keep_settings' | 'too_defensive' | 'cash_drag' | 'optimal';
  level: 'info' | 'good' | 'warn';
  text: string;
}

// ----- helpers -----

function maxDrawdown(values: number[]): number {
  if (values.length < 2) return 0;
  let peak = values[0];
  let maxDD = 0;
  for (const v of values) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (peak - v) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }
  return maxDD * 100;
}

function volatilityPct(values: number[]): number {
  if (values.length < 2) return 0;
  const rets: number[] = [];
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] > 0) rets.push((values[i] - values[i - 1]) / values[i - 1]);
  }
  if (!rets.length) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  return Math.sqrt(variance) * 100;
}

// ============================================================
// Build report from saved Monday history + live prices
// ============================================================

export function buildMoneyModeReport(
  history: HistoryEntry[],
  prices?: PriceData,
): MoneyModeReport {
  // History is stored newest-first → flip to chronological for the simulation.
  const weeks = [...history].reverse();

  const livePrice = (id: string) => prices?.[id]?.usd ?? 0;
  const btcLive = livePrice('bitcoin');
  const ethLive = livePrice('ethereum');
  const solLive = livePrice('solana');

  let plainQtyBtc = 0, plainQtyEth = 0, plainQtySol = 0;
  let smartQtyBtc = 0, smartQtyEth = 0, smartQtySol = 0;
  let plainCashTotal = 0, smartCashTotal = 0;
  let totalContrib = 0;
  let smartBtcSpend = 0, plainBtcSpend = 0;

  // Buy-the-dip tracker: when BTC sits well below recent peak, did Smart deploy more?
  let dipWeeks = 0, dipDeploySum = 0, normDeploySum = 0, normWeeks = 0;
  let weeksWon = 0, weeksLost = 0;

  // Track historical BTC peak across weeks for dip detection.
  let btcPeakSoFar = 0;

  const points: WeekPoint[] = weeks.map(h => {
    const cap = h.inputs.capital || 0;
    const btcWeek = h.inputs.btcPrice || btcLive || 0;
    // Estimate alt prices for this week proportionally to BTC's move from week price → current.
    const btcRatio = btcLive > 0 && btcWeek > 0 ? btcWeek / btcLive : 1;
    const ethWeek = ethLive * btcRatio;
    const solWeek = solLive * btcRatio;

    const deployFrac = h.plan.deploymentPct || 0;

    // PLAIN — invest 100 % every week at fixed weights.
    const plainBtcUsd = cap * PORTFOLIO_WEIGHTS.btc;
    const plainEthUsd = cap * PORTFOLIO_WEIGHTS.eth;
    const plainSolUsd = cap * PORTFOLIO_WEIGHTS.sol;
    if (btcWeek > 0) plainQtyBtc += plainBtcUsd / btcWeek;
    if (ethWeek > 0) plainQtyEth += plainEthUsd / ethWeek;
    if (solWeek > 0) plainQtySol += plainSolUsd / solWeek;
    plainBtcSpend += plainBtcUsd;
    // Plain has no cash — full deploy.

    // SMART — invest deployFrac, hold rest as cash reserve.
    const smartDeployed = cap * deployFrac;
    const smartReserve = cap - smartDeployed;
    smartCashTotal += smartReserve;
    const smartBtcUsd = smartDeployed * PORTFOLIO_WEIGHTS.btc;
    const smartEthUsd = smartDeployed * PORTFOLIO_WEIGHTS.eth;
    const smartSolUsd = smartDeployed * PORTFOLIO_WEIGHTS.sol;
    if (btcWeek > 0) smartQtyBtc += smartBtcUsd / btcWeek;
    if (ethWeek > 0) smartQtyEth += smartEthUsd / ethWeek;
    if (solWeek > 0) smartQtySol += smartSolUsd / solWeek;
    smartBtcSpend += smartBtcUsd;

    totalContrib += cap;

    // Mark-to-market values at current prices.
    const plainPort = plainQtyBtc * btcLive + plainQtyEth * ethLive + plainQtySol * solLive;
    const smartPort = smartQtyBtc * btcLive + smartQtyEth * ethLive + smartQtySol * solLive;
    const plainTotal = plainPort + plainCashTotal;       // = totalContrib basically
    const smartTotal = smartPort + smartCashTotal;

    if (smartTotal > plainTotal) weeksWon++; else if (smartTotal < plainTotal) weeksLost++;

    // Dip-vs-deploy correlation
    if (btcWeek > btcPeakSoFar) btcPeakSoFar = btcWeek;
    const distFromPeakPct = btcPeakSoFar > 0 ? (btcWeek / btcPeakSoFar - 1) * 100 : 0;
    if (distFromPeakPct <= -10) {
      dipWeeks++;
      dipDeploySum += deployFrac * 100;
    } else {
      normWeeks++;
      normDeploySum += deployFrac * 100;
    }

    return {
      date: h.date,
      plainContribUsd: cap,
      plainCashUsd: plainCashTotal,
      plainPortfolioUsd: plainPort,
      plainTotalValueUsd: plainTotal,
      smartContribUsd: cap,
      smartDeployedUsd: smartDeployed,
      smartCashUsd: smartCashTotal,
      smartPortfolioUsd: smartPort,
      smartTotalValueUsd: smartTotal,
      btcPrice: btcWeek,
      smartDeploymentPct: deployFrac * 100,
    };
  });

  const last = points[points.length - 1];
  const plainPort = last?.plainPortfolioUsd ?? 0;
  const smartPort = last?.smartPortfolioUsd ?? 0;
  const plainTot  = last?.plainTotalValueUsd ?? 0;
  const smartTot  = last?.smartTotalValueUsd ?? 0;

  const plainReturnPct = totalContrib > 0 ? ((plainTot - totalContrib) / totalContrib) * 100 : 0;
  const smartReturnPct = totalContrib > 0 ? ((smartTot - totalContrib) / totalContrib) * 100 : 0;
  const returnDiffPct  = smartReturnPct - plainReturnPct;

  const plainMaxDD = maxDrawdown(points.map(p => p.plainTotalValueUsd));
  const smartMaxDD = maxDrawdown(points.map(p => p.smartTotalValueUsd));
  const plainVol   = volatilityPct(points.map(p => p.plainTotalValueUsd));
  const smartVol   = volatilityPct(points.map(p => p.smartTotalValueUsd));

  const cashDragPct = totalContrib > 0 ? (smartCashTotal / totalContrib) * 100 : 0;
  const capitalDeployedPct = 100 - cashDragPct;

  const avgSmartDeploy = points.length
    ? points.reduce((s, p) => s + p.smartDeploymentPct, 0) / points.length
    : 0;

  const plainSharpe = plainVol > 0 ? plainReturnPct / plainVol : 0;
  const smartSharpe = smartVol > 0 ? smartReturnPct / smartVol : 0;

  // Entry improvement: avg BTC entry price for each strategy.
  const plainAvgBtc = plainQtyBtc > 0 ? plainBtcSpend / plainQtyBtc : 0;
  const smartAvgBtc = smartQtyBtc > 0 ? smartBtcSpend / smartQtyBtc : 0;
  const averageEntryImprovementPct = plainAvgBtc > 0
    ? ((plainAvgBtc - smartAvgBtc) / plainAvgBtc) * 100
    : 0;

  // Buy-the-dip score: did Smart deploy more during dips than calm weeks?
  let buyTheDipScore = 50;
  if (dipWeeks >= 1 && normWeeks >= 1) {
    const dipAvg = dipDeploySum / dipWeeks;
    const normAvg = normDeploySum / normWeeks;
    buyTheDipScore = clamp(50 + (dipAvg - normAvg) * 1.5, 0, 100);
  }

  // Deployment efficiency: $ return per $ actually deployed, normalized vs plain.
  const smartDeployedTotal = totalContrib - smartCashTotal;
  const smartDollarsPerDeployed = smartDeployedTotal > 0 ? (smartTot - totalContrib) / smartDeployedTotal : 0;
  const plainDollarsPerDeployed = totalContrib > 0 ? (plainTot - totalContrib) / totalContrib : 0;
  const ratio = plainDollarsPerDeployed !== 0
    ? smartDollarsPerDeployed / plainDollarsPerDeployed
    : (smartDollarsPerDeployed > 0 ? 2 : 1);
  const deploymentEfficiency = clamp(50 + (ratio - 1) * 50, 0, 100);

  // Verdict
  let status: MoneyModeReport['status'];
  if (returnDiffPct >= 1.5) status = 'winning';
  else if (returnDiffPct <= -1.5) status = 'losing';
  else status = 'neutral';

  // Recommendations + proposed tuning (only every 12 weeks of history)
  const { recommendations, proposedTuning } = generateRecommendations({
    weeksCount: points.length,
    returnDiffPct,
    drawdownSaved: plainMaxDD - smartMaxDD,
    cashDragPct,
    averageSmartDeploymentPct: avgSmartDeploy,
    averageEntryImprovementPct,
  });

  const weeksUntilNextReview = points.length < 12 ? 12 - points.length : (12 - (points.length % 12)) % 12 || 12;

  return {
    weeks: points,
    totalContributions: totalContrib,
    plainPortfolioUsd: plainPort,
    plainTotalUsd: plainTot,
    smartPortfolioUsd: smartPort,
    smartTotalUsd: smartTot,
    smartCashUsd: smartCashTotal,
    plainReturnPct,
    smartReturnPct,
    returnDiffPct,
    plainMaxDrawdownPct: plainMaxDD,
    smartMaxDrawdownPct: smartMaxDD,
    drawdownSavedPct: plainMaxDD - smartMaxDD,
    plainVolatilityPct: plainVol,
    smartVolatilityPct: smartVol,
    cashDragPct,
    capitalDeployedPct,
    averageSmartDeploymentPct: avgSmartDeploy,
    plainSharpeLite: plainSharpe,
    smartSharpeLite: smartSharpe,
    averageEntryImprovementPct,
    buyTheDipScore,
    deploymentEfficiency,
    weeksWon,
    weeksLost,
    status,
    recommendations,
    proposedTuning,
    weeksUntilNextReview,
  };
}

// ============================================================
// Recommendation engine — runs every 12 weeks of accumulated history
// ============================================================

function generateRecommendations(args: {
  weeksCount: number;
  returnDiffPct: number;
  drawdownSaved: number;
  cashDragPct: number;
  averageSmartDeploymentPct: number;
  averageEntryImprovementPct: number;
}): { recommendations: Recommendation[]; proposedTuning: TuningParams | null } {
  const recs: Recommendation[] = [];
  const current = loadTuning();
  const proposed: TuningParams = { ...current };
  const reviewDue = args.weeksCount > 0 && args.weeksCount % 12 === 0;

  // Always-on diagnostic notes
  if (args.returnDiffPct >= 3 && args.drawdownSaved >= 2) {
    recs.push({ id: 'optimal', level: 'good', text: 'Smart DCA výrazne prekonáva Plain DCA aj pri lepšej kontrole drawdownu.' });
  } else if (args.drawdownSaved >= 5) {
    recs.push({ id: 'keep_settings', level: 'good', text: 'Excelentná kontrola drawdownu — Smart chráni kapitál.' });
  }

  if (args.cashDragPct > 35) {
    recs.push({ id: 'cash_drag', level: 'warn', text: `Cash drag ${args.cashDragPct.toFixed(0)} % — kapitál je nedostatočne nasadený.` });
  }
  if (args.returnDiffPct < -5 && args.cashDragPct > 30) {
    recs.push({ id: 'too_defensive', level: 'warn', text: 'Smart DCA je príliš defenzívna a zaostáva za Plain DCA.' });
  }

  if (!reviewDue) {
    if (args.weeksCount < 12) {
      recs.unshift({ id: 'keep_settings', level: 'info', text: `Zber dát · ešte ${12 - args.weeksCount} týždňov do prvej revízie.` });
    }
    return { recommendations: recs, proposedTuning: null };
  }

  // 12-week REVIEW — apply small, safe parameter adjustments.
  let changed = false;

  // A) Underperforming + too much cash → raise the floor
  if (args.returnDiffPct < -5 && args.cashDragPct > 25) {
    const next = clamp(current.minAllocationPct + 6, TUNING_BOUNDS.minAllocationPct.lo, TUNING_BOUNDS.minAllocationPct.hi);
    if (next !== current.minAllocationPct) {
      proposed.minAllocationPct = next;
      recs.push({ id: 'increase_min_alloc', level: 'warn', text: `Zvýšiť minimálnu alokáciu na ${next} % (zníženie cash dragu).` });
      changed = true;
    }
  }

  // B) Buying too aggressively in euphoric zones → reduce high-score allocations
  if (args.returnDiffPct < -3 && args.averageSmartDeploymentPct > 60) {
    const next = clamp(current.highScoreReducerPct + 5, TUNING_BOUNDS.highScoreReducerPct.lo, TUNING_BOUNDS.highScoreReducerPct.hi);
    if (next !== current.highScoreReducerPct) {
      proposed.highScoreReducerPct = next;
      recs.push({ id: 'reduce_high_score', level: 'warn', text: `Znížiť alokáciu nad skóre 75 o ${next} % (eufória ochrana).` });
      changed = true;
    }
  }

  // C) Missing recoveries → add MA-reclaim bonus
  if (args.averageEntryImprovementPct < -1 && args.cashDragPct > 20) {
    const next = clamp(current.maReclaimBonusPct + 5, TUNING_BOUNDS.maReclaimBonusPct.lo, TUNING_BOUNDS.maReclaimBonusPct.hi);
    if (next !== current.maReclaimBonusPct) {
      proposed.maReclaimBonusPct = next;
      recs.push({ id: 'add_reclaim_bonus', level: 'warn', text: `Pridať +${next} % bonus pri reclaim 200D MA (lepšie chytanie obratu).` });
      changed = true;
    }
  }

  // D) Smart safer → keep
  if (args.drawdownSaved >= 3 && !changed) {
    recs.push({ id: 'keep_settings', level: 'good', text: 'Smart DCA znižuje drawdown — ponechať aktuálne nastavenia.' });
  }

  return { recommendations: recs, proposedTuning: changed ? proposed : null };
}

// Apply proposed tuning safely (clamps every param into its allowed band).
export function applyTuning(t: TuningParams): TuningParams {
  const safe: TuningParams = {
    minAllocationPct:        clamp(t.minAllocationPct,        TUNING_BOUNDS.minAllocationPct.lo,        TUNING_BOUNDS.minAllocationPct.hi),
    maxAllocationPct:        clamp(t.maxAllocationPct,        TUNING_BOUNDS.maxAllocationPct.lo,        TUNING_BOUNDS.maxAllocationPct.hi),
    confLowMult:             clamp(t.confLowMult,             TUNING_BOUNDS.confLowMult.lo,             TUNING_BOUNDS.confLowMult.hi),
    confMedMult:             clamp(t.confMedMult,             TUNING_BOUNDS.confMedMult.lo,             TUNING_BOUNDS.confMedMult.hi),
    confHighMult:            1.00,
    limitDiscountDefaultPct: clamp(t.limitDiscountDefaultPct, TUNING_BOUNDS.limitDiscountDefaultPct.lo, TUNING_BOUNDS.limitDiscountDefaultPct.hi),
    highScoreReducerPct:     clamp(t.highScoreReducerPct,     TUNING_BOUNDS.highScoreReducerPct.lo,     TUNING_BOUNDS.highScoreReducerPct.hi),
    maReclaimBonusPct:       clamp(t.maReclaimBonusPct,       TUNING_BOUNDS.maReclaimBonusPct.lo,       TUNING_BOUNDS.maReclaimBonusPct.hi),
  };
  saveTuning(safe);
  return safe;
}

export function resetTuning(): TuningParams {
  saveTuning(DEFAULT_TUNING);
  return DEFAULT_TUNING;
}

// Token list passthrough so the UI doesn't have to import crypto separately.
export const MONEY_MODE_TOKENS = TOKENS;
