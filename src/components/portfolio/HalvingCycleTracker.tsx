import { Clock } from 'lucide-react';
import { Lang } from '@/lib/i18n';

interface Props { lang: Lang; }

// Bitcoin Halving dates
const LAST_HALVING_DATE = new Date('2024-04-19T00:00:00Z');
const NEXT_HALVING_DATE = new Date('2028-04-19T00:00:00Z');
const LAST_HALVING_PRICE = 64000;

export function HalvingCycleTracker({ lang }: Props) {
  const sk = lang === 'sk';
  const now = new Date();

  const totalCycleMs = NEXT_HALVING_DATE.getTime() - LAST_HALVING_DATE.getTime();
  const elapsedMs = now.getTime() - LAST_HALVING_DATE.getTime();
  const progress = Math.max(0, Math.min(100, (elapsedMs / totalCycleMs) * 100));

  const daysElapsed = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  const daysTotal = Math.floor(totalCycleMs / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);

  const barColor = progress >= 75
    ? 'bg-amber-400'
    : progress >= 50
      ? 'bg-emerald-400'
      : 'bg-primary';

  return (
    <div className="glass-card p-3 space-y-2" style={{ borderLeft: '2px solid rgba(247,147,26,0.6)' }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {sk ? 'Bitcoin Halving Cyklus' : 'Bitcoin Halving Cycle'}
          </span>
        </div>
        <span className="text-[10px] font-bold tabular-nums text-foreground">
          {progress.toFixed(1)}%
        </span>
      </div>

      {/* Thin progress bar */}
      <div className="w-full bg-secondary rounded-full h-1 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Tiny tick marks */}
      <div className="relative w-full h-2">
        {[0, 25, 50, 75, 100].map(pct => (
          <div
            key={pct}
            className="absolute top-0 w-px h-1.5 bg-border"
            style={{ left: `${pct}%` }}
          />
        ))}
      </div>

      {/* Contextual metrics */}
      <div className="flex items-center justify-between text-[9px] text-muted-foreground leading-tight">
        <span>
          {sk ? 'Posledný' : 'Last'}: Apr 2024 · ${LAST_HALVING_PRICE.toLocaleString()} USD
        </span>
        <span className="tabular-nums">
          {daysRemaining}d {sk ? 'do ďalšieho' : 'to next'}
        </span>
      </div>
      <div className="flex items-center justify-between text-[9px] text-muted-foreground leading-tight">
        <span>
          {sk ? 'Ďalší' : 'Next'}: Apr 2028
        </span>
        <span className="tabular-nums opacity-60">
          {daysElapsed}/{daysTotal}d
        </span>
      </div>
    </div>
  );
}
