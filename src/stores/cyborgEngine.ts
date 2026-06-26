import { create } from 'zustand';
import type { MarketMode } from '@/lib/coreSatelliteEngine';
import type { StakedEntry } from '@/lib/stakingLedger';
import { getLedger, STAKING_LEDGER_EVENT } from '@/lib/stakingLedger';
import type { PortfolioBalanceUpdate } from '@/lib/cyborgPortfolio';
import {
  buildYieldApyRates,
  buildYieldPositionsFromEntries,
  calculateYield,
} from '@/lib/yieldAggregator';
import {
  buildCyborgReason,
  getDynamicReason,
  resolveActionType,
  type CyborgReasonAction,
  type CyborgActionType,
  type ReasoningContext,
} from '@/lib/cyborgReasoning';
import type { Lang } from '@/lib/i18n';
import {
  DEFAULT_MARKET_DATA,
  fetchCyborgMarketData,
  loadCachedMarketData,
  mergeMarketData,
  type CyborgMarketData,
} from '@/lib/cyborgMarketDataFeed';

export type CyborgAsset = 'BTC' | 'ETH' | 'SOL';

export interface WalletBalances {
  BTC: number;
  ETH: number;
  SOL: number;
  USDC: number;
}

export interface StakingPosition {
  id: string;
  symbol: CyborgAsset;
  protocol: string;
  amount: number;
  apyPct: number;
  layer: string;
}

export interface DcaAssetAllocation {
  symbol: CyborgAsset;
  marketUsd: number;
  limitUsd: number;
}

export interface DcaScheduleSnapshot {
  capital: number;
  investableUsd: number;
  finalAllocationPct: number;
  regime: string;
  perAsset: DcaAssetAllocation[];
  updatedAt: number;
}

export interface ActionLockState {
  active: boolean;
  source: 'stake' | 'dca' | null;
  messageSk: string;
  messageEn: string;
}

export interface MasterState {
  walletBalances: WalletBalances;
  stakingPositions: StakingPosition[];
  dcaSchedules: DcaScheduleSnapshot | null;
  marketMode: MarketMode | 'UNKNOWN';
  prices: { btc: number; eth: number; sol: number };
  marketData: CyborgMarketData;
  actionLock: ActionLockState;
  reasoningContext: ReasoningContext;
  revision: number;
}

export interface CyborgComputed {
  totalBalanceUsd: number;
  totalStakedUsd: number;
  totalWalletUsd: number;
  weightedApyPct: number;
  dailyPassiveIncomeUsd: number;
  dcaPaused: boolean;
  dcaPauseMessageSk: string;
  dcaPauseMessageEn: string;
}

const HOLDINGS_KEY = 'smart-alloc-holdings';

export function safeNum(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

const EMPTY_WALLET: WalletBalances = { BTC: 0, ETH: 0, SOL: 0, USDC: 0 };

const INITIAL_STATE: MasterState = {
  walletBalances: { ...EMPTY_WALLET },
  stakingPositions: [],
  dcaSchedules: null,
  marketMode: 'UNKNOWN',
  prices: { btc: 0, eth: 0, sol: 0 },
  marketData: loadCachedMarketData(),
  actionLock: {
    active: false,
    source: null,
    messageSk: '',
    messageEn: '',
  },
  reasoningContext: {
    marketScore: 50,
    fearGreed: 50,
    regime: 'sideways',
    marketMode: 'UNKNOWN',
    stakedRatio: 0,
    totalBalanceUsd: 0,
    weightedApyPct: 0,
  },
  revision: 0,
};

function buildReasoningSnapshot(state: MasterState): ReasoningContext {
  const computed = computeCyborgMetrics(state);
  const total = safeNum(computed.totalBalanceUsd);
  const staked = safeNum(computed.totalStakedUsd);
  return {
    ...state.reasoningContext,
    marketMode: state.marketMode ?? 'UNKNOWN',
    stakedRatio: total > 0 ? staked / total : 0,
    totalBalanceUsd: total,
    weightedApyPct: safeNum(computed.weightedApyPct),
  };
}

export type { CyborgReasonAction, CyborgActionType, ReasoningContext };
export type { CyborgMarketData } from '@/lib/cyborgMarketDataFeed';
export { buildCyborgReason, getDynamicReason, resolveActionType } from '@/lib/cyborgReasoning';

function loadHoldings(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(HOLDINGS_KEY) || '{}');
  } catch {
    return {};
  }
}

