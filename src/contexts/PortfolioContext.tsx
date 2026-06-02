import { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { usePrices } from '@/hooks/usePrices';
import { usePortfolioMetrics, type PortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { STAKING_CONFIG } from '@/lib/wallets';
import { PROFIT_CONFIGS, getExecutedLevels } from '@/lib/profitTaking';
import { useStakingLedger } from '@/hooks/useStakingLedger';
import type { StakedEntry } from '@/lib/stakingLedger';
import type { PriceData } from '@/lib/crypto';

export type AssetFilter = 'BTC' | 'ETH' | 'SOL' | null;

interface AssetBreakdown {
  symbol: string;
  value: number;
  holdValue: number;
  stakedValue: number;
  stakedQty: number;
  liquidQty: number;
  stakedEntries: StakedEntry[];
  projectedYieldUsd: number;   // annualised
}

interface PortfolioCtx {
  prices: PriceData | undefined;
  metrics: PortfolioMetrics;
  totalValue: number;          // includes staked positions (same as metrics.totalValue but explicit)
  totalStakedValue: number;
  blendedApy: number;          // weighted across staking positions
  breakdown: AssetBreakdown[];
  realizedProfit: number;      // sum of executed profit levels in USD
  realizedBySymbol: Record<string, number>; // per-asset realized USD
  movedProfit: number;
  profitAvailable: number;     // realized − moved
  profitBySymbol: Record<string, number>; // per-asset available USD
  markProfitMoved: (usd: number) => void;
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
  const { data: prices } = usePrices();
  const metrics = usePortfolioMetrics(prices);
  const ledger = useStakingLedger();
  const [selected, setSelected] = useState<AssetFilter>(null);
  const [movedProfit, setMovedProfit] = useState<number>(loadMoved());

  const value = useMemo<PortfolioCtx>(() => {
    // Per-asset breakdown: liquid vs staked driven by the MANUAL LEDGER (source of truth).
    // CRITICAL: staked qty is NEVER subtracted from total holdings/net worth — it stays part of the asset.
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

    // Realized profit estimate: per-asset invested × sellPct% × profitPct%
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
    // proportionally distribute moved across assets
    const profitBySymbol: Record<string, number> = {};
    if (realizedProfit > 0) {
      const ratio = profitAvailable / realizedProfit;
      for (const [sym, val] of Object.entries(realizedBySymbol)) {
        profitBySymbol[sym] = val * ratio;
      }
    }

    const markProfitMoved = (usd: number) => {
      const next = movedProfit + usd;
      setMovedProfit(next);
      try { localStorage.setItem(MOVED_KEY, String(next)); } catch { /* ignore */ }
    };

    const toggleSelected = (s: Exclude<AssetFilter, null>) =>
      setSelected(prev => (prev === s ? null : s));

    return {
      prices,
      metrics,
      totalValue: metrics.totalValue,
      totalStakedValue,
      blendedApy,
      breakdown,
      realizedProfit,
      realizedBySymbol,
      movedProfit,
      profitAvailable,
      profitBySymbol,
      markProfitMoved,
      selected,
      setSelected,
      toggleSelected,
    };
  }, [prices, metrics, selected, movedProfit, ledger]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortfolio() {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePortfolio must be used inside PortfolioProvider');
  return v;
}
