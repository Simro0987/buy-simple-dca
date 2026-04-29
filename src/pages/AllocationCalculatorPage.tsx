import { useMemo, useState, useEffect } from 'react';
import { Calculator, Save, Plus, ListChecks } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { TOKENS, formatUsd } from '@/lib/crypto';
import { usePrices } from '@/hooks/usePrices';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAppSettings';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';

interface Props { lang: Lang; }

type Sym = 'BTC' | 'ETH' | 'SOL';
type Cat = 'hold' | 'staking' | 'lending' | 'trading';
const CATS: { id: Cat; label: string; color: string }[] = [
  { id: 'hold',    label: 'Hold (Cold)',  color: '#3b82f6' },
  { id: 'staking', label: 'Staking',      color: '#10b981' },
  { id: 'lending', label: 'Lending',      color: '#f59e0b' },
  { id: 'trading', label: 'Trading/Liq.', color: '#a855f7' },
];

const DEFAULT_STRAT: Record<Sym, Record<Cat, number>> = {
  BTC: { hold: 100, staking: 0,  lending: 0,  trading: 0 },
  ETH: { hold: 50,  staking: 40, lending: 10, trading: 0 },
  SOL: { hold: 30,  staking: 50, lending: 20, trading: 0 },
};
const DEFAULT_APYS: Record<Sym, Record<Cat, number>> = {
  BTC: { hold: 0, staking: 0,   lending: 2,   trading: 0 },
  ETH: { hold: 0, staking: 3.2, lending: 1.8, trading: 0 },
  SOL: { hold: 0, staking: 7.5, lending: 4.2, trading: 0 },
};

