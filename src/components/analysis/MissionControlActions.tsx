// Mission Control cross-module CTA bar — wires Risk/Analysis signals
// into DCA / Swap / Stake tabs via pending-* hand-offs. STRICT MANUAL POLICY:
// each button is a single user gesture; no auto-chaining.
import { useMemo } from 'react';
import { Rocket, ArrowLeftRight, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useStakingLedger } from '@/hooks/useStakingLedger';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { navigateToTab, setPendingSwap, setPendingStake } from '@/lib/pendingActions';
import { nativeTicker } from '@/lib/tickerLabels';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';

interface Props {
  lang: Lang;
  cycleResult?: MarketCycleResult | null;
}

// Anchor allocation from project memory: BTC 64 / ETH 25 / SOL 11.
const TARGETS = { BTC: 0.64, ETH: 0.25, SOL: 0.11 } as const;
const DRIFT_THRESHOLD = 0.05; // 5%
const IDLE_USD_THRESHOLD = 100; // surface yield CTA when liquid ETH/SOL > $100

export function MissionControlActions({ lang, cycleResult }: Props) {
  const sk = lang === 'sk';
  const { breakdown, totalValue } = usePortfolio();
  const { bySymbol } = useStakingLedger();

  const { driftLeg, idleAsset, isBuyZone } = useMemo(() => {
    // Buy zone: capitulation / extreme fear (cycle score ≤ 25).
    const isBuyZone = !!cycleResult && cycleResult.score <= 25;

    // Drift detection — biggest overweight vs target.
    let driftLeg: { from: 'BTC'|'ETH'|'SOL'; to: 'BTC'|'ETH'|'SOL'; amountUsd: number } | null = null;
    if (totalValue > 0) {
      const deltas = (['BTC','ETH','SOL'] as const).map(sym => {
        const cur = breakdown.find(b => b.symbol === sym)?.value ?? 0;
        const target = totalValue * TARGETS[sym];
        return { sym, delta: cur - target };
      });
      const over = deltas.filter(d => d.delta > 0).sort((a,b) => b.delta - a.delta)[0];
      const under = deltas.filter(d => d.delta < 0).sort((a,b) => a.delta - b.delta)[0];
      if (over && under && Math.abs(over.delta) / totalValue >= DRIFT_THRESHOLD) {
        driftLeg = { from: over.sym, to: under.sym, amountUsd: Math.min(over.delta, -under.delta) };
      }
    }

    // Idle liquid ETH/SOL — eligible for yield optimization.
    let idleAsset: { symbol: 'ETH'|'SOL'; amount: number; usd: number } | null = null;
    for (const sym of ['ETH','SOL'] as const) {
      const b = breakdown.find(x => x.symbol === sym);
      if (!b) continue;
      const liquidUsd = Number(b.holdValue ?? 0) || 0;
      const liquidQty = Number(b.liquidQty ?? 0) || 0;
      if (liquidUsd >= IDLE_USD_THRESHOLD && liquidQty > 0) {
        idleAsset = { symbol: sym, amount: liquidQty, usd: liquidUsd };
        break;
      }
    }
    return { driftLeg, idleAsset, isBuyZone };
  }, [breakdown, totalValue, bySymbol, cycleResult]);

  if (!isBuyZone && !driftLeg && !idleAsset) return null;

  return (
    <div className="glass-card p-4 space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
        {sk ? '🎯 Mission Control — akčné prepojenia' : '🎯 Mission Control — actionable shortcuts'}
      </h2>
      <div className="grid grid-cols-1 gap-2">
        {isBuyZone && (
          <Button
            variant="outline"
            className="justify-start gap-2 border-gain/40 hover:bg-gain/10"
            onClick={() => {
              navigateToTab('dca');
              toast.success(sk ? 'Otváram DCA s Money Mode' : 'Opening DCA with Money Mode');
            }}
          >
            <Rocket className="w-4 h-4 text-gain" />
            <span className="text-xs font-bold">🚀 {sk ? 'Aktivovať nákupný Money Mode' : 'Activate Buy Money Mode'}</span>
          </Button>
        )}

        {driftLeg && (
          <Button
            variant="outline"
            className="justify-start gap-2 border-warning/40 hover:bg-warning/10"
            onClick={() => {
              setPendingSwap({
                from: driftLeg.from,
                to: driftLeg.to,
                amountUsd: driftLeg.amountUsd,
                source: 'analysis',
                reason: sk ? 'Korekcia driftu alokácie 64/25/11' : 'Allocation drift correction 64/25/11',
              });
              navigateToTab('swap');
              toast.success(sk
                ? `Pripravený swap ${nativeTicker(driftLeg.from)} → ${nativeTicker(driftLeg.to)}`
                : `Prepared swap ${nativeTicker(driftLeg.from)} → ${nativeTicker(driftLeg.to)}`);
            }}
          >
            <ArrowLeftRight className="w-4 h-4 text-warning" />
            <span className="text-xs font-bold">
              🔄 {sk ? `Opraviť alokáciu cez Swap (${nativeTicker(driftLeg.from)}→${nativeTicker(driftLeg.to)} ~$${driftLeg.amountUsd.toFixed(0)})`
                    : `Fix allocation via Swap (${nativeTicker(driftLeg.from)}→${nativeTicker(driftLeg.to)} ~$${driftLeg.amountUsd.toFixed(0)})`}
            </span>
          </Button>
        )}

        {idleAsset && (
          <Button
            variant="outline"
            className="justify-start gap-2 border-accent/40 hover:bg-accent/10"
            onClick={() => {
              setPendingStake({ symbol: idleAsset.symbol, amount: idleAsset.amount, source: 'swap' });
              navigateToTab('staking');
              toast.success(sk
                ? `Otváram Yield Planner pre ${idleAsset.symbol}`
                : `Opening Yield Planner for ${idleAsset.symbol}`);
            }}
          >
            <Coins className="w-4 h-4 text-accent" />
            <span className="text-xs font-bold">
              💰 {sk ? `Optimalizovať výnos v STAKE (${nativeTicker(idleAsset.symbol)} ~$${idleAsset.usd.toFixed(0)} idle)`
                    : `Optimize yield in STAKE (${nativeTicker(idleAsset.symbol)} ~$${idleAsset.usd.toFixed(0)} idle)`}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
}
