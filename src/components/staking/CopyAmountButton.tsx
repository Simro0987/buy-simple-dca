import { useCallback, useState } from 'react';
import { ClipboardCopy } from 'lucide-react';
import { Lang } from '@/lib/i18n';

interface Props {
  lang: Lang;
  value: number;
  decimals: number;
  disabled?: boolean;
  className?: string;
}

export function CopyAmountButton({ lang, value, decimals, disabled, className }: Props) {
  const sk = lang === 'sk';
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (disabled || value <= 0) return;
    const text = value.toFixed(decimals);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [decimals, disabled, value]);

  return (
    <button
      type="button"
      disabled={disabled || value <= 0}
      onClick={() => void handleCopy()}
      title={copied ? (sk ? 'Skopírované!' : 'Copied!') : (sk ? 'Kopírovať číslo' : 'Copy amount')}
      className={`inline-flex items-center justify-center rounded p-0.5 transition-colors touch-manipulation disabled:opacity-40 disabled:pointer-events-none ${
        copied ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'
      } ${className ?? ''}`}
      aria-label={sk ? 'Kopírovať' : 'Copy'}
    >
      <ClipboardCopy className="w-3.5 h-3.5" />
    </button>
  );
}
