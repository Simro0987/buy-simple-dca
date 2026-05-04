import { useMemo } from 'react';
import { Lang } from '@/lib/i18n';
import { useGasPrices } from '@/hooks/useGasPrices';
import { useDefiApys } from '@/hooks/useDefiApys';
import { CheckCircle2, AlertTriangle, XCircle, Zap, Info } from 'lucide-react';

interface Props { lang: Lang; amountUsd?: number }

interface OpportunityInput {
  id: string;
  asset: 'BTC' | 'ETH' | 'SOL';
  color: string;
  title: string;
  desc: string;
  apy: number;
  feeUsd: number;
  // ako často je potrebné platiť poplatok (1 = jednorazovo, n = n-krát ročne)
  feeRecurrencePerYear?: number;
}

interface OpportunityResult extends OpportunityInput {
  netApy: number;          // % po odpočítaní poplatkov
  yearlyGrossUsd: number;
  yearlyNetUsd: number;
  breakevenDays: number;
  verdict: 'go' | 'wait' | 'skip';
  reason: string;
}

function evaluate(o: OpportunityInput, amount: number, lang: Lang): OpportunityResult {
  const recur = o.feeRecurrencePerYear ?? 1;
  const totalFeeYr = o.feeUsd * recur;
  const yearlyGrossUsd = amount * (o.apy / 100);
  const yearlyNetUsd = yearlyGrossUsd - totalFeeYr;
  const netApy = (yearlyNetUsd / amount) * 100;
  // breakeven dni: koľko dní výnos pokryje poplatok
  const dailyGross = yearlyGrossUsd / 365;
  const breakevenDays = dailyGross > 0 ? totalFeeYr / dailyGross : Infinity;

  // pomer poplatok / suma
  const feePct = (totalFeeYr / amount) * 100;

  let verdict: OpportunityResult['verdict'];
  let reason: string;

  if (feePct > 3 || netApy < 1) {
    verdict = 'skip';
    reason = lang === 'sk'
      ? `Poplatok ${feePct.toFixed(2)}% prevyšuje výhody. Počkaj na nižší gas alebo väčšiu sumu.`
      : `Fee ${feePct.toFixed(2)}% eats the gain. Wait for lower gas or larger size.`;
  } else if (breakevenDays > 60 || feePct > 1.5) {
    verdict = 'wait';
    reason = lang === 'sk'
      ? `Hraničné. Breakeven ${breakevenDays.toFixed(0)} dní. Lepšie kumulovať väčšiu sumu.`
      : `Borderline. Breakeven ${breakevenDays.toFixed(0)} days. Accumulate larger size first.`;
  } else {
    verdict = 'go';
    reason = lang === 'sk'
      ? `Vhodný čas. Poplatok sa vráti za ${breakevenDays.toFixed(0)} dní, čistý APY ${netApy.toFixed(1)}%.`
      : `Good time. Fee recovers in ${breakevenDays.toFixed(0)} days, net APY ${netApy.toFixed(1)}%.`;
  }

  return { ...o, netApy, yearlyGrossUsd, yearlyNetUsd, breakevenDays, verdict, reason };
}

function VerdictBadge({ v, lang }: { v: OpportunityResult['verdict']; lang: Lang }) {
  if (v === 'go') {
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gain/15 text-gain text-[10px] font-bold border border-gain/30">
        <CheckCircle2 className="w-3 h-3" />
        {lang === 'sk' ? 'STAKE TERAZ' : 'STAKE NOW'}
      </span>
    );
  }
  if (v === 'wait') {
    return (
      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 text-[10px] font-bold border border-yellow-500/30">
        <AlertTriangle className="w-3 h-3" />
        {lang === 'sk' ? 'POČKAJ' : 'WAIT'}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-loss/15 text-loss text-[10px] font-bold border border-loss/30">
      <XCircle className="w-3 h-3" />
      {lang === 'sk' ? 'NEOPLATÍ SA' : 'SKIP'}
    </span>
  );
}

