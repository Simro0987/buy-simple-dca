import { Zap } from 'lucide-react';

interface Props {
  /** Cycle score 0–100 (z useMarketCycleScore / effectiveScore) */
  score: number;
}

type Signal = 'CAPITULATION' | 'NEUTRAL' | 'PARABOLIC';

function deriveSignal(score: number): Signal {
  if (score <= 25) return 'CAPITULATION';
  if (score >= 80) return 'PARABOLIC';
  return 'NEUTRAL';
}

const CONFIG: Record<Signal, {
  label: string;
  emoji: string;
  bg: string;
  border: string;
  text: string;
  pulse: boolean;
  why: string;
}> = {
  CAPITULATION: {
    label: 'CAPITULATION (Oversold Dip)',
    emoji: '🟢',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/40',
    text: 'text-emerald-300',
    pulse: true,
    why: 'Engine posúva váhu z Marketu do staggered Limitov 3.5–6 % pod spotom — cieľom je chytiť hlboké likvidačné knôty.',
  },
  NEUTRAL: {
    label: 'NEUTRAL (Balanced Regime)',
    emoji: '⚪',
    bg: 'bg-secondary/60',
    border: 'border-border',
    text: 'text-foreground',
    pulse: false,
    why: 'Štandardný Market/Limit split podľa per-coin Dynamic Engine. Žiadny mimoriadny zásah.',
  },
  PARABOLIC: {
    label: 'PARABOLIC SQUEEZE (Overbought Top)',
    emoji: '🔴',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/40',
    text: 'text-rose-300',
    pulse: true,
    why: 'Market expozícia sa škrtí, kapitál sa posúva do tesných defenzívnych Limitov alebo Secure HODL boxu. Zákaz honiť cenu.',
  },
};

export function MoneyModeSignal({ score }: Props) {
  const sig = deriveSignal(score);
  const cfg = CONFIG[sig];

  return (
    <div className={`glass-card p-3 border ${cfg.border} ${cfg.bg}`}>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <Zap className={`w-3.5 h-3.5 ${cfg.text} ${cfg.pulse ? 'animate-pulse' : ''}`} />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Money Mode
          </span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cfg.border} ${cfg.text} tabular-nums`}>
          Score {Math.round(score)}/100
        </span>
      </div>
      <p className={`text-sm font-bold ${cfg.text} leading-tight`}>
        {cfg.emoji} {cfg.label}
      </p>
      <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">
        {cfg.why}
      </p>
    </div>
  );
}
