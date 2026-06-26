import { BrainCircuit } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import {
  getDynamicReason,
  resolveActionSymbol,
  resolveActionType,
  type CyborgActionType,
  type CyborgReasonAction,
} from '@/lib/cyborgReasoning';
import { useCyborgEngine } from '@/stores/cyborgEngine';

export interface LogicPanelProps {
  /** Coarse action family — preferred when set explicitly. */
  actionType?: CyborgActionType;
  /** Granular action key from execution component — mapped to actionType when needed. */
  action?: CyborgReasonAction;
  /** Optional asset override (e.g. ETH, BTC). */
  symbol?: string;
  lang: Lang;
  className?: string;
}

export function LogicPanel({
  actionType,
  action,
  symbol,
  lang,
  className = '',
}: LogicPanelProps) {
  const marketScore = useCyborgEngine(s => Number(s.reasoningContext?.marketScore ?? 0));
  const fearGreed = useCyborgEngine(s => Number(s.reasoningContext?.fearGreed ?? 0));
  const marketMode = useCyborgEngine(s => s.marketMode);
  const weightedApyPct = useCyborgEngine(s => Number(s.reasoningContext?.weightedApyPct ?? 0));
  const stakedRatio = useCyborgEngine(s => Number(s.reasoningContext?.stakedRatio ?? 0));
  const marketData = useCyborgEngine(s => s.marketData);
  const revision = useCyborgEngine(s => s.revision);

  const resolvedType = actionType ?? (action ? resolveActionType(action) : 'STAKE');
  const resolvedSymbol = symbol ?? (action ? resolveActionSymbol(action) : undefined);

  const text = getDynamicReason(resolvedType, marketScore, {
    lang,
    symbol: resolvedSymbol,
    coin: resolvedSymbol,
    fearGreed,
    marketMode,
    weightedApyPct,
    stakedRatio,
    marketData,
  });

  void revision;

  if (!text) return null;

  const sk = lang === 'sk';

  return (
    <div
      className={`rounded-lg border border-cyan-400/35 bg-cyan-500/5 px-2.5 py-2 shadow-[0_0_12px_rgba(34,211,238,0.08)] ${className}`}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <BrainCircuit className="w-3 h-3 text-cyan-300/90 shrink-0" />
        <p className="text-[9px] font-bold uppercase tracking-wider text-cyan-300/90">
          {sk ? 'Cyborg Logic' : 'Cyborg Logic'}
        </p>
      </div>
      <p className="text-[10px] text-cyan-50/90 leading-snug">{text}</p>
    </div>
  );
}
