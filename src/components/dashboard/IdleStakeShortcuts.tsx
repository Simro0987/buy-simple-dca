import { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { nativeTicker } from '@/lib/tickerLabels';
import { setPendingStake, navigateToTab } from '@/lib/pendingActions';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { toast } from 'sonner';

interface Props { lang: Lang; }

const MIN_IDLE_USD = 100;

// Quick-action chips for ETH/SOL liquid balances that aren't staked yet.
// Manual: only pre-fills Stake module — never signs anything.
export function IdleStakeShortcuts({ lang }: Props) {
  const sk = lang === 'sk';
  const { breakdown } = usePortfolio();

  const candidates = useMemo(() => {
    return breakdown
      .filter(b => (b.symbol === 'ETH' || b.symbol === 'SOL'))
      .map(b => ({
        symbol: nativeTicker(b.symbol),
        liquidQty: b.liquidQty,
        liquidUsd: b.liquidQty * (b.value / Math.max(b.value > 0 ? b.value / (b.liquidQty + b.stakedQty || 1) : 1, 1)),
      }))
      .filter(c => c.liquidQty > 0);
  }, [breakdown]);

  // Recompute USD properly using price-derived ratio (avoid NaN)
  const enriched = breakdown
    .filter(b => b.symbol === 'ETH' || b.symbol === 'SOL')
    .map(b => {
      const total = b.liquidQty + b.stakedQty;
      const pricePerUnit = total > 0 ? b.value / total : 0;
      const liquidUsd = b.liquidQty * pricePerUnit;
      return { symbol: b.symbol, liquidQty: b.liquidQty, liquidUsd };
    })
    .filter(c => c.liquidUsd >= MIN_IDLE_USD);

  if (enriched.length === 0) return null;

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-violet-300" />
        <span className="text-xs font-semibold text-foreground">
          {sk ? 'Voľné zostatky pripravené na staking' : 'Idle balances ready to stake'}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {enriched.map(c => (
          <button
            key={c.symbol}
            onClick={() => {
              setPendingStake({ symbol: c.symbol as 'ETH' | 'SOL', amount: c.liquidQty, source: 'swap' });
              navigateToTab('staking');
              toast.success(sk
                ? `Stake predvyplnený: ${c.liquidQty.toFixed(4)} ${c.symbol}`
                : `Stake prefilled: ${c.liquidQty.toFixed(4)} ${c.symbol}`);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/40 text-violet-200 text-[11px] font-semibold active:scale-95 hover:bg-violet-500/25 transition"
          >
            <span>⚡</span>
            <span>{sk ? 'Stakovať' : 'Stake'} {c.liquidQty.toFixed(4)} {c.symbol}</span>
            <span className="text-violet-300/70 tabular-nums">({formatUsd(c.liquidUsd)})</span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground leading-snug">
        {sk
          ? 'Predvyplní Staking Yield Planner. Finálne podpisuješ ručne na hardvérovej peňaženke.'
          : 'Prefills Staking Yield Planner. You sign manually on your hardware wallet.'}
      </p>
    </div>
  );
}
