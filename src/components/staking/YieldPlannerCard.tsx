import { useEffect, useMemo, useRef, useState } from 'react';
import { Lang } from '@/lib/i18n';
import {
  PLANNER_ASSETS, getLiveApyMap, PlannerAsset, assessPlannerRisk,
  PLANNER_APYKEY_TO_DERIVATIVE, getPegStatus, depegAlertMessage,
} from '@/lib/stakeRoutingService';
import { Wallet, ShieldCheck, TrendingUp, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { RiskShield } from './RiskShield';


interface Props { lang: Lang; }

// Normalize three sliders so they sum to 100, adjusting the other two proportionally.
function rebalance(values: Record<string, number>, changedKey: string, newVal: number, keys: string[]): Record<string, number> {
  const others = keys.filter(k => k !== changedKey);
  const remaining = Math.max(0, 100 - newVal);
  const otherSum = others.reduce((s, k) => s + (values[k] ?? 0), 0) || 1;
  const next: Record<string, number> = { ...values, [changedKey]: newVal };
  others.forEach(k => { next[k] = Math.round((values[k] / otherSum) * remaining); });
  // fix rounding drift
  const sum = others.reduce((s, k) => s + next[k], 0) + newVal;
  const drift = 100 - sum;
  if (others.length) next[others[0]] += drift;
  return next;
}

export function YieldPlannerCard({ lang }: Props) {
  const isSk = lang === 'sk';
  const [total, setTotal] = useState<string>('10000');
  const [tick, setTick] = useState(0);

  // top-level asset percentages
  const [assetPct, setAssetPct] = useState<Record<string, number>>(
    Object.fromEntries(PLANNER_ASSETS.map(a => [a.symbol, a.defaultPct]))
  );

  // per-asset sub allocation
  const [subPct, setSubPct] = useState<Record<string, Record<string, number>>>(
    Object.fromEntries(PLANNER_ASSETS.map(a => [a.symbol, Object.fromEntries(a.sub.map(s => [s.key, s.defaultPct]))]))
  );

  // silent APY refresh tick (every 18s)
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      lastFocus.current = document.activeElement as HTMLElement | null;
      setTick(t => t + 1);
      // restore focus next tick
      requestAnimationFrame(() => lastFocus.current?.focus?.());
    }, 18000);
    return () => clearInterval(id);
  }, []);

  const apys = useMemo(() => getLiveApyMap(tick), [tick]);
  const totalUsd = parseFloat(total.replace(',', '.')) || 0;

  // weighted APY across whole portfolio
  let weightedApy = 0;
  PLANNER_ASSETS.forEach(a => {
    const aw = (assetPct[a.symbol] ?? 0) / 100;
    a.sub.forEach(s => {
      const sw = (subPct[a.symbol][s.key] ?? 0) / 100;
      weightedApy += aw * sw * apys[s.apyKey];
    });
  });
  const annualIncome = totalUsd * weightedApy / 100;

  const updateAsset = (sym: string, val: number) => {
    setAssetPct(prev => rebalance(prev, sym, val, PLANNER_ASSETS.map(a => a.symbol)));
  };
  const updateSub = (asset: PlannerAsset, key: string, val: number) => {
    setSubPct(prev => ({
      ...prev,
      [asset.symbol]: rebalance(prev[asset.symbol], key, val, asset.sub.map(s => s.key)),
    }));
  };

  return (
    <div className="glass-card p-4 space-y-4 border border-primary/20">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">
          {isSk ? 'Master Portfolio Yield Planner' : 'Master Portfolio Yield Planner'}
        </h2>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] text-muted-foreground">
          {isSk ? 'Celková hodnota portfólia (USD)' : 'Total portfolio value (USD)'}
        </label>
        <Input
          type="number"
          inputMode="decimal"
          value={total}
          onChange={e => setTotal(e.target.value)}
          className="h-10 text-base font-semibold"
          placeholder="10000"
        />
      </div>

      {PLANNER_ASSETS.map(asset => {
        const aPct = assetPct[asset.symbol] ?? 0;
        const bucketUsd = totalUsd * aPct / 100;
        return (
          <div key={asset.symbol} className="bg-secondary/30 border border-border/40 rounded-lg p-3 space-y-3">
            {/* asset header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                     style={{ backgroundColor: asset.color + '20', color: asset.color }}>
                  {asset.symbol}
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{asset.name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    ${bucketUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </div>
              </div>
              <span className="text-sm font-bold" style={{ color: asset.color }}>{aPct}%</span>
            </div>
            <Slider min={0} max={100} step={1} value={[aPct]} onValueChange={v => updateAsset(asset.symbol, v[0])} />

            {/* sub allocations */}
            <div className="space-y-2 pt-1">
              {asset.sub.map(s => {
                const sPct = subPct[asset.symbol][s.key] ?? 0;
                const subUsd = bucketUsd * sPct / 100;
                const liveApy = apys[s.apyKey];
                const risk = assessPlannerRisk(s.apyKey, isSk ? 'sk' : 'en');
                const verdictBorder =
                  risk.level === 'low' ? 'border-gain/30 bg-gain/5 text-gain/90' :
                  risk.level === 'medium' ? 'border-amber-500/30 bg-amber-500/5 text-amber-300/90' :
                  'border-loss/30 bg-loss/5 text-loss/90';
                const derivative = PLANNER_APYKEY_TO_DERIVATIVE[s.apyKey];
                const peg = derivative ? getPegStatus(derivative, tick) : null;
                const depegged = peg?.severity === 'critical';
                return (
                  <div key={s.key} className={`bg-background/40 rounded p-2 space-y-1.5 ${depegged ? 'ring-2 ring-loss/60' : ''}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-medium text-foreground truncate">{s.label}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{s.protocol}</p>
                        <p className="text-[10px] text-emerald-400/90 truncate">Verified: {s.officialUrl}</p>
                        {peg && (
                          <p className={`text-[10px] font-semibold ${depegged ? 'text-loss' : 'text-gain'}`}>
                            {depegged ? '🔴' : '🟢'} {depegged ? 'Depeg' : 'Parity'}: {peg.ratio.toFixed(4)}x ({peg.asset}/{peg.base})
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[11px] font-bold text-foreground">{sPct}%</p>
                        <p className="text-[10px] text-gain">
                          {liveApy > 0 ? `${liveApy.toFixed(2)}% APY` : '0% APY'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          ${subUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </p>
                      </div>
                    </div>
                    {depegged && peg && (
                      <div className="flex items-start gap-2 p-1.5 rounded border border-loss/60 bg-loss/15 animate-pulse">
                        <AlertTriangle className="w-3 h-3 text-loss mt-0.5 shrink-0" />
                        <p className="text-[10px] text-loss leading-snug font-semibold">
                          {depegAlertMessage(isSk ? 'sk' : 'en', peg)}
                        </p>
                      </div>
                    )}
                    <div className={`text-[10px] leading-snug px-2 py-1 rounded border ${verdictBorder}`}>
                      {risk.verdict}
                    </div>
                    <RiskShield risk={risk} lang={lang} compact />
                    <Slider min={0} max={100} step={1} value={[sPct]} onValueChange={v => updateSub(asset, s.key, v[0])} />
                  </div>
                );
              })}

            </div>
          </div>
        );
      })}

      {/* totals */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="bg-primary/10 border border-primary/30 rounded-lg p-3">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {isSk ? 'Vážené APY' : 'Weighted APY'}
            </p>
          </div>
          <p className="text-lg font-bold text-primary">{weightedApy.toFixed(2)}%</p>
        </div>
        <div className="bg-gain/10 border border-gain/30 rounded-lg p-3">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-gain" />
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
              {isSk ? 'Pasívny príjem / rok' : 'Annual passive income'}
            </p>
          </div>
          <p className="text-lg font-bold text-gain">
            ${annualIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>
    </div>
  );
}
