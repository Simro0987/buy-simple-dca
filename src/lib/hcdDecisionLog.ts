const LOG_KEY = 'hcd-decision-log-v1';
const CONFIDENCE_KEY = 'hcd-strategy-confidence-v1';
export const HCD_DECISION_LOG_EVENT = 'hcd-decision-log-changed';

export type DecisionRating = 'up' | 'down';

export interface MarketConditionsSnapshot {
  fearGreed?: number | null;
  btcRsi?: number | null;
  volatilityRegime?: string;
  borrowApyPct?: number;
  targetLtvPct?: number;
  temperamentPct?: number;
  portfolioUsd?: number;
  netYieldPct?: number;
}

export interface DecisionLogEntry {
  id: string;
  stepKey: string;
  actionType: string;
  strategyKey: string;
  confirmedAt: number;
  portfolioUsdAtConfirm: number;
  portfolioUsdAt24h?: number;
  pnl24hUsd?: number;
  pnl24hPct?: number;
  marketConditions: MarketConditionsSnapshot;
  userRating?: DecisionRating | null;
  ratedAt?: number;
  confidenceRewardApplied?: boolean;
}

export type StrategyConfidenceMap = Record<string, number>;

const MS_24H = 24 * 60 * 60 * 1000;
const DEFAULT_CONFIDENCE = 50;
const MAX_CONFIDENCE = 100;
const MIN_CONFIDENCE = 0;

function persistLog(entries: DecisionLogEntry[]): void {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-200)));
    window.dispatchEvent(new CustomEvent(HCD_DECISION_LOG_EVENT));
  } catch { /* ignore */ }
}

function persistConfidence(map: StrategyConfidenceMap): void {
  try {
    localStorage.setItem(CONFIDENCE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(HCD_DECISION_LOG_EVENT));
  } catch { /* ignore */ }
}

export function loadDecisionLog(): DecisionLogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function loadStrategyConfidence(): StrategyConfidenceMap {
  try {
    const raw = localStorage.getItem(CONFIDENCE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getStrategyConfidence(strategyKey: string): number {
  const map = loadStrategyConfidence();
  const value = map[strategyKey];
  return Number.isFinite(value) ? clampConfidence(value) : DEFAULT_CONFIDENCE;
}

function clampConfidence(value: number): number {
  return Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, Math.round(value)));
}

export function actionTypeFromStepKey(stepKey: string): string {
  if (stepKey.includes('core')) return 'core-stake';
  if (stepKey.includes('tactical')) return 'tactical-deploy';
  if (stepKey.includes('alchemix')) return 'alchemix-deposit';
  return 'hcd-action';
}

export function strategyKeyFromStepKey(stepKey: string): string {
  return stepKey.replace(/^hcd-plan-/, '');
}

export function appendDecisionLogEntry(input: {
  stepKey: string;
  portfolioUsdAtConfirm: number;
  marketConditions: MarketConditionsSnapshot;
}): DecisionLogEntry {
  const entries = loadDecisionLog().filter(e => e.stepKey !== input.stepKey);
  const entry: DecisionLogEntry = {
    id: `${input.stepKey}-${Date.now()}`,
    stepKey: input.stepKey,
    actionType: actionTypeFromStepKey(input.stepKey),
    strategyKey: strategyKeyFromStepKey(input.stepKey),
    confirmedAt: Date.now(),
    portfolioUsdAtConfirm: input.portfolioUsdAtConfirm,
    marketConditions: input.marketConditions,
    userRating: null,
    confidenceRewardApplied: false,
  };
  entries.push(entry);
  persistLog(entries);
  return entry;
}

export function removeDecisionLogEntry(stepKey: string): void {
  const entries = loadDecisionLog().filter(e => e.stepKey !== stepKey);
  persistLog(entries);
}

export function rateDecision(stepKey: string, rating: DecisionRating): DecisionLogEntry | null {
  const entries = loadDecisionLog();
  const idx = entries.findIndex(e => e.stepKey === stepKey);
  if (idx < 0) return null;
  entries[idx] = {
    ...entries[idx],
    userRating: rating,
    ratedAt: Date.now(),
  };
  persistLog(entries);
  return entries[idx];
}

export function getDecisionForStep(stepKey: string): DecisionLogEntry | null {
  const entries = loadDecisionLog();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    if (entries[i].stepKey === stepKey) return entries[i];
  }
  return null;
}

function computeConfidenceBoost(pnlPct: number): number {
  if (pnlPct <= 0) return 0;
  return Math.min(8, Math.max(1, Math.round(pnlPct * 0.4)));
}

export function applyConfidenceReward(strategyKey: string, pnlPct: number): number {
  const boost = computeConfidenceBoost(pnlPct);
  if (boost <= 0) return getStrategyConfidence(strategyKey);
  const map = loadStrategyConfidence();
  const next = clampConfidence((map[strategyKey] ?? DEFAULT_CONFIDENCE) + boost);
  map[strategyKey] = next;
  persistConfidence(map);
  return next;
}

export function processPerformanceRewards(currentPortfolioUsd: number): DecisionLogEntry[] {
  const now = Date.now();
  const entries = loadDecisionLog();
  let changed = false;

  const updated = entries.map(entry => {
    if (entry.confidenceRewardApplied) return entry;
    if (now < entry.confirmedAt + MS_24H) return entry;

    const portfolioUsdAt24h = currentPortfolioUsd;
    const pnl24hUsd = portfolioUsdAt24h - entry.portfolioUsdAtConfirm;
    const pnl24hPct = entry.portfolioUsdAtConfirm > 0
      ? (pnl24hUsd / entry.portfolioUsdAtConfirm) * 100
      : 0;

    if (pnl24hUsd > 0) {
      applyConfidenceReward(entry.strategyKey, pnl24hPct);
    }

    changed = true;
    return {
      ...entry,
      portfolioUsdAt24h,
      pnl24hUsd,
      pnl24hPct,
      confidenceRewardApplied: true,
    };
  });

  if (changed) persistLog(updated);
  return updated;
}
