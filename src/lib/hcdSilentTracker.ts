import type { PortfolioData } from '@/lib/portfolioData';
import type { StakedEntry } from '@/lib/stakingLedger';

const CALIBRATION_KEY = 'hcd-strategy-calibration-v1';
export const HCD_SILENT_TRACKER_EVENT = 'hcd-silent-tracker-changed';

export type LayerRole = 'core' | 'tactical' | 'alchemix';
export type AlgorithmState = 'calibrating' | 'stable';

export interface AssetBalanceSnapshot {
  holdings: number;
  liquidQty: number;
  stakedQty: number;
  totalUsd: number;
  motorQty: number;
  alchemixQty: number;
  stakedEntries: StakedEntry[];
}

export interface PortfolioBalanceSnapshot {
  capturedAt: number;
  totalUsd: number;
  prices: { btc: number; eth: number; sol: number };
  btc: Pick<AssetBalanceSnapshot, 'holdings' | 'liquidQty' | 'stakedQty' | 'totalUsd' | 'stakedEntries'>;
  eth: AssetBalanceSnapshot;
  sol: AssetBalanceSnapshot;
  lbtcQty: number;
  lbtcUsd: number;
  usdcDebt: number;
}

export interface StrategyCalibration {
  layerBias: Record<LayerRole, number>;
  algorithmState: AlgorithmState;
  lastCalibrationAt: number | null;
  lastOptimizedLayer: string | null;
  lastPnlUsd: number | null;
  lastPnlEth: number | null;
}

const DEFAULT_CALIBRATION: StrategyCalibration = {
  layerBias: { core: 1, tactical: 1, alchemix: 1 },
  algorithmState: 'stable',
  lastCalibrationAt: null,
  lastOptimizedLayer: null,
  lastPnlUsd: null,
  lastPnlEth: null,
};

const BIAS_MIN = 0.85;
const BIAS_MAX = 1.15;
const POSITIVE_BOOST = 0.015;
const NEGATIVE_TRIM = 0.02;
const CORE_BOOST_ON_LOSS = 0.015;

function clampBias(value: number): number {
  return Math.max(BIAS_MIN, Math.min(BIAS_MAX, Math.round(value * 1000) / 1000));
}

function persistCalibration(cal: StrategyCalibration): void {
  try {
    localStorage.setItem(CALIBRATION_KEY, JSON.stringify(cal));
    window.dispatchEvent(new CustomEvent(HCD_SILENT_TRACKER_EVENT));
  } catch { /* ignore */ }
}

export function loadStrategyCalibration(): StrategyCalibration {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    if (!raw) return { ...DEFAULT_CALIBRATION };
    const parsed = JSON.parse(raw) as Partial<StrategyCalibration>;
    return {
      ...DEFAULT_CALIBRATION,
      ...parsed,
      layerBias: {
        ...DEFAULT_CALIBRATION.layerBias,
        ...(parsed.layerBias ?? {}),
      },
    };
  } catch {
    return { ...DEFAULT_CALIBRATION };
  }
}

export function capturePortfolioSnapshot(
  portfolioData: PortfolioData,
  usdcDebt: number,
): PortfolioBalanceSnapshot {
  const eth = portfolioData.assets?.ETH;
  const sol = portfolioData.assets?.SOL;
  const btc = portfolioData.assets?.BTC;
  const prices = portfolioData.prices ?? { btc: 0, eth: 0, sol: 0 };
  const ethBaseline = portfolioData.ethBaseline;
  const solBaseline = portfolioData.solBaseline;
  const lbtc = portfolioData.lbtc;

  return {
    capturedAt: Date.now(),
    totalUsd: (ethBaseline?.totalUsd ?? eth?.totalUsd ?? 0)
      + (solBaseline?.totalUsd ?? sol?.totalUsd ?? 0)
      + (btc?.totalUsd ?? 0)
      + (lbtc?.usd ?? 0),
    prices: { ...prices },
    btc: {
      holdings: btc?.holdings ?? 0,
      liquidQty: btc?.liquidQty ?? 0,
      stakedQty: btc?.stakedQty ?? 0,
      totalUsd: btc?.totalUsd ?? 0,
      stakedEntries: btc?.stakedEntries ?? [],
    },
    eth: {
      holdings: eth?.holdings ?? 0,
      liquidQty: eth?.liquidQty ?? 0,
      stakedQty: eth?.stakedQty ?? 0,
      totalUsd: eth?.totalUsd ?? 0,
      motorQty: ethBaseline?.motorQty ?? 0,
      alchemixQty: ethBaseline?.alchemixQty ?? 0,
      stakedEntries: eth?.stakedEntries ?? [],
    },
    sol: {
      holdings: sol?.holdings ?? 0,
      liquidQty: sol?.liquidQty ?? 0,
      stakedQty: sol?.stakedQty ?? 0,
      totalUsd: sol?.totalUsd ?? 0,
      motorQty: solBaseline?.motorQty ?? 0,
      alchemixQty: 0,
      stakedEntries: sol?.stakedEntries ?? [],
    },
    lbtcQty: lbtc?.qty ?? 0,
    lbtcUsd: lbtc?.usd ?? 0,
    usdcDebt,
  };
}

