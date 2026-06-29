import { useCallback } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Lang } from '@/lib/i18n';
import { formatPositionQty } from '@/lib/positionOverview';
import type { TokenRequirementCheck } from '@/lib/portfolioTokenBalance';
import { navigateToTab, setPendingSwap, type SwapAsset } from '@/lib/pendingActions';

function toSwapAsset(token: string): SwapAsset {
  const upper = token.toUpperCase();
  if (upper === 'BTC') return 'BTC';
  if (upper === 'SOL') return 'SOL';
  if (upper === 'USDC' || upper === 'USDT') return 'USDC';
  return 'ETH';
}

export interface ActionTokenRequirementBannerProps {
  lang: Lang;
  check: TokenRequirementCheck;
  decimals?: number;
}

export function ActionTokenRequirementBanner({
  lang,
  check,
  decimals = 4,
}: ActionTokenRequirementBannerProps) {
  const sk = lang === 'sk';

  const handleSwap = useCallback(() => {
    const from = toSwapAsset(check.swapFromToken);
    const deficitUsd = Math.max(0, Number(check.swapDeficitUsd ?? 0));
    const deficitQty = Math.max(0, Number(check.swapDeficitAmount ?? 0));

    setPendingSwap({
      from,
      to: from,
      amountUsd: deficitUsd,
      source: 'manual',
      reason: sk
        ? `Swap ${deficitQty.toFixed(decimals)} ${check.swapFromToken} → ${check.requiredToken}`
        : `Swap ${deficitQty.toFixed(decimals)} ${check.swapFromToken} → ${check.requiredToken}`,
    });
    navigateToTab('swap');
    toast.success(sk ? 'Swap pripravený (iba chýbajúci rozdiel)' : 'Swap prepared (deficit only)');
  }, [check.requiredToken, check.swapDeficitAmount, check.swapDeficitUsd, check.swapFromToken, decimals, sk]);

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 space-y-2">
      <p className="text-[10px] text-amber-100 leading-snug tabular-nums">
        {sk ? 'Potrebuješ' : 'You need'}:{' '}
        <span className="font-mono font-semibold text-foreground">
          {formatPositionQty(check.requiredAmount, decimals)} {check.requiredToken}
        </span>
        {' | '}
        {sk ? 'Máš' : 'You have'}:{' '}
        <span className="font-mono font-semibold text-foreground">
          {formatPositionQty(check.heldAmount, decimals)} {check.requiredToken}
        </span>
      </p>
      {check.swapDeficitAmount > 0 && (
        <p className="text-[9px] text-muted-foreground tabular-nums">
          {sk ? 'Swap rozdiel' : 'Swap deficit'}:{' '}
          <span className="font-mono text-foreground">
            {formatPositionQty(check.swapDeficitAmount, decimals)} {check.requiredToken}
          </span>
          {check.swapFromToken !== check.requiredToken && (
            <>
              {' '}
              ({sk ? 'z' : 'from'} {check.swapFromToken})
            </>
          )}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleSwap}
        disabled={check.swapDeficitAmount <= 0}
        className="h-8 text-[10px] font-semibold touch-manipulation border-amber-500/50 text-amber-100 hover:bg-amber-500/15"
      >
        <ArrowLeftRight className="w-3.5 h-3.5 mr-1" />
        Swap
      </Button>
    </div>
  );
}