export function AllocationCalculatorPage({ lang }: Props) {
  const { data: prices } = usePrices();
  const { data: settings } = useAppSettings();
  const update = useUpdateAppSettings();

  const [holdings, setHoldings] = useState<Record<Sym, number>>({ BTC: 0, ETH: 0, SOL: 0 });
  const [strategy, setStrategy] = useState<Record<Sym, Record<Cat, number>>>(DEFAULT_STRAT);
  const [apys, setApys] = useState<Record<Sym, Record<Cat, number>>>(DEFAULT_APYS);

  // Hydrate from settings
  useEffect(() => {
    if (!settings) return;
    const mh = (settings.manual_holdings ?? {}) as { btc?: number; eth?: number; sol?: number };
    setHoldings({ BTC: Number(mh.btc ?? 0), ETH: Number(mh.eth ?? 0), SOL: Number(mh.sol ?? 0) });
    const hs = (settings as any).holdings_strategy as typeof DEFAULT_STRAT | undefined;
    if (hs) setStrategy({ ...DEFAULT_STRAT, ...hs });
    const ya = (settings as any).yield_apys as typeof DEFAULT_APYS | undefined;
    if (ya) setApys({ ...DEFAULT_APYS, ...ya });
  }, [settings]);

  const priceOf = (s: Sym) => {
    const id = TOKENS.find(t => t.symbol === s)!.coingeckoId;
    return prices?.[id]?.usd ?? 0;
  };

  const usdValues = useMemo(() => ({
    BTC: holdings.BTC * priceOf('BTC'),
    ETH: holdings.ETH * priceOf('ETH'),
    SOL: holdings.SOL * priceOf('SOL'),
  }), [holdings, prices]);
  const totalUsd = usdValues.BTC + usdValues.ETH + usdValues.SOL;

  const setStratPct = (s: Sym, c: Cat, v: number) => {
    setStrategy(prev => ({ ...prev, [s]: { ...prev[s], [c]: Math.max(0, Math.min(100, v)) } }));
  };
  const sumPct = (s: Sym) => CATS.reduce((sum, c) => sum + (strategy[s][c.id] || 0), 0);

  const breakdown = useMemo(() => {
    const out: { symbol: Sym; cat: Cat; pct: number; coin: number; usd: number }[] = [];
    for (const s of ['BTC', 'ETH', 'SOL'] as Sym[]) {
      const total = sumPct(s) || 1;
      for (const c of CATS) {
        const pct = (strategy[s][c.id] || 0);
        const ratio = pct / total;
        const coin = holdings[s] * ratio;
        const usd = coin * priceOf(s);
        out.push({ symbol: s, cat: c.id, pct, coin, usd });
      }
    }
    return out;
  }, [strategy, holdings, prices]);

  const totalsByCat = CATS.map(c => ({
    cat: c, usd: breakdown.filter(b => b.cat === c.id).reduce((sum, b) => sum + b.usd, 0),
  }));

  // Yield estimate
  const yields = useMemo(() => {
    let monthly = 0; let annual = 0;
    const perCat: Record<Cat, number> = { hold: 0, staking: 0, lending: 0, trading: 0 };
    for (const b of breakdown) {
      const apy = (apys[b.symbol]?.[b.cat] ?? 0) / 100;
      const a = b.usd * apy;
      annual += a; monthly += a / 12;
      perCat[b.cat] += a;
    }
    return { monthly, annual, perCat };
  }, [breakdown, apys]);

  // Chart data
  const chartData = (['BTC', 'ETH', 'SOL'] as Sym[]).map(s => {
    const obj: any = { coin: s };
    const total = sumPct(s) || 1;
    for (const c of CATS) {
      obj[c.label] = ((strategy[s][c.id] || 0) / total) * 100;
    }
    return obj;
  });

  const save = async () => {
    if (!settings?.id) return;
    try {
      await update.mutateAsync({
        id: settings.id,
        manual_holdings: { btc: holdings.BTC, eth: holdings.ETH, sol: holdings.SOL },
        // @ts-expect-error - new columns from Part 3 migration
        holdings_strategy: strategy,
        // @ts-expect-error
        yield_apys: apys,
      });
      toast.success('Stratégia uložená');
    } catch (e) {
      toast.error('Chyba: ' + (e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Calculator className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">🧮 Alokátor držieb</h1>
      </div>

      {/* Section 1: Holdings inputs */}
      <div className="glass-card p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Držby (manuálne)</p>
        {(['BTC', 'ETH', 'SOL'] as Sym[]).map(s => (
          <div key={s} className="flex items-center gap-2">
            <span className="w-10 text-xs font-bold text-foreground">{s}</span>
            <input
              type="number"
              step="0.0001"
              value={holdings[s]}
              onChange={e => setHoldings(prev => ({ ...prev, [s]: Number(e.target.value) || 0 }))}
              className="flex-1 bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground tabular-nums focus:outline-none focus:border-primary"
            />
            <span className="text-[11px] text-muted-foreground tabular-nums w-20 text-right">{formatUsd(usdValues[s])}</span>
          </div>
        ))}
        <div className="flex justify-between pt-2 border-t border-border">
          <span className="text-xs font-semibold text-foreground">Spolu</span>
          <span className="text-sm font-bold text-foreground tabular-nums">{formatUsd(totalUsd)}</span>
        </div>
      </div>

      {/* Section 2: Strategy */}
      <div className="glass-card p-3 space-y-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Stratégia alokácie (% per coin, suma = 100)</p>
        {(['BTC', 'ETH', 'SOL'] as Sym[]).map(s => {
          const sum = sumPct(s);
          return (
            <div key={s} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">{s}</span>
                <span className={`text-[10px] font-semibold ${sum === 100 ? 'text-gain' : 'text-warning'}`}>{sum}%</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {CATS.map(c => (
                  <div key={c.id}>
                    <p className="text-[9px] text-muted-foreground" style={{ color: c.color }}>{c.label.split(' ')[0]}</p>
                    <input
                      type="number"
                      min={0} max={100}
                      value={strategy[s][c.id]}
                      onChange={e => setStratPct(s, c.id, Number(e.target.value) || 0)}
                      className="w-full bg-secondary border border-border rounded px-1 py-1 text-[11px] text-foreground tabular-nums focus:outline-none focus:border-primary"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Section 3: Results */}
      <div className="glass-card p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Vypočítané výsledky</p>
        <div className="space-y-2">
          {(['BTC', 'ETH', 'SOL'] as Sym[]).map(s => (
            <div key={s} className="bg-secondary/30 rounded p-2 space-y-1">
              <p className="text-[10px] font-bold text-foreground">{s}</p>
              {CATS.map(c => {
                const b = breakdown.find(x => x.symbol === s && x.cat === c.id)!;
                if (b.usd <= 0) return null;
                return (
                  <div key={c.id} className="flex items-center justify-between text-[10px]">
                    <span style={{ color: c.color }}>● {c.label}</span>
                    <span className="text-muted-foreground tabular-nums">{b.coin.toFixed(s === 'BTC' ? 6 : 3)} {s}</span>
                    <span className="text-foreground tabular-nums w-16 text-right">{formatUsd(b.usd)}</span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="pt-2 border-t border-border space-y-1">
          <p className="text-[10px] text-muted-foreground">Spolu podľa kategórie</p>
          {totalsByCat.map(t => (
            <div key={t.cat.id} className="flex items-center justify-between text-[11px]">
              <span style={{ color: t.cat.color }}>● {t.cat.label}</span>
              <span className="text-foreground font-semibold tabular-nums">{formatUsd(t.usd)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Section 4: Visual */}
      <div className="glass-card p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Vizuálne rozdelenie</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} stackOffset="expand">
            <XAxis dataKey="coin" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 9 }} tickFormatter={v => `${(v * 100).toFixed(0)}%`} width={35} />
            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11 }} formatter={(v: any) => `${Number(v).toFixed(0)}%`} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            {CATS.map(c => <Bar key={c.id} dataKey={c.label} stackId="a" fill={c.color} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Section 5: Yield */}
      <div className="glass-card p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Yield estimator (APY %)</p>
        {(['BTC', 'ETH', 'SOL'] as Sym[]).map(s => (
          <div key={s} className="space-y-1">
            <p className="text-[10px] font-bold text-foreground">{s}</p>
            <div className="grid grid-cols-4 gap-1">
              {CATS.map(c => (
                <div key={c.id}>
                  <p className="text-[9px] text-muted-foreground">{c.label.split(' ')[0]}</p>
                  <input
                    type="number"
                    step="0.1"
                    value={apys[s][c.id]}
                    onChange={e => setApys(prev => ({ ...prev, [s]: { ...prev[s], [c.id]: Number(e.target.value) || 0 } }))}
                    className="w-full bg-secondary border border-border rounded px-1 py-1 text-[11px] text-foreground tabular-nums focus:outline-none focus:border-primary"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
          <div className="bg-gain/10 rounded p-2">
            <p className="text-[9px] uppercase text-muted-foreground">Mesačne</p>
            <p className="text-sm font-bold text-gain tabular-nums">{formatUsd(yields.monthly)}</p>
          </div>
          <div className="bg-gain/10 rounded p-2">
            <p className="text-[9px] uppercase text-muted-foreground">Ročne</p>
            <p className="text-sm font-bold text-gain tabular-nums">{formatUsd(yields.annual)}</p>
          </div>
        </div>
      </div>

      {/* Section 6: Action items */}
      <div className="glass-card p-3 space-y-1">
        <div className="flex items-center gap-2">
          <ListChecks className="w-3.5 h-3.5 text-primary" />
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Action items</p>
        </div>
        {breakdown.filter(b => b.usd > 100 && b.cat !== 'hold').map(b => (
          <label key={`${b.symbol}-${b.cat}`} className="flex items-center gap-2 text-xs text-foreground p-1">
            <input type="checkbox" className="w-3.5 h-3.5 accent-primary" />
            <span>Presuň <strong>{b.coin.toFixed(b.symbol === 'BTC' ? 6 : 3)} {b.symbol}</strong> do <strong>{CATS.find(c => c.id === b.cat)!.label}</strong> ({formatUsd(b.usd)})</span>
          </label>
        ))}
      </div>

      <button
        onClick={save}
        disabled={update.isPending}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-[0.98] disabled:opacity-50"
      >
        <Save className="w-4 h-4" />
        {update.isPending ? 'Ukladám…' : 'Ulož stratégiu'}
      </button>
      <p className="text-[10px] text-center text-muted-foreground">
        Tento kalkulátor neovplyvňuje cieľovú DCA alokáciu (64/25/11 a 60/40). Pomáha plánovať distribúciu existujúcich držieb.
      </p>
    </div>
  );
}
