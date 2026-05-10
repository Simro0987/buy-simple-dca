import { Wallet } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';
import type { PortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  metrics: PortfolioMetrics;
  weeklyCapital: number;
  cashReserve: number;
}

export function PortfolioSummaryCard({ metrics, weeklyCapital, cashReserve }: Props) {
  if (metrics.loading) {
    return (
      <div className="glass-card p-5 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1.5">
          <Wallet className="w-3 h-3" /> Hodnota portfólia
        </p>
      </div>
      <p className="text-4xl font-bold text-foreground tabular-nums">{formatUsd(metrics.totalValue)}</p>

      <div className="grid grid-cols-2 gap-2 mt-4 text-xs">
        <div className="bg-secondary/60 rounded-lg p-2.5">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Investované</p>
          <p className="font-semibold text-foreground tabular-nums">{formatUsd(metrics.totalInvested)}</p>
        </div>
        <div className="bg-secondary/60 rounded-lg p-2.5">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Týž. kapitál</p>
          <p className="font-semibold text-foreground tabular-nums">{formatUsd(weeklyCapital)}</p>
        </div>
        <div className="bg-secondary/60 rounded-lg p-2.5">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Hotovostná rezerva</p>
          <p className="font-semibold text-foreground tabular-nums">{formatUsd(cashReserve)}</p>
        </div>
        <div className="bg-secondary/60 rounded-lg p-2.5">
          <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Týždňov v histórii</p>
          <p className="font-semibold text-foreground tabular-nums">{metrics.history.length}</p>
        </div>
      </div>
    </div>
  );
}
