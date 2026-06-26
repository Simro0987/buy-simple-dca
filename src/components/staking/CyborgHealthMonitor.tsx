import type { CyborgHealthSnapshot, GasHealthStatus, LtvHealthStatus } from '@/lib/cyborgHealthMonitor';
import { LTV_MAX_PCT } from '@/lib/cyborgHealthMonitor';

const LTV_STATUS_CLASS: Record<LtvHealthStatus, string> = {
  safe: 'text-emerald-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
};

const GAS_DOT_CLASS: Record<GasHealthStatus, string> = {
  ok: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]',
  low: 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]',
};

export function CyborgHealthMonitor({
  sk,
  health,
}: {
  sk: boolean;
  health: CyborgHealthSnapshot;
}) {
  const ltvClass = LTV_STATUS_CLASS[health.ltvStatus];
  const gasLabel = health.gasStatus === 'ok'
    ? (sk ? 'OK' : 'OK')
    : (sk ? 'Top-up' : 'Top-up');

  return (
    <div className="rounded-xl border border-border/50 bg-background/60 px-3 py-2.5">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
        Cyborg Health
      </p>
      <div className="grid grid-cols-3 gap-2 text-center min-w-0">
        <div className="min-w-0">
          <p className="text-[9px] text-muted-foreground truncate">
            {sk ? 'Current LTV' : 'Current LTV'}
          </p>
          <p className={`text-sm font-bold font-mono tabular-nums ${ltvClass}`}>
            {health.currentLtvPct > 0 ? `${health.currentLtvPct.toFixed(1)}%` : '—'}
          </p>
          <p className="text-[8px] text-muted-foreground">max {LTV_MAX_PCT}%</p>
        </div>

        <div className="min-w-0">
          <p className="text-[9px] text-muted-foreground truncate">
            {sk ? 'Gas Status' : 'Gas Status'}
          </p>
          <div className="flex items-center justify-center gap-1.5 mt-1">
            <span className={`h-2.5 w-2.5 rounded-full ${GAS_DOT_CLASS[health.gasStatus]}`} />
            <span className={`text-xs font-semibold ${health.gasStatus === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
              {gasLabel}
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-[9px] text-muted-foreground truncate">
            {sk ? 'Next Action' : 'Next Action'}
          </p>
          <p className="text-xs font-bold text-violet-300 mt-0.5 truncate px-0.5">
            {health.nextActionLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
