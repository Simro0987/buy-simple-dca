import { useCallback, useState } from 'react';
import { CheckCircle2, ClipboardCopy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { formatAtomicCopyText } from '@/lib/atomicActionPlan';
import type { TokenRequirementCheck } from '@/lib/portfolioTokenBalance';
import { ActionTokenRequirementBanner } from '@/components/staking/ActionTokenRequirementBanner';

export interface AtomicActionBlockProps {
  lang: Lang;
  title: string;
  tokenAmount: number;
  tokenSymbol: string;
  usdAmount: number;
  decimals?: number;
  actionUrl?: string;
  contractHint?: string;
  confirmed: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onRevert: () => void;
  tokenCheck?: TokenRequirementCheck | null;
}

export function AtomicActionBlock({
  lang,
  title,
  tokenAmount,
  tokenSymbol,
  usdAmount,
  decimals = 2,
  actionUrl,
  contractHint,
  confirmed,
  disabled,
  onConfirm,
  onRevert,
  tokenCheck,
}: AtomicActionBlockProps) {
  const sk = lang === 'sk';
  const [copied, setCopied] = useState(false);
  const safeAmount = Number.isFinite(tokenAmount) ? tokenAmount : 0;
  const safeUsd = Number.isFinite(usdAmount) ? usdAmount : 0;
  const insufficientToken = Boolean(tokenCheck && !tokenCheck.hasEnoughToken);
  const inactive = disabled || safeAmount <= 0 || insufficientToken;

  const handleCopy = useCallback(async () => {
    if (inactive) return;
    const text = formatAtomicCopyText(safeAmount, tokenSymbol, safeUsd, decimals);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(sk ? 'Skopírované do schránky' : 'Copied to clipboard');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(sk ? 'Kopírovanie zlyhalo' : 'Copy failed');
    }
  }, [inactive, safeAmount, tokenSymbol, safeUsd, decimals, sk]);

  const handleConfirm = useCallback(() => {
    if (inactive || confirmed) return;
    if (actionUrl) {
      window.open(actionUrl, '_blank', 'noopener,noreferrer');
    }
    onConfirm();
  }, [inactive, confirmed, actionUrl, onConfirm]);

  return (
    <div
      className={`rounded-lg border p-2.5 space-y-2 transition-colors ${
        confirmed
          ? 'border-emerald-500/50 bg-emerald-500/5'
          : 'border-border/50 bg-muted/20'
      }`}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 min-w-0">
          {confirmed ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <span className="w-4 h-4 rounded-full border border-muted-foreground/40 shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-foreground leading-snug">{title}</p>
            {confirmed && (
              <p className="text-[9px] font-medium text-emerald-400">
                {sk ? 'Hotovo' : 'Done'}
              </p>
            )}
          </div>
        </div>
        {confirmed ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRevert}
            disabled={disabled}
            className="h-8 text-[10px] font-semibold touch-manipulation border-emerald-500/50 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 shrink-0"
          >
            {sk ? 'Potvrdené' : 'Confirmed'}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={handleConfirm}
            disabled={inactive || disabled}
            className="h-8 text-[10px] font-semibold touch-manipulation bg-violet-600 hover:bg-violet-500 text-white shrink-0"
          >
            {sk ? 'Potvrdiť exekúciu' : 'Confirm execution'}
            {actionUrl && <ExternalLink className="w-3 h-3 ml-1 opacity-80" />}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono font-semibold tabular-nums text-foreground">
          <span>{safeAmount.toFixed(decimals)} {tokenSymbol}</span>
          <span className="text-muted-foreground font-normal">· {formatUsd(safeUsd)}</span>
          <button
            type="button"
            disabled={inactive}
            onClick={() => void handleCopy()}
            title={copied ? (sk ? 'Skopírované!' : 'Copied!') : (sk ? 'Kopírovať sumu' : 'Copy amount')}
            className={`inline-flex items-center justify-center rounded p-0.5 transition-colors touch-manipulation disabled:opacity-40 ${
              copied ? 'text-emerald-400' : 'text-muted-foreground hover:text-foreground'
            }`}
            aria-label={sk ? 'Kopírovať' : 'Copy'}
          >
            <ClipboardCopy className="w-3.5 h-3.5" />
          </button>
        </div>
        {contractHint && (
          <p className="text-[9px] text-muted-foreground mt-1 font-mono truncate" title={contractHint}>
            {contractHint}
          </p>
        )}
      </div>

      {insufficientToken && tokenCheck && (
        <ActionTokenRequirementBanner
          lang={lang}
          check={tokenCheck}
          decimals={decimals}
          priceUsd={safeUsd}
        />
      )}
    </div>
  );
}
