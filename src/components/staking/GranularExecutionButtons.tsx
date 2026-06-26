import { Undo2 } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { CopyAmountButton } from '@/components/staking/CopyAmountButton';
import { LogicPanel } from '@/components/staking/LogicPanel';
import type { CyborgReasonAction } from '@/stores/cyborgEngine';

interface Props {
  lang: Lang;
  value: number;
  decimals: number;
  confirmed: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onRevert?: () => void;
  reasonAction?: CyborgReasonAction;
}

export function GranularExecutionButtons({
  lang, value, decimals, confirmed, disabled, onConfirm, onRevert, reasonAction = 'stake_split',
}: Props) {
  const sk = lang === 'sk';

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-2 shrink-0">
        <CopyAmountButton lang={lang} value={value} decimals={decimals} disabled={disabled} />
        {confirmed ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 touch-manipulation hover:bg-orange-500/15"
            disabled={disabled || !onRevert}
            onClick={onRevert}
            title={sk ? 'Vrátiť akciu' : 'Undo action'}
          >
            <Undo2 className="w-3.5 h-3.5 text-orange-400" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 touch-manipulation"
            disabled={disabled || value <= 0}
            onClick={onConfirm}
            title={sk ? 'Potvrdiť realizáciu' : 'Confirm execution'}
          >
            <span className="text-sm leading-none">✅</span>
          </Button>
        )}
        {confirmed && (
          <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
            {sk ? 'Hotovo' : 'Done'}
          </span>
        )}
      </div>
      {!confirmed && reasonAction && (
        <LogicPanel action={reasonAction} lang={lang} className="w-[min(100%,220px)]" />
      )}
    </div>
  );
}
