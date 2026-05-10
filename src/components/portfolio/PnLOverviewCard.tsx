import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import { usePortfolio } from '@/contexts/PortfolioContext';

interface Props { lang: Lang; }

export function PnLOverviewCard({ lang }: Props) {
  const sk = lang === 'sk';
  const { metrics } = usePortfolio();
  const { totalPnl, totalPnlPct, totalInvested, totalValue, assets } = metrics;

  const isGain = totalPnl >= 0;
  const TotalIcon = isGain ? TrendingUp : TrendingDown;

  return (
    <Card className="border-border bg-card overflow-hidden">
      <div className={`h-1 ${isGain ? 'bg-gradient-to-r from-green-500 to-emerald-400' : 'bg-gradient-to-r from-red-500 to-rose-400'}`} />
      <CardContent className="p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TotalIcon className={`w-4 h-4 ${isGain ? 'text-gain' : 'text-loss'}`} />
            <h3 className="text-sm font-semibold text-foreground">
              {sk ? 'Zisk / Strata portfólia' : 'Portfolio P/L'}
            </h3>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {sk ? 'vs. priemerná nákupná cena' : 'vs. avg cost'}
          </span>
        </div>

        {/* Total P/L block */}
        <div className="rounded-lg bg-secondary/40 p-3 space-y-2">
          <p className="text-[11px] text-muted-foreground">
            {sk ? 'Celkové P/L' : 'Total P/L'}
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <p className={`text-2xl font-bold tabular-nums ${isGain ? 'text-gain' : 'text-loss'}`}>
              {isGain ? '+' : ''}{formatUsd(totalPnl)}
            </p>
            <p className={`text-base font-semibold tabular-nums ${isGain ? 'text-gain' : 'text-loss'}`}>
              {isGain ? '+' : ''}{totalPnlPct.toFixed(2)}%
            </p>
          </div>
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1 border-t border-border/40">
            <span>{sk ? 'Investované' : 'Invested'}: <span className="text-foreground font-medium">{formatUsd(totalInvested)}</span></span>
            <span>{sk ? 'Hodnota' : 'Value'}: <span className="text-foreground font-medium">{formatUsd(totalValue)}</span></span>
          </div>
        </div>

        {/* Per-token P/L */}
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {sk ? 'Podľa tokenu' : 'By token'}
          </p>
          {assets.map(a => {
            const aGain = a.pnl >= 0;
            const hasInvest = a.invested > 0;
            return (
              <div
                key={a.symbol}
                className="flex items-center justify-between rounded-md bg-secondary/30 border border-border/40 px-3 py-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-foreground w-9">{a.symbol}</span>
                  {hasInvest ? (
                    <span className="text-[10px] text-muted-foreground">
                      {sk ? 'Inv' : 'Inv'} {formatUsd(a.invested)} → {formatUsd(a.value)}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground">
                      {sk ? 'bez nákupnej ceny' : 'no cost basis'}
                    </span>
                  )}
                </div>
                {hasInvest ? (
                  <div className="text-right">
                    <p className={`text-xs font-bold tabular-nums ${aGain ? 'text-gain' : 'text-loss'}`}>
                      {aGain ? '+' : ''}{formatUsd(a.pnl)}
                    </p>
                    <p className={`text-[10px] tabular-nums ${aGain ? 'text-gain' : 'text-loss'}`}>
                      {aGain ? '+' : ''}{a.pnlPct.toFixed(2)}%
                    </p>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground">—</span>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-muted-foreground text-center">
          {sk
            ? 'P/L = aktuálna hodnota − investované (DCA + počiatočná nákupná cena).'
            : 'P/L = current value − invested (DCA + initial cost basis).'}
        </p>
      </CardContent>
    </Card>
  );
}
