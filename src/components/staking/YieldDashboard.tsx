import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useDefiApys } from '@/hooks/useDefiApys';
import { useCyborgEngine } from '@/stores/cyborgEngine';
import {
  buildYieldApyRates,
  buildYieldPositionsFromEntries,
  calculateYield,
  projectPassiveIncomeUsd,
  type YieldIncomePeriod,
} from '@/lib/yieldAggregator';
import { Button } from '@/components/ui/button';

const PERIOD_OPTIONS: { id: YieldIncomePeriod; labelSk: string; labelEn: string }[] = [
  { id: 'day', labelSk: '1 Deň', labelEn: '1 Day' },
  { id: 'month', labelSk: '1 Mesiac', labelEn: '1 Month' },
  { id: 'year', labelSk: '1 Rok', labelEn: '1 Year' },
];

export interface YieldDashboardProps {
  lang: Lang;
  lbtcSupplyApyPct?: number | null;
}

export function YieldDashboard({ lang, lbtcSupplyApyPct }: YieldDashboardProps) {
  const sk = lang === 'sk';
  const [period, setPeriod] = useState<YieldIncomePeriod>('day');
  const { breakdown, portfolioData } = usePortfolio();
  const { data: defiApys } = useDefiApys();
  const engineRevision = useCyborgEngine(s => s.revision);

  const yieldResult = useMemo(() => {
    try {
      const engineComputed = useCyborgEngine.getState().getComputed(
        buildYieldApyRates(defiApys ?? null, { lbtcSupply: lbtcSupplyApyPct ?? 0 }),
      );
      if (Number(engineComputed.weightedApyPct ?? 0) > 0 || Number(engineComputed.dailyPassiveIncomeUsd ?? 0) > 0) {
        return {
          weightedApyPct: Number(engineComputed.weightedApyPct ?? 0),
          dailyPassiveIncomeUsd: Number(engineComputed.dailyPassiveIncomeUsd ?? 0),
          activePositionCount: Number(useCyborgEngine.getState().stakingPositions?.length ?? 0),
          totalStakedUsd: Number(engineComputed.totalStakedUsd ?? 0),
        };
      }
      const prices = portfolioData?.prices ?? null;
      const entries = (breakdown ?? []).flatMap(asset => asset?.stakedEntries ?? []);
      const positions = buildYieldPositionsFromEntries(entries, prices);
      const apyRates = buildYieldApyRates(defiApys ?? null, {
        lbtcSupply: lbtcSupplyApyPct ?? 0,
      });
      return calculateYield(positions, apyRates);
    } catch {
      return calculateYield([], buildYieldApyRates(null));
    }
  }, [breakdown, portfolioData?.prices, defiApys, lbtcSupplyApyPct, engineRevision]);

  const passiveIncomeUsd = projectPassiveIncomeUsd(yieldResult.dailyPassiveIncomeUsd, period);
  const displayApy = Number.isFinite(yieldResult.weightedApyPct)
    ? yieldResult.weightedApyPct.toFixed(1)
    : '0.0';

  return (
    <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-emerald-300 shrink-0" />
        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
          Yield Dashboard
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground">
            {sk ? 'Aktuálny výnos portfólia' : 'Current portfolio yield'}
          </p>
          <p className="text-lg font-bold font-mono tabular-nums text-emerald-300 mt-0.5">
            {displayApy}%
          </p>
        </div>

        <div className="rounded-lg border border-border/40 bg-background/40 px-3 py-2.5">
          <p className="text-[10px] text-muted-foreground">
            {sk ? 'Pasívny príjem' : 'Passive income'}
          </p>
          <p className="text-lg font-bold font-mono tabular-nums text-foreground mt-0.5">
            {formatUsd(passiveIncomeUsd)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {PERIOD_OPTIONS.map(option => (
          <Button
            key={option.id}
            type="button"
            size="sm"
            variant={period === option.id ? 'default' : 'outline'}
            onClick={() => setPeriod(option.id)}
            className={`h-8 text-[10px] font-semibold touch-manipulation ${
              period === option.id
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'border-border/60'
            }`}
          >
            {sk ? option.labelSk : option.labelEn}
          </Button>
        ))}
      </div>
    </div>
  );
}
