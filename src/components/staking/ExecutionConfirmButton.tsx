import { useCallback, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Lang } from '@/lib/i18n';

const PROCESSING_MS = 1000;

export interface ExecutionConfirmButtonProps {
  lang: Lang;
  confirmed: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onRevert?: () => void;
  confirmLabel?: string;
  confirmedLabel?: string;
  showExternalLink?: boolean;
  externalLinkIcon?: React.ReactNode;
}

export function ExecutionConfirmButton({
  lang,
  confirmed,
  disabled,
  onConfirm,
  onRevert,
  confirmLabel,
  confirmedLabel,
  showExternalLink,
  externalLinkIcon,
}: ExecutionConfirmButtonProps) {
  const sk = lang === 'sk';
  const [processing, setProcessing] = useState(false);

  const handleConfirm = useCallback(async () => {
    if (processing || confirmed || disabled) return;
    setProcessing(true);
    onConfirm();
    await new Promise(resolve => window.setTimeout(resolve, PROCESSING_MS));
    setProcessing(false);
  }, [processing, confirmed, disabled, onConfirm]);

  if (confirmed) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onRevert}
        disabled={disabled}
        className="h-8 text-[10px] font-semibold touch-manipulation border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 shrink-0"
      >
        <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-400" />
        {confirmedLabel ?? (sk ? 'Zaradené do portfólia' : 'Added to portfolio')}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="sm"
      onClick={() => void handleConfirm()}
      disabled={disabled || processing}
      className="h-8 text-[10px] font-semibold touch-manipulation bg-violet-600 hover:bg-violet-500 text-white shrink-0"
    >
      {processing ? (
        <>
          <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          {sk ? 'Spracovávam...' : 'Processing...'}
        </>
      ) : (
        <>
          {confirmLabel ?? (sk ? 'Potvrdiť exekúciu' : 'Confirm execution')}
          {showExternalLink && externalLinkIcon}
        </>
      )}
    </Button>
  );
}
