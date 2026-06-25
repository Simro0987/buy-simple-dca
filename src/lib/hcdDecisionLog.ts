import {
  applySilentCalibration,
  compareBalanceSnapshots,
  layerLabelFromActionType,
  type PortfolioBalanceSnapshot,
} from '@/lib/hcdSilentTracker';

const LOG_KEY = 'hcd-decision-log-v1';
const CONFIDENCE_KEY = 'hcd-strategy-confidence-v1';
export const HCD_DECISION_LOG_EVENT = 'hcd-decision-log-changed';

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
  balanceSnapshot?: PortfolioBalanceSnapshot;
  portfolioUsdAt24h?: number;
  pnl24hUsd?: number;
  pnl24hPct?: number;
  pnl24hEth?: number;
  marketConditions: MarketConditionsSnapshot;
  confidenceRewardApplied?: boolean;
  calibrationApplied?: boolean;
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
  if (stepKey.includes('autonomous-alchemix')) return 'alchemix-autonomous-rebalance';
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
  balanceSnapshot?: PortfolioBalanceSnapshot;
  actionType?: string;
  strategyKey?: string;
}): DecisionLogEntry {
  const entries = loadDecisionLog().filter(e => e.stepKey !== input.stepKey);
  const entry: DecisionLogEntry = {
    id: `${input.stepKey}-${Date.now()}`,
    stepKey: input.stepKey,
    actionType: input.actionType ?? actionTypeFromStepKey(input.stepKey),
    strategyKey: input.strategyKey ?? strategyKeyFromStepKey(input.stepKey),
    confirmedAt: Date.now(),
    portfolioUsdAtConfirm: input.balanceSnapshot?.totalUsd ?? input.portfolioUsdAtConfirm,
    balanceSnapshot: input.balanceSnapshot,
    marketConditions: input.marketConditions,
    confidenceRewardApplied: false,
    calibrationApplied: false,
  };
  entries.push(entry);
  persistLog(entries);
  return entry;
}

export function removeDecisionLogEntry(stepKey: string): void {
  const entries = loadDecisionLog().filter(e => e.stepKey !== stepKey);
  persistLog(entries);
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
  return Math.min(3, Math.max(1, Math.round(pnlPct * 0.3)));
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

/** Silent 24h on-chain balance check + autonomous strategy calibration. */
export function processSilentPerformanceChecks(
  currentSnapshot: PortfolioBalanceSnapshot,
): DecisionLogEntry[] {
  const now = Date.now();
  const entries = loadDecisionLog();
  let changed = false;

  const updated = entries.map(entry => {
    if (entry.confidenceRewardApplied) return entry;
    if (now < entry.confirmedAt + MS_24H) return entry;

    const before = entry.balanceSnapshot;
    const comparison = before
      ? compareBalanceSnapshots(before, currentSnapshot)
      : {
        pnlUsd: currentSnapshot.totalUsd - entry.portfolioUsdAtConfirm,
        pnlEth: 0,
        pnlPct: entry.portfolioUsdAtConfirm > 0
          ? ((currentSnapshot.totalUsd - entry.portfolioUsdAtConfirm) / entry.portfolioUsdAtConfirm) * 100
          : 0,
      };

    if (!entry.calibrationApplied) {
      applySilentCalibration({
        actionType: entry.actionType,
        layerLabel: layerLabelFromActionType(entry.actionType, true),
        pnlUsd: comparison.pnlUsd,
        pnlEth: comparison.pnlEth,
      });
    }

    if (comparison.pnlUsd > 0) {
      applyConfidenceReward(entry.strategyKey, comparison.pnlPct);
    }

    changed = true;
    return {
      ...entry,
      portfolioUsdAt24h: currentSnapshot.totalUsd,
      pnl24hUsd: comparison.pnlUsd,
      pnl24hPct: comparison.pnlPct,
      pnl24hEth: comparison.pnlEth,
      confidenceRewardApplied: true,
      calibrationApplied: true,
    };
  });

  if (changed) persistLog(updated);
  return updated;
}

/** @deprecated Use processSilentPerformanceChecks */
export function processPerformanceRewards(currentPortfolioUsd: number): DecisionLogEntry[] {
  return processSilentPerformanceChecks({
    capturedAt: Date.now(),
    totalUsd: currentPortfolioUsd,
    prices: { btc: 0, eth: 0, sol: 0 },
    btc: { holdings: 0, liquidQty: 0, stakedQty: 0, totalUsd: 0, stakedEntries: [] },
    eth: { holdings: 0, liquidQty: 0, stakedQty: 0, totalUsd: 0, motorQty: 0, alchemixQty: 0, stakedEntries: [] },
    sol: { holdings: 0, liquidQty: 0, stakedQty: 0, totalUsd: 0, motorQty: 0, alchemixQty: 0, stakedEntries: [] },
    lbtcQty: 0,
    lbtcUsd: 0,
    usdcDebt: 0,
  });
}