function defaultApyForProtocol(protocol: string, symbol: CyborgAsset): number {
  const p = String(protocol ?? '').toLowerCase();
  if (/rocket|reth/i.test(p)) return 3.1;
  if (/marinade|msol/i.test(p)) return 7.4;
  if (/aave|morpho/i.test(p)) return 2.0;
  if (/kamino/i.test(p)) return 5.0;
  if (/alchemix/i.test(p)) return 2.5;
  if (/lombard|lbtc/i.test(p)) return 4.0;
  if (symbol === 'BTC') return 6.4;
  if (symbol === 'SOL') return 7.4;
  return 3.0;
}

function layerForProtocol(protocol: string): string {
  const p = String(protocol ?? '').toLowerCase();
  if (/rocket|marinade/i.test(p)) return 'core';
  if (/aave|morpho|kamino/i.test(p)) return 'tactical';
  if (/alchemix/i.test(p)) return 'alchemix';
  return 'staking';
}

function entriesToPositions(entries: StakedEntry[]): StakingPosition[] {
  return (entries ?? [])
    .map((entry, index) => ({
      id: `${entry?.symbol ?? 'ETH'}-${entry?.protocol ?? 'unknown'}-${index}`,
      symbol: (entry?.symbol ?? 'ETH') as CyborgAsset,
      protocol: String(entry?.protocol ?? ''),
      amount: safeNum(entry?.amount),
      apyPct: defaultApyForProtocol(entry?.protocol ?? '', (entry?.symbol ?? 'ETH') as CyborgAsset),
      layer: layerForProtocol(entry?.protocol ?? ''),
    }))
    .filter(pos => pos.amount > 0);
}

function buildWalletFromSources(
  holdings: Record<string, number>,
  entries: StakedEntry[],
): WalletBalances {
  const stakedBySymbol: Record<CyborgAsset, number> = { BTC: 0, ETH: 0, SOL: 0 };
  for (const entry of entries ?? []) {
    const sym = entry?.symbol as CyborgAsset;
    if (sym === 'BTC' || sym === 'ETH' || sym === 'SOL') {
      stakedBySymbol[sym] += safeNum(entry?.amount);
    }
  }

  return {
    BTC: Math.max(0, safeNum(holdings.btc) - stakedBySymbol.BTC),
    ETH: Math.max(0, safeNum(holdings.eth) - stakedBySymbol.ETH),
    SOL: Math.max(0, safeNum(holdings.sol) - stakedBySymbol.SOL),
    USDC: 0,
  };
}

export function computeCyborgMetrics(
  state: MasterState,
  apyRates?: ReturnType<typeof buildYieldApyRates>,
): CyborgComputed {
  const prices = state.prices ?? { btc: 0, eth: 0, sol: 0 };
  const wallet = state.walletBalances ?? EMPTY_WALLET;

  const walletUsd =
    safeNum(wallet.BTC) * safeNum(prices.btc)
    + safeNum(wallet.ETH) * safeNum(prices.eth)
    + safeNum(wallet.SOL) * safeNum(prices.sol)
    + safeNum(wallet.USDC);

  const stakingUsd = (state.stakingPositions ?? []).reduce((sum, pos) => {
    const price = pos.symbol === 'BTC' ? prices.btc : pos.symbol === 'SOL' ? prices.sol : prices.eth;
    return sum + safeNum(pos.amount) * safeNum(price);
  }, 0);

  const yieldPositions = (state.stakingPositions ?? []).map(pos => ({
    protocol: pos.protocol,
    symbol: pos.symbol,
    amount: pos.amount,
    priceUsd: pos.symbol === 'BTC' ? prices.btc : pos.symbol === 'SOL' ? prices.sol : prices.eth,
  }));

  const rates = apyRates ?? buildYieldApyRates(null);
  const yieldResult = calculateYield(yieldPositions, rates);

  const dcaPaused = Boolean(state.actionLock?.active && state.actionLock?.source === 'stake');

  return {
    totalBalanceUsd: walletUsd + stakingUsd,
    totalStakedUsd: stakingUsd,
    totalWalletUsd: walletUsd,
    weightedApyPct: safeNum(yieldResult.weightedApyPct),
    dailyPassiveIncomeUsd: safeNum(yieldResult.dailyPassiveIncomeUsd),
    dcaPaused,
    dcaPauseMessageSk: state.actionLock?.messageSk || 'DCA pozastavené: Aktívna exekúcia v Stake',
    dcaPauseMessageEn: state.actionLock?.messageEn || 'DCA paused: Active execution in Stake',
  };
}