export function roleFromActionType(actionType: string): LayerRole {
  if (actionType.includes('core')) return 'core';
  if (actionType.includes('tactical')) return 'tactical';
  if (actionType.includes('alchemix')) return 'alchemix';
  return 'tactical';
}

export function layerLabelFromActionType(actionType: string, sk: boolean): string {
  const labels: Record<string, { sk: string; en: string }> = {
    'core-stake': { sk: 'Core Fortress Staking', en: 'Core Fortress Staking' },
    'tactical-deploy': { sk: 'Taktický motor', en: 'Tactical motor' },
    'alchemix-deposit': { sk: 'Alchemix Vault', en: 'Alchemix Vault' },
    'alchemix-autonomous-rebalance': { sk: 'Autonómny Alchemix rebalans', en: 'Autonomous Alchemix rebalance' },
  };
  const entry = labels[actionType] ?? { sk: actionType, en: actionType };
  return sk ? entry.sk : entry.en;
}

export function compareBalanceSnapshots(
  before: PortfolioBalanceSnapshot,
  after: PortfolioBalanceSnapshot,
): { pnlUsd: number; pnlEth: number; pnlPct: number } {
  const pnlUsd = after.totalUsd - before.totalUsd;
  const pnlEth = after.eth.holdings - before.eth.holdings;
  const pnlPct = before.totalUsd > 0 ? (pnlUsd / before.totalUsd) * 100 : 0;
  return { pnlUsd, pnlEth, pnlPct };
}

export function applySilentCalibration(input: {
  actionType: string;
  layerLabel: string;
  pnlUsd: number;
  pnlEth: number;
}): StrategyCalibration {
  const cal = loadStrategyCalibration();
  const role = roleFromActionType(input.actionType);
  const nextBias = { ...cal.layerBias };

  if (input.pnlUsd > 0) {
    nextBias[role] = clampBias(nextBias[role] + POSITIVE_BOOST);
  } else {
    if (role === 'tactical' || role === 'alchemix') {
      nextBias[role] = clampBias(nextBias[role] - NEGATIVE_TRIM);
      nextBias.core = clampBias(nextBias.core + CORE_BOOST_ON_LOSS);
    } else {
      nextBias.core = clampBias(nextBias.core - NEGATIVE_TRIM * 0.5);
    }
  }

  const updated: StrategyCalibration = {
    layerBias: nextBias,
    algorithmState: 'calibrating',
    lastCalibrationAt: Date.now(),
    lastOptimizedLayer: input.layerLabel,
    lastPnlUsd: input.pnlUsd,
    lastPnlEth: input.pnlEth,
  };
  persistCalibration(updated);
  return updated;
}

export function getLayerCalibrationBias(role: LayerRole): number {
  return loadStrategyCalibration().layerBias[role] ?? 1;
}

export function markAlgorithmStable(): void {
  const cal = loadStrategyCalibration();
  if (cal.algorithmState === 'stable') return;
  persistCalibration({ ...cal, algorithmState: 'stable' });
}

export function setAlgorithmCalibrating(): void {
  const cal = loadStrategyCalibration();
  if (cal.algorithmState === 'calibrating') return;
  persistCalibration({ ...cal, algorithmState: 'calibrating' });
}
