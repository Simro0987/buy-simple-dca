import { Clock } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { BentoCard } from '@/components/portfolio/ui/BentoCard';

interface Props { lang: Lang; }

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
    ? 'bg-neon-gold'
    : progress >= 50
      ? 'bg-neon-green'
      : 'bg-neon-green';

  return (
    <BentoCard accentColor="rgba(247,147,26,0.6)" padding="sm" className="space-y-2 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-white/40" />
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
            {sk ? 'Bitcoin Halving Cyklus' : 'Bitcoin Halving Cycle'}
          </span>
        </div>
        <span className="text-[10px] font-mono font-bold tabular-nums text-white">
          {progress.toFixed(1)}%
        </span>
      </div>

      <div className="w-full bg-white/[0.06] rounded-full h-1 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="relative w-full h-2">
        {[0, 25, 50, 75, 100].map(pct => (
          <div
            key={pct}
            className="absolute top-0 w-px h-1.5 bg-white/10"
            style={{ left: `${pct}%` }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-[9px] text-white/35 leading-tight">
        <span>
          {sk ? 'Posledný' : 'Last'}: Apr 2024 · ${LAST_HALVING_PRICE.toLocaleString()} USD
        </span>
        <span className="font-mono tabular-nums">
          {daysRemaining}d {sk ? 'do ďalšieho' : 'to next'}
        </span>
      </div>
      <div className="flex items-center justify-between text-[9px] text-white/35 leading-tight">
        <span>{sk ? 'Ďalší' : 'Next'}: Apr 2028</span>
        <span className="font-mono tabular-nums opacity-60">
          {daysElapsed}/{daysTotal}d
        </span>
      </div>
    </BentoCard>
  );
}