export function adjustDcaInvestableForMarketMode(
  investableUsd: number,
  marketMode: MasterState['marketMode'],
): number {
  const base = safeNum(investableUsd);
  if (base <= 0) return 0;
  switch (marketMode) {
    case 'ACCUMULATION': return base;
    case 'CAUTIOUS_ACCUMULATION': return base * 0.85;
    case 'BALANCED': return base * 0.7;
    case 'DISTRIBUTION': return base * 0.5;
    case 'DEFENSIVE': return base * 0.25;
    default: return base * 0.9;
  }
}

interface CyborgEngineStore extends MasterState {
  getComputed: (apyRates?: ReturnType<typeof buildYieldApyRates>) => CyborgComputed;
  getReason: (action: CyborgReasonAction, lang?: Lang) => string;
  getDynamicReason: (actionType: CyborgActionType, lang?: Lang) => string;
  syncFromSources: (input?: {
    holdings?: Record<string, number>;
    entries?: StakedEntry[];
    prices?: { btc?: number; eth?: number; sol?: number };
  }) => void;
  setMarketMode: (mode: MasterState['marketMode']) => void;
  setDcaSchedule: (schedule: DcaScheduleSnapshot | null) => void;
  setPrices: (prices: { btc?: number; eth?: number; sol?: number }) => void;
  setReasoningContext: (patch: Partial<ReasoningContext>) => void;
  setMarketData: (patch: Partial<CyborgMarketData>) => void;
  refreshMarketData: (fearGreedIndex?: number) => Promise<void>;
  beginStakeExecution: () => void;
  endStakeExecution: () => void;
  applyStakeExecution: (update: PortfolioBalanceUpdate, protocolHint?: string) => void;
  applyDcaPurchase: (symbol: CyborgAsset, qty: number) => void;
  canAffordDcaUsd: (requiredUsd: number) => boolean;
}

