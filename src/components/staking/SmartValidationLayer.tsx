import { AlertTriangle, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Lang } from '@/lib/i18n';
import { navigateToTab, setPendingSwap } from '@/lib/pendingActions';
import type { SmartValidationResult } from '@/lib/smartActionValidation';

export interface PortfolioBalanceStatusRowProps {
  lang: Lang;
  tokenSymbol: string;
  validation: SmartValidationResult;
  decimals?: number;
  skip?: boolean;
}

export function PortfolioBalanceStatusRow({
  lang,
  tokenSymbol,
  validation,
  decimals = 4,
  skip = false,
}: PortfolioBalanceStatusRowProps) {
  const sk = lang === 'sk';
  if (skip || validation.requiredAmount <= 0) return null;

  const ok = validation.sufficient;
  const balanceLabel = validation.userBalance.toFixed(decimals);
  const requiredLabel = validation.requiredAmount.toFixed(decimals);

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-[10px] ${
        ok
          ? 'border-emerald-500/35 bg-emerald-500/10 text-emerald-200'
          : 'border-orange-500/40 bg-orange-500/10 text-orange-200'
      }`}
    >
      {ok ? (
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
      ) : (
        <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />
      )}
      <span className="leading-snug">
        {sk ? 'Stav portfólia' : 'Portfolio status'}:{' '}
        <span className="font-mono font-semibold tabular-nums">{balanceLabel}</span>
        {' / '}
        <span className="font-mono font-semibold tabular-nums">{requiredLabel}</span>
        {' '}
        {tokenSymbol}
      </span>
    </div>
  );
}

export interface SmartValidationSolutionProps {
  lang: Lang;
  tokenSymbol: string;
  validation: SmartValidationResult;
  decimals?: number;
}

export function SmartValidationSolution({
  lang,
  tokenSymbol,
  validation,
  decimals = 4,
}: SmartValidationSolutionProps) {
  const sk = lang === 'sk';
  if (validation.sufficient || !validation.swapSuggestion) return null;

  const suggestion = validation.swapSuggestion;

  const handleSwap = () => {
    setPendingSwap({
      from: suggestion.from,
      to: suggestion.to,
      amountUsd: suggestion.amountUsd,
      source: 'action-plan',
      reason: sk ? suggestion.reasonSk : suggestion.reasonEn,
    });
    navigateToTab('swap');
    toast.success(sk
      ? `Swap pripravený: ${suggestion.from} → ${suggestion.to}`
      : `Swap prepared: ${suggestion.from} → ${suggestion.to}`);
  };

  return (
    <div className="rounded-lg border border-orange-500/45 bg-orange-500/10 p-2.5 space-y-2">
      <p className="text-[10px] font-medium text-orange-100 leading-snug">
        {sk
          ? `Nedostatok ${tokenSymbol}. Máš len ${validation.userBalance.toFixed(decimals)}, potrebuješ ${validation.requiredAmount.toFixed(decimals)}.`
          : `Insufficient ${tokenSymbol}. You have only ${validation.userBalance.toFixed(decimals)}, need ${validation.requiredAmount.toFixed(decimals)}.`}
      </p>
      <Button
        type="button"
        size="sm"
        onClick={handleSwap}
        className="w-full h-9 text-[10px] font-semibold touch-manipulation bg-orange-600 hover:bg-orange-500 text-white"
      >
        <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
        {sk
          ? `Swap ${suggestion.from} na ${suggestion.to}`
          : `Swap ${suggestion.from} to ${suggestion.to}`}
      </Button>
    </div>
  );
}
