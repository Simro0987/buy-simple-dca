import { ClipboardCopy, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { Button } from '@/components/ui/button';

interface Props {
  lang: Lang;
  value: number;
  decimals: number;
  confirmed: boolean;
  disabled?: boolean;
  onConfirm: () => void;
}

async function copyNumericAmount(value: number, decimals: number, lang: Lang): Promise<void> {
  const text = value.toFixed(decimals);
  try {
    await navigator.clipboard.writeText(text);
    toast.success(lang === 'sk' ? 'Skopírované' : 'Copied');
  } catch {
    toast.error(lang === 'sk' ? 'Kopírovanie zlyhalo' : 'Copy failed');
  }
}

export function GranularExecutionButtons({
  lang, value, decimals, confirmed, disabled, onConfirm,
}: Props) {
  const sk = lang === 'sk';

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 touch-manipulation"
        disabled={disabled || value <= 0}
        onClick={() => void copyNumericAmount(value, decimals, lang)}
        title={sk ? 'Kopírovať hodnotu' : 'Copy value'}
      >
        <span className="text-sm leading-none">📋</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 touch-manipulation"
        disabled={disabled || confirmed || value <= 0}
        onClick={onConfirm}
        title={sk ? 'Potvrdiť realizáciu' : 'Confirm execution'}
      >
        <span className="text-sm leading-none">✅</span>
      </Button>
      {confirmed && (
        <span className="text-[9px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">
          {sk ? 'Hotovo' : 'Done'}
        </span>
      )}
    </div>
  );
}