export const useCyborgEngine = create<CyborgEngineStore>((set, get) => ({
  ...INITIAL_STATE,

  getComputed: (apyRates) => computeCyborgMetrics(get(), apyRates),

  getReason: (action, lang = 'sk') => buildCyborgReason(
    action,
    buildReasoningSnapshot(get()),
    lang,
    get().marketData,
  ),

  getDynamicReason: (actionType, lang = 'sk') => {
    const snapshot = buildReasoningSnapshot(get());
    return getDynamicReason(actionType, snapshot.marketScore, {
      lang,
      fearGreed: snapshot.fearGreed,
      marketMode: snapshot.marketMode,
      weightedApyPct: snapshot.weightedApyPct,
      stakedRatio: snapshot.stakedRatio,
      marketData: get().marketData,
    });
  },

  syncFromSources: (input) => {
    const holdings = input?.holdings ?? loadHoldings();
    const entries = input?.entries ?? getLedger();
    const prices = {
      btc: safeNum(input?.prices?.btc ?? get().prices.btc),
      eth: safeNum(input?.prices?.eth ?? get().prices.eth),
      sol: safeNum(input?.prices?.sol ?? get().prices.sol),
    };
    const partial: MasterState = {
      ...get(),
      walletBalances: buildWalletFromSources(holdings, entries),
      stakingPositions: entriesToPositions(entries),
      prices,
      revision: get().revision + 1,
    };
    set({
      ...partial,
      reasoningContext: buildReasoningSnapshot(partial),
    });
  },

  setReasoningContext: (patch) => set({
    reasoningContext: {
      ...get().reasoningContext,
      marketScore: safeNum(patch?.marketScore ?? get().reasoningContext.marketScore),
      fearGreed: safeNum(patch?.fearGreed ?? get().reasoningContext.fearGreed),
      regime: patch?.regime ?? get().reasoningContext.regime,
      marketMode: patch?.marketMode ?? get().reasoningContext.marketMode,
      stakedRatio: safeNum(patch?.stakedRatio ?? get().reasoningContext.stakedRatio),
      totalBalanceUsd: safeNum(patch?.totalBalanceUsd ?? get().reasoningContext.totalBalanceUsd),
      weightedApyPct: safeNum(patch?.weightedApyPct ?? get().reasoningContext.weightedApyPct),
    },
    revision: get().revision + 1,
  }),

  setMarketData: (patch) => {
    const next = mergeMarketData(get().marketData ?? DEFAULT_MARKET_DATA, patch);
    set({
      marketData: next,
      prices: {
        btc: next.btcPrice > 0 ? next.btcPrice : get().prices.btc,
        eth: next.ethPrice > 0 ? next.ethPrice : get().prices.eth,
        sol: get().prices.sol,
      },
      revision: get().revision + 1,
    });
  },

  refreshMarketData: async (fearGreedIndex) => {
    const fg = fearGreedIndex ?? get().marketData.fearGreedIndex ?? get().reasoningContext.fearGreed;
    try {
      const live = await fetchCyborgMarketData(fg);
      get().setMarketData(live);
    } catch {
      const cached = loadCachedMarketData();
      get().setMarketData(mergeMarketData(cached, {
        fearGreedIndex: safeNum(fg),
        source: 'cache',
      }));
    }
  },

  setMarketMode: (mode) => set({
    marketMode: mode ?? 'UNKNOWN',
    reasoningContext: {
      ...get().reasoningContext,
      marketMode: mode ?? 'UNKNOWN',
    },
    revision: get().revision + 1,
  }),

  setDcaSchedule: (schedule) => set({ dcaSchedules: schedule, revision: get().revision + 1 }),

  setPrices: (prices) => set({
    prices: {
      btc: safeNum(prices?.btc ?? get().prices.btc),
      eth: safeNum(prices?.eth ?? get().prices.eth),
      sol: safeNum(prices?.sol ?? get().prices.sol),
    },
    revision: get().revision + 1,
  }),

  beginStakeExecution: () => set({
    actionLock: {
      active: true,
      source: 'stake',
      messageSk: 'DCA pozastavené: Aktívna exekúcia v Stake',
      messageEn: 'DCA paused: Active execution in Stake',
    },
    revision: get().revision + 1,
  }),

  endStakeExecution: () => set({
    actionLock: { active: false, source: null, messageSk: '', messageEn: '' },
    revision: get().revision + 1,
  }),

  applyStakeExecution: (update, protocolHint) => {
    const state = get();
    const wallet = { ...state.walletBalances };
    const positions = [...state.stakingPositions];
    const protocol = protocolHint ?? 'Manual Stake';

    const applyDelta = (symbol: CyborgAsset, qty: number, proto: string) => {
      if (qty <= 0) return;
      wallet[symbol] = Math.max(0, safeNum(wallet[symbol]) - qty);
      const idx = positions.findIndex(p => p.symbol === symbol && p.protocol === proto);
      if (idx >= 0) {
        positions[idx] = { ...positions[idx], amount: safeNum(positions[idx].amount) + qty };
      } else {
        positions.push({
          id: `${symbol}-${proto}-${Date.now()}`,
          symbol,
          protocol: proto,
          amount: qty,
          apyPct: defaultApyForProtocol(proto, symbol),
          layer: layerForProtocol(proto),
        });
      }
    };

    if (safeNum(update.rEthQty) > 0) applyDelta('ETH', safeNum(update.rEthQty), protocol.includes('Aave') ? protocol : 'Rocket Pool (rETH)');
    if (safeNum(update.mSolQty) > 0) applyDelta('SOL', safeNum(update.mSolQty), 'Marinade Native (mSOL)');
    if (safeNum(update.alchemixEthQty) > 0) applyDelta('ETH', safeNum(update.alchemixEthQty), 'Alchemix Vault (ETH)');
    if (safeNum(update.lbtcQty) > 0) applyDelta('BTC', safeNum(update.lbtcQty), 'Lombard LBTC');

    set({
      walletBalances: wallet,
      stakingPositions: positions.filter(p => p.amount > 0),
      revision: state.revision + 1,
    });
  },

  applyDcaPurchase: (symbol, qty) => {
    const amount = safeNum(qty);
    if (amount <= 0) return;
    try {
      const holdings = loadHoldings();
      const key = symbol.toLowerCase();
      holdings[key] = safeNum(holdings[key]) + amount;
      localStorage.setItem(HOLDINGS_KEY, JSON.stringify(holdings));
    } catch {
      /* persist best-effort */
    }
    get().syncFromSources();
  },

  canAffordDcaUsd: (requiredUsd) => {
    const state = get();
    if (state.actionLock.active) return false;
    const computed = computeCyborgMetrics(state);
    return computed.totalWalletUsd >= safeNum(requiredUsd);
  },
}));

export function subscribeCyborgLedgerSync(): () => void {
  const handler = () => useCyborgEngine.getState().syncFromSources();
  window.addEventListener(STAKING_LEDGER_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(STAKING_LEDGER_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
