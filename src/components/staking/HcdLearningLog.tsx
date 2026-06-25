import { Brain } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { layerLabelFromActionType } from '@/lib/hcdSilentTracker';
import { useHcdSilentTrackerState } from '@/hooks/useHcdSilentTracker';

interface Props {
  lang: Lang;
}

function formatPnlUsd(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${formatUsd(value)}`;
}

function formatPnlEth(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(4)} ETH`;
}

export function HcdLearningLog({ lang }: Props) {
  const sk = lang === 'sk';
  const { decisionLog, calibration } = useHcdSilentTrackerState();

  const latestCompleted = [...decisionLog].reverse().find(e => e.confidenceRewardApplied);
  const latestPending = [...decisionLog].reverse()[0];

  const lastOptimization = calibration.lastOptimizedLayer
    ?? (latestCompleted
      ? layerLabelFromActionType(latestCompleted.actionType, sk)
      : latestPending
        ? layerLabelFromActionType(latestPending.actionType, sk)
        : null);

  const pnlUsd = calibration.lastPnlUsd ?? latestCompleted?.pnl24hUsd ?? null;
  const pnlEth = calibration.lastPnlEth ?? latestCompleted?.pnl24hEth ?? null;
  const hasPendingCheck = decisionLog.some(e => !e.confidenceRewardApplied);

  const algorithmLabel = calibration.algorithmState === 'calibrating'
    ? (sk ? 'Sám sa kalibruje' : 'Self-calibrating')
    : (sk ? 'Stabilný' : 'Stable');

  return (
    <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-violet-300" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-violet-300">
          HCD Learning Log
        </h3>
      </div>

      <div className="space-y-1.5 text-[10px] leading-snug">
        <p className="text-foreground">
          <span className="text-muted-foreground">
            {sk ? 'Posledná optimalizácia: ' : 'Last optimization: '}
          </span>
          <span className="font-semibold">
            {lastOptimization ?? (sk ? 'Žiadna zatiaľ' : 'None yet')}
          </span>
        </p>

        <p className="text-foreground">
          <span className="text-muted-foreground">
            {sk ? 'Autonómna kontrola (24h PnL): ' : 'Autonomous check (24h PnL): '}
          </span>
          <span className={`font-mono font-semibold tabular-nums ${
            pnlUsd != null
              ? pnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'
              : 'text-muted-foreground'
          }`}>
            {pnlUsd != null
              ? `${formatPnlUsd(pnlUsd)} / ${formatPnlEth(pnlEth)}`
              : hasPendingCheck
                ? (sk ? 'Čaká sa na 24h kontrolu' : 'Awaiting 24h check')
                : '—'}
          </span>
        </p>

        <p className="text-foreground">
          <span className="text-muted-foreground">
            {sk ? 'Stav algoritmu: ' : 'Algorithm state: '}
          </span>
          <span className={`font-semibold ${
            calibration.algorithmState === 'calibrating' ? 'text-amber-300' : 'text-emerald-300'
          }`}>
            {algorithmLabel}
          </span>
        </p>
      </div>
    </div>
  );
}
