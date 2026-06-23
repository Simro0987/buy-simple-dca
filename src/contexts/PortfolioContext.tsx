import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { usePrices } from '@/hooks/usePrices';
import { usePortfolioMetrics, type PortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { STAKING_CONFIG } from '@/lib/wallets';
import { PROFIT_CONFIGS, getExecutedLevels } from '@/lib/profitTaking';
import { useStakingLedger } from '@/hooks/useStakingLedger';
import type { StakedEntry } from '@/lib/stakingLedger';
import type { PriceData } from '@/lib/crypto';
import { buildPortfolioData, type PortfolioData } from '@/lib/portfolioData';
import {
  applyPortfolioBalanceUpdate,
  loadCyborgUsdcDebt,
  loadConfirmedSteps,
  markStepConfirmed,
  revertPortfolioBalanceUpdate,
  unmarkStepConfirmed,
  type ConfirmedStepData,
  CYBORG_DEBT_EVENT,
  CYBORG_CONFIRMED_EVENT,
  type PortfolioBalanceUpdate,
} from '@/lib/cyborgPortfolio';

export type AssetFilter = 'BTC' | 'ETH' | 'SOL' | null;
export type { PortfolioBalanceUpdate };

interface AssetBreakdown {
  symbol: string;
  value: number;
  holdValue: number;
  stakedValue: number;
  stakedQty: number;
  liquidQty: number;
  stakedEntries: StakedEntry[];
  projectedYieldUsd: number;
}

interface PortfolioCtx {
  prices: PriceData | undefined;
  metrics: PortfolioMetrics;
  portfolioData: PortfolioData;
  totalValue: number;
  totalStakedValue: number;
  blendedApy: number;
  breakdown: AssetBreakdown[];
  realizedProfit: number;
  realizedBySymbol: Record<string, number>;
  movedProfit: number;
  profitAvailable: number;
  profitBySymbol: Record<string, number>;
  cyborgUsdcDebt: number;
  markProfitMoved: (usd: number) => void;
  confirmExecutionStep: (key: string, update: PortfolioBalanceUpdate) => void;
  revertExecutionStep: (key: string) => void;
  isExecutionConfirmed: (key: string) => boolean;
  selected: AssetFilter;
  setSelected: (s: AssetFilter) => void;
  toggleSelected: (s: Exclude<AssetFilter, null>) => void;
}

const Ctx = createContext<PortfolioCtx | null>(null);

const MOVED_KEY = 'ai-router-profit-moved';
function loadMoved(): number {
  try { return Number(localStorage.getItem(MOVED_KEY) || '0'); } catch { return 0; }
}

export function PortfolioProvider({ children }: { children: ReactNode }) {
  const { data: prices, isLoading: pricesLoading } = usePrices();
  const metrics = usePortfolioMetrics(prices);
  const ledger = useStakingLedger();
  const [selected, setSelected] = useState<AssetFilter>(null);
  const [movedProfit, setMovedProfit] = useState<number>(loadMoved());
  const [cyborgUsdcDebt, setCyborgUsdcDebt] = useState<number>(() => loadCyborgUsdcDebt());
  const [confirmedSteps, setConfirmedSteps] = useState<Record<string, ConfirmedStepData>>(() => loadConfirmedSteps());

  useEffect(() => {
    const syncDebt = () => setCyborgUsdcDebt(loadCyborgUsdcDebt());
    const syncConfirmed = () => setConfirmedSteps(loadConfirmedSteps());
    window.addEventListener(CYBORG_DEBT_EVENT, syncDebt);
    window.addEventListener(CYBORG_CONFIRMED_EVENT, syncConfirmed);
    window.addEventListener('storage', syncDebt);
    window.addEventListener('storage', syncConfirmed);
    return () => {
      window.removeEventListener(CYBORG_DEBT_EVENT, syncDebt);
      window.removeEventListener(CYBORG_CONFIRMED_EVENT, syncConfirmed);
      window.removeEventListener('storage', syncDebt);
      window.removeEventListener('storage', syncConfirmed);
    };
  }, []);

  const updatePortfolioBalances = useCallback((update: PortfolioBalanceUpdate) => {
    applyPortfolioBalanceUpdate(update);
    setCyborgUsdcDebt(loadCyborgUsdcDebt());
  }, []);

  const confirmExecutionStep = useCallback((key: string, update: PortfolioBalanceUpdate) => {
    applyPortfolioBalanceUpdate(update);
    markStepConfirmed(key, update);
    setConfirmedSteps(loadConfirmedSteps());
    setCyborgUsdcDebt(loadCyborgUsdcDebt());
  }, []);

  const revertExecutionStep = useCallback((key: string) => {
    const update = unmarkStepConfirmed(key);
    if (update) {
      revertPortfolioBalanceUpdate(update);
    }
    setConfirmedSteps(loadConfirmedSteps());
    setCyborgUsdcDebt(loadCyborgUsdcDebt());
  }, []);

  const isExecutionConfirmed = useCallback(
    (key: string) => key in confirmedSteps,
    [confirmedSteps],
  );

  const value = useMemo<PortfolioCtx>(() => {
    const breakdown: AssetBreakdown[] = metrics.assets.map(a => {
      const cfg = STAKING_CONFIG.find(c => c.symbol === a.symbol);
      let yieldPct = 0;
      if (cfg) {
        for (const p of cfg.positions) {
          if (p.apy) yieldPct += (p.percentage / 100) * p.apy;
        }
      }
      const stakedQty = Math.min(a.holdings, ledger.bySymbol[a.symbol] ?? 0);
      const liquidQty = Math.max(0, a.holdings - stakedQty);
      const stakedValue = stakedQty * a.currentPrice;
      const holdValue = a.value - stakedValue;
      const projectedYieldUsd = a.value * (yieldPct / 100);
      return {
        symbol: a.symbol,
        value: a.value,
        holdValue,
        stakedValue,
        stakedQty,
        liquidQty,
        stakedEntries: ledger.breakdown[a.symbol] ?? [],
        projectedYieldUsd,
      };
    });

    const totalStakedValue = breakdown.reduce((s, b) => s + b.stakedValue, 0);
    const totalProjected = breakdown.reduce((s, b) => s + b.projectedYieldUsd, 0);
    const blendedApy = metrics.totalValue > 0 ? (totalProjected / metrics.totalValue) * 100 : 0;

    const executed = getExecutedLevels();
    let realizedProfit = 0;
    const realizedBySymbol: Record<string, number> = {};
    for (const cfg of PROFIT_CONFIGS) {
      const asset = metrics.assets.find(a => a.symbol.toLowerCase() === cfg.id);
      if (!asset || asset.invested <= 0) continue;
      const tokenLevels = executed.filter(e => e.tokenId === cfg.id);
      let assetRealized = 0;
      for (const ex of tokenLevels) {
        const lvl = cfg.levels.find(l => l.profitPct === ex.profitPct);
        if (!lvl) continue;
        assetRealized += asset.invested * (lvl.sellPct / 100) * (lvl.profitPct / 100);
      }
      if (assetRealized > 0) {
        realizedBySymbol[asset.symbol] = assetRealized;
        realizedProfit += assetRealized;
      }
    }
    const profitAvailable = Math.max(0, realizedProfit - movedProfit);
    const profitBySymbol: Record<string, number> = {};
    if (realizedProfit > 0) {
      const ratio = profitAvailable / realizedProfit;
      for (const [sym, val] of Object.entries(realizedBySymbol)) {
        profitBySymbol[sym] = val * ratio;
      }
    }

    const markProfitMoved = (usd: number) => {
      setMovedProfit(prev => {
        const next = prev + usd;
        try { localStorage.setItem(MOVED_KEY, String(next)); } catch { /* ignore */ }
        return next;
      });
    };

    const toggleSelected = (s: Exclude<AssetFilter, null>) =>
      setSelected(prev => (prev === s ? null : s));

    const portfolioData = buildPortfolioData({
      metrics,
      prices,
      pricesLoading,
      breakdown,
    });

    return {
      prices,
      metrics,
      portfolioData,
      totalValue: metrics.totalValue,
      totalStakedValue,
      blendedApy,
      breakdown,
      realizedProfit,
      realizedBySymbol,
      movedProfit,
      profitAvailable,
      profitBySymbol,
      cyborgUsdcDebt,
      markProfitMoved,
      updatePortfolioBalances,
      confirmExecutionStep,
      revertExecutionStep,
      isExecutionConfirmed,
      selected,
      setSelected,
      toggleSelected,
    };
  }, [prices, pricesLoading, metrics, selected, movedProfit, ledger, cyborgUsdcDebt, confirmedSteps, updatePortfolioBalances, confirmExecutionStep, revertExecutionStep, isExecutionConfirmed]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortfolio() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePortfolio must be used inside PortfolioProvider');
  return v;
}
