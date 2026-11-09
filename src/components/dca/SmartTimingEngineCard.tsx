import { Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

type TimingState = 'go' | 'wait' | 'delay';

interface SmartTimingEngineCardProps {
  state?: TimingState;
  verdict?: string;
  reason?: string;
  className?: string;
}

const CONFIG: Record<
  TimingState,
  {
    label: string;
    verdict: string;
    reason: string;
    iconColor: string;
    borderColor: string;
    bgColor: string;
    dotColor: string;
  }
> = {
  go: {
    label: 'GO',
    verdict: 'Odporúčaný nákup: Dnes (Pondelok)',
    reason:
      'Trh je stabilný, žiadne víkendové anomálie. Štandardná DCA exekúcia je bezpečná.',
    iconColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/30',
    bgColor: 'bg-emerald-500/10',
    dotColor: 'bg-emerald-400',
  },
  wait: {
    label: 'WAIT',
    verdict: 'Odporúčaný nákup: Dnes po 15:30',
    reason:
      'Zvýšená ranná volatilita. Odporúčame počkať na otvorenie amerických trhov (TradFi/ETF) pre potvrdenie trendu.',
    iconColor: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    bgColor: 'bg-amber-500/10',
    dotColor: 'bg-amber-400',
  },
  delay: {
    label: 'DELAY',
    verdict: 'Odporúčaný nákup: Utorok / Streda',
    reason:
      "Detekovaný víkendový 'fakeout' (4H RSI > 75) a otvorený CME gap nižšie. Očakáva sa krátkodobá korekcia, nákup zatiaľ odkladáme.",
    iconColor: 'text-orange-400',
    borderColor: 'border-orange-500/30',
    bgColor: 'bg-orange-500/10',
    dotColor: 'bg-orange-400',
  },
};

export function SmartTimingEngineCard({ state = 'go', verdict, reason, className }: SmartTimingEngineCardProps) {
  const base = CONFIG[state];
  const cfg = { ...base, verdict: verdict ?? base.verdict, reason: reason ?? base.reason };

  return (
    <div
      className={cn(
        'glass-card p-4 border-l-[3px]',
        cfg.borderColor,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex-shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center',
            cfg.bgColor,
          )}
        >
          <Clock className={cn('w-5 h-5', cfg.iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={cn('text-[10px] font-black tracking-widest', cfg.iconColor)}>
              SMART TIMING ENGINE
            </span>
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full animate-pulse',
                cfg.dotColor,
              )}
            />
          </div>
          <p className="text-sm font-bold text-foreground leading-tight">
            {cfg.verdict}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            <span className="font-semibold text-foreground/70">Dôvod: </span>
            {cfg.reason}
          </p>
        </div>
        <div
          className={cn(
            'flex-shrink-0 px-2 py-1 rounded-full text-[10px] font-bold tracking-wide border',
            cfg.iconColor,
            cfg.borderColor,
            cfg.bgColor,
          )}
        >
          {cfg.label}
        </div>
      </div>
    </div>
  );
}

export type { TimingState };
