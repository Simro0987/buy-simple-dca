import { Zap, Info } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { nativeTicker } from '@/lib/tickerLabels';
import { setPendingStake, navigateToTab } from '@/lib/pendingActions';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  computeAdvice,
  strategyCommentary,
  overheatedWarning,
  type AdvisorSymbol,
  type AdvisorResult,
} from '@/lib/stakeAdvisor';

interface Props {
  lang: Lang;
  marketScore: number;
}

// Quick-action chips for BTC/ETH/SOL liquid balances driven by the
// network-aware stake advisor. MANUAL: only pre-fills Stake module.
export function IdleStakeShortcuts({ lang, marketScore }: Props) {
  const sk = lang === 'sk';
  const { breakdown } = usePortfolio();

  const advised: AdvisorResult[] = breakdown
    .filter(b => b.symbol === 'BTC' || b.symbol === 'ETH' || b.symbol === 'SOL')
    .map(b => {
      const totalQty = b.liquidQty + b.stakedQty;
      const pricePerUnit = totalQty > 0 ? b.value / totalQty : 0;
      return computeAdvice({
        symbol: b.symbol as AdvisorSymbol,
        liquidQty: b.liquidQty,
        pricePerUnit,
        marketScore,
      });
    })
    .filter(a => a.eligible);

  // Overheated zone: explicitly hide all chips.
  if (marketScore > 55 || advised.length === 0) return null;

  const handleClick = (a: AdvisorResult) => {
    const sym = nativeTicker(a.symbol) as 'BTC' | 'ETH' | 'SOL';
    // BTC stays at 0 → forces manual entry inside Stake module.
    const amount = a.manualOnly ? 0 : a.breakdown.recommendedQty;
    setPendingStake({ symbol: sym, amount, source: 'swap' });
    navigateToTab('staking');
    if (a.manualOnly) {
      toast.success(sk
        ? `${sym}: zadaj sumu ručne v Staking Planneri.`
        : `${sym}: enter amount manually in the Staking Planner.`);
    } else {
      toast.success(sk
        ? `Stake predvyplnený: ${amount.toFixed(a.symbol === 'SOL' ? 2 : 3)} ${sym}`
        : `Stake prefilled: ${amount.toFixed(a.symbol === 'SOL' ? 2 : 3)} ${sym}`);
    }
  };

  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-violet-300" />
        <span className="text-xs font-semibold text-foreground">
          {sk ? 'Voľné zostatky pripravené na staking' : 'Idle balances ready to stake'}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {advised.map(a => (
          <ShortcutRow
            key={a.symbol}
            advice={a}
            lang={lang}
            marketScore={marketScore}
            onClick={() => handleClick(a)}
          />
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

function ShortcutRow({
  advice, lang, marketScore, onClick,
}: { advice: AdvisorResult; lang: Lang; marketScore: number; onClick: () => void }) {
  const sk = lang === 'sk';
  const sym = nativeTicker(advice.symbol);
  const { breakdown } = advice;
  const decimals = advice.symbol === 'SOL' ? 2 : 3;
  const recLabel = advice.manualOnly
    ? (sk ? 'manuálne' : 'manual')
    : `${breakdown.recommendedQty.toFixed(decimals)} ${sym}`;
  const subline = advice.manualOnly
    ? (sk ? `(BTC sa zadáva ručne — voľné ${formatUsd(breakdown.liquidUsd)})`
          : `(BTC entered manually — free ${formatUsd(breakdown.liquidUsd)})`)
    : (sk
        ? `(Odporúčaných ~${Math.round(breakdown.recommendedPct)}% voľného objemu na základe trhového skóre ${Math.round(marketScore)})`
        : `(~${Math.round(breakdown.recommendedPct)}% of free balance based on market score ${Math.round(marketScore)})`);

  return (
    <div className="flex items-start gap-2 p-2 rounded-lg bg-violet-500/10 border border-violet-500/30">
      <button
        onClick={onClick}
        className="flex-1 flex items-center gap-2 text-left text-violet-200 text-[11px] font-semibold active:scale-[0.98] hover:bg-violet-500/15 rounded-md px-2 py-1.5 transition"
      >
        <span>⚡</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span>{sk ? 'Stakovať' : 'Stake'} {recLabel}</span>
            {!advice.manualOnly && (
              <span className="text-violet-300/70 tabular-nums">
                ({formatUsd(breakdown.recommendedUsd)})
              </span>
            )}
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={e => e.stopPropagation()}
                className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-violet-300/80 hover:text-violet-100 underline-offset-2 hover:underline"
              >
                <Info className="w-3 h-3" />
                <span className="text-left">{subline}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="w-72 text-[11px] space-y-2"
              onOpenAutoFocus={e => e.preventDefault()}
            >
              <p className="text-xs font-bold text-foreground">
                {sk ? `Audit – ${sym}` : `Audit – ${sym}`}
              </p>
              <ol className="space-y-1 text-muted-foreground tabular-nums">
                <li>
                  1. {sk ? 'Celkový liquidný zostatok' : 'Total un-staked balance'}:{' '}
                  <span className="text-foreground">
                    {breakdown.liquidQty.toFixed(decimals)} {sym} · {formatUsd(breakdown.liquidUsd)}
                  </span>
                </li>
                <li>
                  2. {sk ? 'Rezerva na poplatky (Gas)' : 'Gas fee reserve'}:{' '}
                  <span className="text-foreground">
                    −{breakdown.gasBufferQty} {sym} · {formatUsd(breakdown.gasBufferUsd)}
                  </span>
                </li>
                <li>
                  3. {sk ? 'Obchodná rezerva (Take Profit)' : 'Trading reserve (Take Profit)'}:{' '}
                  <span className="text-foreground">
                    −{breakdown.tradingReserveQty.toFixed(decimals)} {sym} · {formatUsd(breakdown.tradingReserveUsd)}
                  </span>
                </li>
                <li>
                  4. {sk ? 'Finálne odporúčanie' : 'Final recommendation'}:{' '}
                  <span className="text-violet-300 font-semibold">
                    {advice.manualOnly
                      ? (sk ? 'manuálne (BTC chránený)' : 'manual (BTC protected)')
                      : `${breakdown.recommendedQty.toFixed(decimals)} ${sym} · ${formatUsd(breakdown.recommendedUsd)}`}
                  </span>
                </li>
              </ol>
              <div className="pt-1 border-t border-border/40">
                <p className="text-[10px] font-semibold text-foreground mb-1">
                  {sk ? 'Strategické zdôvodnenie:' : 'Strategic rationale:'}
                </p>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  <span className="mr-1">{strategyCommentary(marketScore, lang).icon}</span>
                  {strategyCommentary(marketScore, lang).text}
                </p>
              </div>
              {marketScore > 55 && (
                <p className="text-[10px] text-loss font-semibold">{overheatedWarning(lang)}</p>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </button>
    </div>
  );
}
