import { useMemo } from 'react';
import { BrainCircuit } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { useCyborgEngine, type CyborgReasonAction } from '@/stores/cyborgEngine';

export interface LogicPanelProps {
  action: CyborgReasonAction;
  lang: Lang;
  className?: string;
}

export function LogicPanel({ action, lang, className = '' }: LogicPanelProps) {
  const revision = useCyborgEngine(s => s.revision);
  const text = useMemo(
    () => useCyborgEngine.getState().getReason(action, lang),
    [action, lang, revision],
  );

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
