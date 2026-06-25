import { Brain, TrendingDown, TrendingUp } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { loadDecisionLog } from '@/lib/hcdDecisionLog';
import { useHcdDecisionFeedback } from '@/hooks/useHcdDecisionFeedback';
import { useSyncExternalStore } from 'react';
import { HCD_DECISION_LOG_EVENT } from '@/lib/hcdDecisionLog';

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener(HCD_DECISION_LOG_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(HCD_DECISION_LOG_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

function actionLabel(actionType: string, sk: boolean): string {
  const labels: Record<string, { sk: string; en: string }> = {
    'core-stake': { sk: 'Core Fortress Staking', en: 'Core Fortress Staking' },
    'tactical-deploy': { sk: 'Taktický motor', en: 'Tactical motor' },
    'alchemix-deposit': { sk: 'Alchemix vklad', en: 'Alchemix deposit' },
    'alchemix-autonomous-rebalance': {
      sk: 'Autonómny presun z Alchemix',
      en: 'Autonomous Alchemix rebalance',
    },
  };
  const entry = labels[actionType] ?? { sk: actionType, en: actionType };
  return sk ? entry.sk : entry.en;
}

interface Props {
  lang: Lang;
  portfolioUsd: number;
}

export function HcdLearningLog({ lang, portfolioUsd }: Props) {
  const sk = lang === 'sk';
  const decisionLog = useSyncExternalStore(subscribe, loadDecisionLog, () => []);
  useHcdDecisionFeedback(portfolioUsd);

  const recent = [...decisionLog].reverse().slice(0, 8);
  if (recent.length === 0) return null;

  return (
    <div className="rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Brain className="w-4 h-4 text-violet-300" />
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-violet-300">
          {sk ? 'HCD Learning Log' : 'HCD Learning Log'}
        </h3>
      </div>
      <p className="text-[9px] text-muted-foreground leading-snug">
        {sk
          ? 'História rozhodnutí a PnL po 24h — pozitívny výsledok zvyšuje Confidence Score stratégie.'
          : 'Decision history and 24h PnL — positive outcomes boost strategy Confidence Score.'}
      </p>
      <div className="space-y-1.5 max-h-48 overflow-y-auto">
        {recent.map(entry => {
          const pnlReady = entry.confidenceRewardApplied && entry.pnl24hUsd != null;
          const pnlPositive = (entry.pnl24hUsd ?? 0) > 0;
          const date = new Date(entry.confirmedAt).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });

          return (
            <div
              key={entry.id}
              className="rounded-lg border border-border/40 bg-background/40 px-2.5 py-2 text-[10px]"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {actionLabel(entry.actionType, sk)}
                  </p>
                  <p className="text-muted-foreground tabular-nums">{date}</p>
                </div>
                {pnlReady && (
                  <div className={`flex items-center gap-1 shrink-0 font-mono font-semibold tabular-nums ${
                    pnlPositive ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {pnlPositive ? (
                      <TrendingUp className="w-3 h-3" />
                    ) : (
                      <TrendingDown className="w-3 h-3" />
                    )}
                    {entry.pnl24hPct != null
                      ? `${entry.pnl24hPct >= 0 ? '+' : ''}${entry.pnl24hPct.toFixed(2)}%`
                      : '—'}
                  </div>
                )}
              </div>
              {pnlReady && entry.pnl24hUsd != null && (
                <p className="text-[9px] text-muted-foreground mt-1 tabular-nums">
                  PnL 24h: {formatUsd(entry.pnl24hUsd)} · {sk ? 'Portfólio' : 'Portfolio'}: {formatUsd(entry.portfolioUsdAtConfirm)}
                </p>
              )}
              {entry.userRating && (
                <p className="text-[9px] text-muted-foreground mt-0.5">
                  {sk ? 'Hodnotenie' : 'Rating'}: {entry.userRating === 'up' ? '👍' : '👎'}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