export function StakingTimingCard({ lang, amountUsd = 500 }: Props) {
  const { data: gas, isFetching: gasLoading } = useGasPrices();
  const { data: apys } = useDefiApys();

  const opportunities = useMemo<OpportunityResult[]>(() => {
    if (!gas) return [];
    const ops: OpportunityInput[] = [
      {
        id: 'babylon',
        asset: 'BTC',
        color: '#F7931A',
        title: lang === 'sk' ? 'Babylon Staking (Native BTC)' : 'Babylon Staking (Native BTC)',
        desc: lang === 'sk' ? 'BTC L1 → Babylon vault' : 'BTC L1 → Babylon vault',
        apy: 4,
        feeUsd: gas.fees.btcSend,
      },
      {
        id: 'lbtc',
        asset: 'BTC',
        color: '#F7931A',
        title: lang === 'sk' ? 'LBTC vault (Lombard)' : 'LBTC vault (Lombard)',
        desc: lang === 'sk' ? 'BTC → cbBTC → bridge → Beefy ARB' : 'BTC → cbBTC → bridge → Beefy ARB',
        apy: 11,
        // BTC send + bridge + ARB deposit
        feeUsd: gas.fees.btcSend + gas.fees.ethBridgeArb + gas.fees.arbDeposit,
      },
      {
        id: 'steth-cow',
        asset: 'ETH',
        color: '#627EEA',
        title: lang === 'sk' ? 'stETH cez CoW Swap (Lido)' : 'stETH via CoW Swap (Lido)',
        desc: lang === 'sk' ? 'Mainnet ETH → stETH' : 'Mainnet ETH → stETH',
        apy: apys?.lido ?? 3.2,
        // CoW Swap = MEV protected, gas pokrytý solverom, ale typicky menší slippage cost ~ 0.5 USD
        feeUsd: Math.max(0.5, gas.fees.ethSwap * 0.3),
      },
      {
        id: 'reth-arb',
        asset: 'ETH',
        color: '#627EEA',
        title: lang === 'sk' ? 'rETH na Arbitrum (swap)' : 'rETH on Arbitrum (swap)',
        desc: lang === 'sk' ? 'ETH → bridge → ARB → rETH' : 'ETH → bridge → ARB → rETH',
        apy: apys?.rocketPool ?? 3.4,
        feeUsd: gas.fees.ethBridgeArb + gas.fees.arbSwap,
      },
      {
        id: 'reth-beefy',
        asset: 'ETH',
        color: '#627EEA',
        title: lang === 'sk' ? 'rETH lending (Beefy ARB)' : 'rETH lending (Beefy ARB)',
        desc: lang === 'sk' ? 'rETH na ARB → Beefy vault' : 'rETH on ARB → Beefy vault',
        apy: 9,
        feeUsd: gas.fees.arbDeposit,
      },
      {
        id: 'jito-kamino',
        asset: 'SOL',
        color: '#9945FF',
        title: lang === 'sk' ? 'jitoSOL → Kamino lending' : 'jitoSOL → Kamino lending',
        desc: lang === 'sk' ? 'jitoSOL deposit do Kamino' : 'Deposit jitoSOL into Kamino',
        apy: apys?.kaminoSol ?? 4.2,
        feeUsd: gas.fees.solSwap + gas.fees.solDeposit,
      },
    ];
    return ops.map((o) => evaluate(o, amountUsd, lang));
  }, [gas, apys, amountUsd, lang]);

  const fmtUsd = (n: number) => n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-foreground">
            {lang === 'sk' ? 'Oplatí sa teraz stakovať?' : 'Is it worth staking now?'}
          </h2>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {lang === 'sk'
              ? `Modelová suma $${amountUsd}. Verdikt zohľadňuje sieťové poplatky vs. ročný výnos.`
              : `Model size $${amountUsd}. Verdict factors network fees vs. yearly yield.`}
          </p>
        </div>
        <div className="flex items-center gap-1 text-[10px]">
          <Zap className={`w-3 h-3 ${gas?.source === 'live' ? 'text-gain' : 'text-yellow-400'}`} />
          <span className={gasLoading ? 'text-muted-foreground animate-pulse' : 'text-muted-foreground'}>
            {gas?.source === 'live'
              ? (lang === 'sk' ? 'Live gas' : 'Live gas')
              : (lang === 'sk' ? 'Odhad' : 'Estimate')}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {opportunities.map((o) => (
          <div key={o.id} className="bg-secondary/40 rounded-lg p-2.5 space-y-1.5 border border-border/40">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                  style={{ backgroundColor: o.color + '25', color: o.color }}
                >
                  {o.asset}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{o.title}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{o.desc}</p>
                </div>
              </div>
              <VerdictBadge v={o.verdict} lang={lang} />
            </div>

            <div className="grid grid-cols-4 gap-1 text-[10px]">
              <div>
                <p className="text-muted-foreground">APY</p>
                <p className="font-semibold text-gain">{o.apy.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-muted-foreground">{lang === 'sk' ? 'Poplatok' : 'Fee'}</p>
                <p className="font-semibold text-foreground">{fmtUsd(o.feeUsd)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">{lang === 'sk' ? 'Breakeven' : 'Breakeven'}</p>
                <p className="font-semibold text-foreground">
                  {Number.isFinite(o.breakevenDays) ? `${o.breakevenDays.toFixed(0)}d` : '—'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">{lang === 'sk' ? 'Čistý/rok' : 'Net/yr'}</p>
                <p className={`font-semibold ${o.yearlyNetUsd > 0 ? 'text-gain' : 'text-loss'}`}>
                  {fmtUsd(o.yearlyNetUsd)}
                </p>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground flex items-start gap-1">
              <Info className="w-3 h-3 mt-0.5 shrink-0" />
              <span>{o.reason}</span>
            </p>
          </div>
        ))}
      </div>

      <p className="text-[9px] text-muted-foreground/70 leading-relaxed pt-1 border-t border-border/30">
        {lang === 'sk'
          ? 'Auto-refresh každých 60s. Pravidlá: GO ak breakeven ≤ 60 dní a poplatok ≤ 1.5%. SKIP ak poplatok > 3% alebo čistý APY < 1%.'
          : 'Auto-refresh every 60s. Rules: GO if breakeven ≤ 60d and fee ≤ 1.5%. SKIP if fee > 3% or net APY < 1%.'}
      </p>
    </div>
  );
}
