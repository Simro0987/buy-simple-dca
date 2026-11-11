import { useState } from 'react';
import { Brain, Coins, PiggyBank, Wallet, SlidersHorizontal } from 'lucide-react';
import { borrowPillars } from '@/lib/leverageEngine';
import type { YieldRoute } from '@/hooks/useYieldScanner';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { TokenValue } from './TokenValue';

/** Three isolated advisory sleeves; simulation never changes recorded balances. */
export function BorrowAllocatorPanel({ borrowUsd, nativeCollateral, stableRoute, marketVolatility, fearAndGreedIndex, roboSplit }: {
  sk: boolean;
  borrowUsd: number | null;
  nativeCollateral: string;
  stableRoute: YieldRoute | null;
  nativePrice?: number;
  marketVolatility?: number;
  fearAndGreedIndex?: number;
  roboSplit?: { stableUsd: number; nativeUsd: number; cashUsd?: number };
}) {
  const [vol, setVol] = useState(45);
  const [fg, setFg] = useState(50);
  const [showSliders, setShowSliders] = useState(false);
  const [simulate, setSimulate] = useState(false);
  const signalsMissing = marketVolatility == null || fearAndGreedIndex == null;
  const base = borrowPillars(borrowUsd ?? 0, simulate ? vol : marketVolatility ?? 100, simulate ? fg : fearAndGreedIndex ?? 100);
  const roboCash = roboSplit?.cashUsd ?? 0;
  const roboTotal = roboSplit ? roboSplit.stableUsd + roboSplit.nativeUsd + roboCash : 0;
  const a = roboSplit && roboTotal > 0 ? { ...base,
    stableUsd: roboSplit.stableUsd, nativeUsd: roboSplit.nativeUsd, cashUsd: roboCash,
    stablePct: Math.round(roboSplit.stableUsd / roboTotal * 100), nativePct: Math.round(roboSplit.nativeUsd / roboTotal * 100), cashPct: Math.round(roboCash / roboTotal * 100) } : base;
  const pillars = [
    { key: 'stable', pct: a.stablePct, amount: a.stableUsd, icon: PiggyBank, title: 'Stablecoin Supply',
      desc: stableRoute ? `${stableRoute.protocol} · ${stableRoute.chain} · USDC · ${stableRoute.supplyApy.toFixed(2)} % APY` : 'Aave / Morpho USDC · výnosová trasa nedostupná', bar: 'bg-gain', tone: 'text-gain' },
    { key: 'native', pct: a.nativePct, amount: a.nativeUsd, icon: Coins, title: `Native Token Supply · ${nativeCollateral}`,
      desc: `USDC → ${nativeCollateral} → výnosový supply. Kolaterál: VYPNUTÝ.`, bar: 'bg-accent', tone: 'text-accent' },
    { key: 'cash', pct: a.cashPct, amount: a.cashUsd, icon: Wallet, title: 'Cash Buffer',
      desc: 'Likvidné USDC v Smart Wallet · núdzová rezerva', bar: 'bg-warning', tone: 'text-warning' },
  ];
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <p className="flex items-center gap-2 text-xs text-accent"><Brain className="h-4 w-4" />
        {simulate ? 'Simulácia' : signalsMissing ? 'Konzervatívny režim · chýbajú indikátory' : 'Trhový režim'} · {a.regime === 'DEFENSIVE' ? 'Obranný' : a.regime === 'RISK-ON' ? 'Akumulačný' : 'Vyvážený'}
      </p>
      <Button variant="ghost" size="icon" title="Skúšobné indikátory" aria-label="Skúšobné indikátory" onClick={() => setShowSliders(v => !v)}><SlidersHorizontal /></Button>
    </div>
    {showSliders && <div className="border-y border-border py-3 space-y-4">
      <div className="flex justify-between items-center text-xs"><label htmlFor="borrow-simulation">Simulovať indikátory</label><Switch id="borrow-simulation" checked={simulate} onCheckedChange={setSimulate} /></div>
      <div className="space-y-2"><p className="text-xs text-muted-foreground">Volatilita: {vol}</p><Slider aria-label="Volatilita" min={0} max={100} value={[vol]} disabled={!simulate} onValueChange={v => setVol(v[0] ?? 0)} /></div>
      <div className="space-y-2"><p className="text-xs text-muted-foreground">Strach a chamtivosť: {fg}</p><Slider aria-label="Strach a chamtivosť" min={0} max={100} value={[fg]} disabled={!simulate} onValueChange={v => setFg(v[0] ?? 0)} /></div>
    </div>}
    <div className="border-y border-accent/25 py-3">
      <p className="text-xs text-muted-foreground">Rozpočet pôžičky · plán alokácie</p>
      {roboSplit ? <TokenValue amount={roboTotal} symbol="USDC" price={1} /> : borrowUsd == null ? <p className="text-warning text-xs">Dáta nedostupné</p> : <TokenValue amount={borrowUsd} symbol="USDC" price={1} />}
    </div>
    <div className="flex h-3 overflow-hidden rounded-full bg-secondary" aria-label="Rozdelenie pôžičky">
      {pillars.map(p => <div key={p.key} className={`${p.bar} transition-all duration-300 ease-in-out motion-reduce:transition-none`} style={{ width: `${p.pct}%` }} />)}
    </div>
    <div className="divide-y divide-border">
      {pillars.map(p => <div key={p.key} className="py-3 space-y-2" data-pillar={p.key}>
        <div className="flex items-center justify-between gap-3"><p className={`flex items-center gap-2 text-xs font-semibold ${p.tone}`}><p.icon className="h-4 w-4 shrink-0" />{p.title}</p><span className="font-mono text-sm font-semibold">{p.pct}%</span></div>
        <TokenValue amount={p.amount} symbol="USDC" price={1} size="sm" copy />
        <p className="text-[11px] text-muted-foreground">{p.desc}</p>
        {p.key === 'native' && <p className="text-[10px] text-warning">Samostatný supply · bez opätovného založenia · nastavenie overiť v protokole</p>}
      </div>)}
    </div>
  </div>;
}
