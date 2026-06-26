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
  priceUsd?: number;
}

export function ActionTokenRequirementBanner({
  lang,
  check,
  decimals = 4,
  priceUsd,
}: ActionTokenRequirementBannerProps) {
  const sk = lang === 'sk';

  const handleSwap = useCallback(() => {
    const from = toSwapAsset(check.walletToken);
    const to = toSwapAsset(check.requiredToken);
    const amountUsd = Number(priceUsd ?? 0) > 0
      ? Number(priceUsd)
      : Number(check.requiredAmount ?? 0) * (from === 'ETH' ? 3000 : from === 'SOL' ? 150 : 60_000);

    setPendingSwap({
      from,
      to: from === to ? from : to,
      amountUsd: Math.max(0, amountUsd),
      source: 'manual',
      reason: sk
        ? `Potrebný ${check.requiredToken} pre exekúciu Action Planu`
        : `Need ${check.requiredToken} for Action Plan execution`,
    });
    navigateToTab('swap');
    toast.success(sk ? 'Swap pripravený' : 'Swap prepared');
  }, [check.requiredAmount, check.requiredToken, check.walletToken, priceUsd, sk]);

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 space-y-2">
      <p className="text-[10px] text-amber-100 leading-snug tabular-nums">
        {sk ? 'Potrebný token' : 'Required token'}:{' '}
        <span className="font-mono font-semibold text-foreground">{check.requiredToken}</span>
        {' | '}
        {sk ? 'V peňaženke' : 'In wallet'}:{' '}
        <span className="font-mono font-semibold text-foreground">
          {formatPositionQty(check.walletBalance, decimals)} {check.walletToken}
        </span>
      </p>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={handleSwap}
        className="h-8 text-[10px] font-semibold touch-manipulation border-amber-500/50 text-amber-100 hover:bg-amber-500/15"
      >
        <ArrowLeftRight className="w-3.5 h-3.5 mr-1" />
        Swap
      </Button>
    </div>
  );
}
