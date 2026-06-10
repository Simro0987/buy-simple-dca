import { useEffect, useState } from 'react';
import { Zap, Info, Lock, Unlock, ArrowRightLeft, Landmark } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useStakingLedger } from '@/hooks/useStakingLedger';
import { nativeTicker } from '@/lib/tickerLabels';
import {
  setPendingStake, setPendingSwap, setPendingLending, navigateToTab,
} from '@/lib/pendingActions';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  computeAdvice,
  computeUnstakeAdvice,
  getTimingWindow,
  strategyCommentary,
  overheatedWarning,
  previewWindowNote,
  isEmergencyBypassActive,
  setEmergencyBypass,
  type AdvisorSymbol,
  type AdvisorResult,
  type UnstakeAdvice,
} from '@/lib/stakeAdvisor';

interface Props {
  lang: Lang;
  marketScore: number;
}

export function IdleStakeShortcuts({ lang, marketScore }: Props) {
  const sk = lang === 'sk';
  const { breakdown } = usePortfolio();
  const { entries } = useStakingLedger();
  const [bypass, setBypass] = useState<boolean>(() => isEmergencyBypassActive());
  useEffect(() => {
    const h = () => setBypass(isEmergencyBypassActive());
    window.addEventListener('stake-bypass-changed', h);
    const id = setInterval(h, 5000);
    return () => { window.removeEventListener('stake-bypass-changed', h); clearInterval(id); };
  }, []);
  // Recompute window when bypass changes
  const win = getTimingWindow(marketScore);
  void bypass; // ensures re-render when bypass toggles

  if (!win.visible) return null;


  // ===== OVERHEATED → Unstake engine =====
  if (win.phase === 'overheated') {
    const unstakes = (['ETH', 'SOL'] as AdvisorSymbol[])
      .map(s => computeUnstakeAdvice(s, entries, marketScore))
      .filter((u): u is UnstakeAdvice => !!u);

    if (unstakes.length === 0) {
      return (
        <div className="glass-card p-3 border border-loss/40 bg-loss/5">
          <p className="text-[11px] text-loss font-semibold">{overheatedWarning(lang)}</p>
        </div>
      );
    }

    return (
      <div className="glass-card p-3 space-y-2 border border-loss/40 bg-loss/5">
        <div className="flex items-center gap-1.5">
          <Unlock className="w-3.5 h-3.5 text-loss" />
          <span className="text-xs font-semibold text-foreground">
            {sk ? 'Unstake — Take Profit režim' : 'Unstake — Take Profit mode'}
          </span>
        </div>
        <div className="flex flex-col gap-2">
          {unstakes.map(u => <UnstakeRow key={u.symbol} advice={u} lang={lang} />)}
        </div>
        <p className="text-[10px] text-loss/80 leading-snug">{overheatedWarning(lang)}</p>
      </div>
    );
  }

  // ===== STAKING (open / preview / value) =====
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
        ledgerEntries: entries,
      });
    })
    .filter(a => a.eligible);

  if (advised.length === 0) return null;

  const locked = win.locked;
  const days = win.daysRemaining;

  const handleClick = (a: AdvisorResult) => {
    if (locked) {
      toast.info(previewWindowNote(lang, days));
      return;
    }
    const sym = nativeTicker(a.symbol) as 'BTC' | 'ETH' | 'SOL';
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
    <div className={`glass-card p-3 space-y-2 ${locked ? 'opacity-70' : ''}`}>
      <div className="flex items-center gap-1.5">
        {locked ? <Lock className="w-3.5 h-3.5 text-violet-300/70" /> : <Zap className="w-3.5 h-3.5 text-violet-300" />}
        <span className="text-xs font-semibold text-foreground">
          {sk ? 'Voľné zostatky pripravené na staking' : 'Idle balances ready to stake'}
        </span>
      </div>
      {locked && (
        <div className="flex flex-col gap-1.5 bg-amber-500/10 border border-amber-500/30 rounded-md px-2 py-1.5">
          <p className="text-[10px] text-amber-300/90 leading-snug">
            {previewWindowNote(lang, days)}
          </p>
          <button
            type="button"
            onClick={() => {
              setEmergencyBypass(true);
              toast.success(sk ? 'Núdzové odomknutie aktívne (24 h)' : 'Emergency bypass active (24 h)');
            }}
            className="self-start text-[10px] font-bold px-2 py-1 rounded bg-rose-500/20 text-rose-200 border border-rose-500/40 hover:bg-rose-500/30 active:scale-95"
          >
            🔓 {sk ? 'Núdzovo odomknúť okno' : 'Emergency unlock'}
          </button>
        </div>
      )}
      {!locked && isEmergencyBypassActive() && (
        <div className="flex items-center justify-between gap-2 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-2 py-1.5">
          <p className="text-[10px] text-emerald-200 leading-snug">
            {sk ? '🔓 Okno otvorené núdzovým odomknutím' : '🔓 Window opened via emergency bypass'}
          </p>
          <button
            type="button"
            onClick={() => {
              setEmergencyBypass(false);
              toast.info(sk ? 'Núdzové okno zrušené' : 'Emergency bypass cleared');
            }}
            className="text-[10px] text-emerald-200/80 hover:text-emerald-100"
          >
            {sk ? 'Zatvoriť' : 'Close'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {advised.map(a => (
          <ShortcutRow
            key={a.symbol}
            advice={a}
            lang={lang}
            marketScore={marketScore}
            locked={locked}
            phase={win.phase}
            daysRemaining={days}
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
  advice, lang, marketScore, locked, phase, daysRemaining, onClick,
}: {
  advice: AdvisorResult; lang: Lang; marketScore: number; locked: boolean;
  phase: ReturnType<typeof getTimingWindow>['phase']; daysRemaining?: number; onClick: () => void;
}) {
  const sk = lang === 'sk';
  const sym = nativeTicker(advice.symbol);
  const { breakdown, concentration } = advice;
  const decimals = advice.symbol === 'SOL' ? 2 : 3;
  const recLabel = advice.manualOnly
    ? (sk ? 'manuálne' : 'manual')
    : `${breakdown.recommendedQty.toFixed(decimals)} ${sym}`;
  const subline = advice.manualOnly
    ? (sk ? `(BTC sa zadáva ručne — voľné ${formatUsd(breakdown.liquidUsd)})`
          : `(BTC entered manually — free ${formatUsd(breakdown.liquidUsd)})`)
    : (sk
        ? `(Odporúčaných ~${Math.round(breakdown.recommendedPct)}% voľného objemu, trhové skóre ${Math.round(marketScore)})`
        : `(~${Math.round(breakdown.recommendedPct)}% of free balance, market score ${Math.round(marketScore)})`);

  const protoLabel = concentration.triggered
    ? (sk ? `Diverzifikácia → ${concentration.recommendedProtocol}` : `Diversify → ${concentration.recommendedProtocol}`)
    : (sk ? `Protokol: ${concentration.recommendedProtocol}` : `Protocol: ${concentration.recommendedProtocol}`);

  return (
    <div className={`flex items-start gap-2 p-2 rounded-lg border ${
      locked ? 'bg-muted/30 border-border/40' : 'bg-violet-500/10 border-violet-500/30'
    }`}>
      <button
        onClick={onClick}
        disabled={locked && !advice.manualOnly}
        className={`flex-1 flex items-center gap-2 text-left text-[11px] font-semibold rounded-md px-2 py-1.5 transition ${
          locked
            ? 'text-muted-foreground cursor-not-allowed'
            : 'text-violet-200 active:scale-[0.98] hover:bg-violet-500/15'
        }`}
      >
        <span>{locked ? '🔒' : '⚡'}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span>{sk ? 'Stakovať' : 'Stake'} {recLabel}</span>
            {!advice.manualOnly && (
              <span className={`tabular-nums ${locked ? 'text-muted-foreground/70' : 'text-violet-300/70'}`}>
                ({formatUsd(breakdown.recommendedUsd)})
              </span>
            )}
            {concentration.triggered && (
              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.5 rounded">
                {sk ? 'Diverzifikácia' : 'Diversify'}
              </span>
            )}
          </div>
          <p className={`mt-0.5 text-[10px] ${locked ? 'text-muted-foreground/70' : 'text-violet-300/80'}`}>
            {protoLabel}
          </p>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                onClick={e => e.stopPropagation()}
                className={`mt-0.5 inline-flex items-center gap-1 text-[10px] underline-offset-2 hover:underline ${
                  locked ? 'text-muted-foreground/70' : 'text-violet-300/80 hover:text-violet-100'
                }`}
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
              <p className="text-xs font-bold text-foreground">{sk ? `Audit – ${sym}` : `Audit – ${sym}`}</p>
              <ol className="space-y-1 text-muted-foreground tabular-nums">
                <li>1. {sk ? 'Liquidný zostatok' : 'Un-staked balance'}:{' '}
                  <span className="text-foreground">{breakdown.liquidQty.toFixed(decimals)} {sym} · {formatUsd(breakdown.liquidUsd)}</span></li>
                <li>2. {sk ? 'Rezerva na poplatky (Gas)' : 'Gas fee reserve'}:{' '}
                  <span className="text-foreground">−{breakdown.gasBufferQty} {sym} · {formatUsd(breakdown.gasBufferUsd)}</span></li>
                <li>3. {sk ? 'Obchodná rezerva (Take Profit)' : 'Trading reserve (Take Profit)'}:{' '}
                  <span className="text-foreground">−{breakdown.tradingReserveQty.toFixed(decimals)} {sym} · {formatUsd(breakdown.tradingReserveUsd)}</span></li>
                <li>4. {sk ? 'Finálne odporúčanie' : 'Final recommendation'}:{' '}
                  <span className="text-violet-300 font-semibold">
                    {advice.manualOnly
                      ? (sk ? 'manuálne (BTC chránený)' : 'manual (BTC protected)')
                      : `${breakdown.recommendedQty.toFixed(decimals)} ${sym} · ${formatUsd(breakdown.recommendedUsd)}`}
                  </span></li>
                {concentration.triggered && (
                  <li>5. {sk ? 'Cieľový protokol' : 'Target protocol'}:{' '}
                    <span className="text-amber-300 font-semibold">{concentration.recommendedProtocol}</span>
                    {' '}<span className="text-muted-foreground">
                      ({sk ? 'aktuálne' : 'currently'} {concentration.dominantProtocol} {concentration.dominantPct?.toFixed(0)}%)
                    </span></li>
                )}
              </ol>
              <div className="pt-1 border-t border-border/40">
                <p className="text-[10px] font-semibold text-foreground mb-1">
                  {sk ? 'Strategické zdôvodnenie:' : 'Strategic rationale:'}
                </p>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  <span className="mr-1">{strategyCommentary(marketScore, lang, { concentration, phase }).icon}</span>
                  {strategyCommentary(marketScore, lang, { concentration, phase }).text}
                </p>
              </div>
              {locked && (
                <p className="text-[10px] text-amber-300/90">{previewWindowNote(lang, daysRemaining)}</p>
              )}
            </PopoverContent>
          </Popover>
        </div>
      </button>
    </div>
  );
}

function UnstakeRow({ advice, lang }: { advice: UnstakeAdvice; lang: Lang }) {
  const sk = lang === 'sk';
  const sym = nativeTicker(advice.symbol);
  const decimals = advice.symbol === 'SOL' ? 2 : 3;
  const nextStepLabel = advice.nextStep === 'swap'
    ? (sk ? '⚡ Spustiť Take Profit (Swap)' : '⚡ Run Take Profit (Swap)')
    : (sk ? '🔄 Presunúť do Flexibilného Výnosu' : '🔄 Move to Flexible Yield');

  const onNextStep = () => {
    if (advice.nextStep === 'swap') {
      setPendingSwap({
        from: advice.symbol as 'ETH' | 'SOL',
        to: 'USDC',
        amountUsd: 0,
        source: 'unstake',
        reason: sk
          ? `Take Profit po Unstake ${advice.unstakeQty} ${sym} z ${advice.protocol}`
          : `Take Profit after unstaking ${advice.unstakeQty} ${sym} from ${advice.protocol}`,
      });
      navigateToTab('swap');
      toast.success(sk ? 'Swap pripravený → USDC' : 'Swap prepared → USDC');
    } else {
      setPendingLending({
        symbol: advice.symbol as 'ETH' | 'SOL',
        amount: advice.unstakeQty,
        source: 'unstake',
        reason: sk
          ? `Flexibilný výnos pre ${advice.unstakeQty} ${sym}`
          : `Flexible yield for ${advice.unstakeQty} ${sym}`,
      });
      navigateToTab('staking');
      toast.success(sk ? 'Lending / Liquidity pripravené' : 'Lending / Liquidity prepared');
    }
  };

  return (
    <div className="rounded-lg border border-loss/40 bg-loss/10 p-2 space-y-2">
      <div className="flex items-start gap-2">
        <Unlock className="w-3.5 h-3.5 text-loss shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-foreground">
            🔓 {sk ? 'Odstakovať' : 'Unstake'}{' '}
            <span className="tabular-nums">{advice.unstakeQty.toFixed(decimals)} {sym}</span>{' '}
            {sk ? 'z' : 'from'} {advice.protocol}
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">
            {sk ? 'Návrh' : 'Suggestion'}: {advice.unstakePct.toFixed(0)}% {sk ? 'zo zostatku' : 'of balance'} (
            {advice.protocolBalance.toFixed(decimals)} {sym}) · {sk ? 'skóre' : 'score'} {Math.round(advice.score)}
          </p>
        </div>
      </div>
      <button
        onClick={onNextStep}
        className={`w-full flex items-center justify-center gap-1.5 py-1.5 rounded-md text-[11px] font-bold border active:scale-[0.98] transition ${
          advice.nextStep === 'swap'
            ? 'bg-loss/20 text-loss border-loss/40 hover:bg-loss/30'
            : 'bg-amber-500/15 text-amber-200 border-amber-500/40 hover:bg-amber-500/25'
        }`}
      >
        {advice.nextStep === 'swap' ? <ArrowRightLeft className="w-3.5 h-3.5" /> : <Landmark className="w-3.5 h-3.5" />}
        {nextStepLabel}
      </button>
    </div>
  );
}
