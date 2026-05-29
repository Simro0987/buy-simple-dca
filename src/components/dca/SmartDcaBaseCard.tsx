import { useMemo, useState } from 'react';
import { Zap, Wifi, Shield, CheckCircle2, AlertTriangle, ArrowRight, TrendingUp, Lock, Coins } from 'lucide-react';
import { usePrices } from '@/hooks/usePrices';
import { useProfitReservoir, deductReservoir } from '@/lib/profitReservoir';
import { toast } from 'sonner';

type Freq = 'daily' | 'weekly' | 'monthly';
type Slip = 'auto' | 0.1 | 0.3 | 0.5;
type Router = 'odos' | 'velora';
type Mode = 'market' | 'limit';

interface Asset {
  key: 'cbBTC' | 'WETH' | 'SOL';
  label: string;
  sub: string;
  priceKey: 'bitcoin' | 'ethereum' | 'solana';
  /** Per-asset CoW P2P match probability (simulated) */
  p2p: number;
  /** Allocation weight inside the budget */
  weight: number;
}

const ASSETS: Asset[] = [
  { key: 'cbBTC', label: 'cbBTC', sub: 'Coinbase Wrapped BTC', priceKey: 'bitcoin',  p2p: 78, weight: 0.64 },
  { key: 'WETH',  label: 'WETH',  sub: 'Wrapped Ethereum',     priceKey: 'ethereum', p2p: 84, weight: 0.25 },
  { key: 'SOL',   label: 'SOL',   sub: 'Wormhole SOL · Base',  priceKey: 'solana',   p2p: 71, weight: 0.11 },
];

const QUICK = [50, 100, 200, 500];

function routerSim(asset: Asset['key'], usdc: number, slipPct: number, priceUsd: number) {
  if (!priceUsd || usdc <= 0) return { odos: null, velora: null } as const;
  const base = usdc / priceUsd;
  const seed = asset === 'cbBTC' ? 0.00018 : asset === 'WETH' ? 0.00024 : 0.00031;
  const sizeImpact = Math.min(0.008, (usdc / 50000));
  const odosImpactPct   = (sizeImpact + seed * 0.6) * 100;
  const veloraImpactPct = (sizeImpact + seed * 1.0) * 100;
  const odosFee   = Math.max(0.01, usdc * 0.00012);
  const veloraFee = Math.max(0.02, usdc * 0.00018);
  const slipFactor = 1 - (slipPct / 100) * 0.05;
  const assetEdgeOdos = asset === 'cbBTC' ? 1.00025 : asset === 'WETH' ? 1.0001 : 0.99985;
  const odosOut   = base * (1 - odosImpactPct / 100) * slipFactor * assetEdgeOdos - odosFee / priceUsd;
  const veloraOut = base * (1 - veloraImpactPct / 100) * slipFactor - veloraFee / priceUsd;
  return {
    odos:   { out: odosOut,   impactPct: odosImpactPct,   feeUsd: odosFee },
    velora: { out: veloraOut, impactPct: veloraImpactPct, feeUsd: veloraFee },
  } as const;
}

function fmt6(n: number | undefined | null) {
  if (n == null || !isFinite(n)) return '—';
  return n.toFixed(6);
}

export function SmartDcaBaseCard() {
  const { data: prices } = usePrices();
  const reservoir = useProfitReservoir();
  const [budget, setBudget] = useState<number>(100);
  const [freq, setFreq]     = useState<Freq>('weekly');
  const [slip, setSlip]     = useState<Slip>('auto');

  // Per-asset Market/Limit mode
  const [modes, setModes] = useState<Record<Asset['key'], Mode>>({ cbBTC: 'market', WETH: 'market', SOL: 'market' });
  // cbBTC LIMIT only: Profit Reservoir toggle
  const [useReservoirBtc, setUseReservoirBtc] = useState(false);

  const slipPct = slip === 'auto' ? 0.1 : slip;
  const gasUsd = useMemo(() => 0.004 + Math.random() * 0.006, [budget]);

  // Per-asset USD amount = budget × weight
  const perAssetUsd = (a: Asset) => budget * a.weight;

  // Aggregate winners across all 3 assets (reactive Self-Learning feed)
  const winners = useMemo(() => {
    const w: Record<Asset['key'], Router | null> = { cbBTC: null, WETH: null, SOL: null };
    ASSETS.forEach(a => {
      const p = prices?.[a.priceKey]?.usd ?? 0;
      const usd = perAssetUsd(a);
      const q = routerSim(a.key, usd, slipPct, p);
      if (q.odos && q.velora && usd <= 500) {
        w[a.key] = q.odos.out >= q.velora.out ? 'odos' : 'velora';
      }
    });
    return w;
  }, [prices, budget, slipPct]);

  return (
    <div className="space-y-3">
      {/* CONTROL PANEL */}
      <div className="glass-card p-4 space-y-3 bg-[#0a0d12] border border-emerald-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold tracking-wide text-foreground uppercase">Dynamic Execution Engine</h2>
          </div>
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-semibold text-emerald-400">
            <Wifi className="w-3 h-3" /> Base L2 · Plyn ${gasUsd.toFixed(3)}
          </span>
        </div>

        <label className="block">
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Weekly Investment Budget (USDC)</span>
          <input
            type="number"
            inputMode="decimal"
            value={budget}
            onChange={e => setBudget(Math.max(0, Number(e.target.value) || 0))}
            className="mt-1 w-full bg-[#06080b] border border-emerald-500/20 rounded-lg px-3 py-2 text-2xl font-bold text-emerald-300 tabular-nums focus:outline-none focus:border-emerald-400/60"
          />
        </label>

        <div className="flex gap-1.5 flex-wrap">
          {QUICK.map(v => (
            <button
              key={v}
              onClick={() => setBudget(v)}
              className={`px-3 py-1.5 rounded-md text-[11px] font-semibold tabular-nums transition-colors ${
                budget === v ? 'bg-emerald-500 text-black' : 'bg-secondary text-foreground hover:bg-secondary/80'
              }`}
            >${v}</button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Frekvencia</p>
            <div className="flex gap-1 bg-[#06080b] border border-border rounded-lg p-0.5">
              {(['daily','weekly','monthly'] as Freq[]).map(f => (
                <button key={f} onClick={() => setFreq(f)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    freq === f ? 'bg-emerald-500/20 text-emerald-300' : 'text-muted-foreground'
                  }`}
                >{f === 'daily' ? 'Denne' : f === 'weekly' ? 'Týždeň' : 'Mesiac'}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Slippage</p>
            <div className="flex gap-1 bg-[#06080b] border border-border rounded-lg p-0.5">
              {(['auto', 0.1, 0.3, 0.5] as Slip[]).map(s => (
                <button key={String(s)} onClick={() => setSlip(s)}
                  className={`flex-1 px-1.5 py-1.5 rounded-md text-[10px] font-semibold tabular-nums transition-colors ${
                    slip === s ? 'bg-emerald-500/20 text-emerald-300' : 'text-muted-foreground'
                  }`}
                >{s === 'auto' ? 'Auto' : `${s}%`}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2 text-[10px]">
          <span className="uppercase text-muted-foreground tracking-wider">Alokácia 64 / 25 / 11</span>
          <span className="text-emerald-300 font-bold tabular-nums">
            cbBTC ${(budget*0.64).toFixed(0)} · WETH ${(budget*0.25).toFixed(0)} · SOL ${(budget*0.11).toFixed(0)}
          </span>
        </div>
      </div>

      {/* ASSET CARDS */}
      <div className="space-y-3">
        {ASSETS.map(asset => {
          const price = prices?.[asset.priceKey]?.usd ?? 0;
          const usd = perAssetUsd(asset);
          const overVolume = usd > 500;
          const mode = modes[asset.key];
          const isBtc = asset.key === 'cbBTC';
          const reservoirAvail = reservoir.stable;
          const reservoirApplied = isBtc && mode === 'limit' && useReservoirBtc
            ? Math.min(usd, reservoirAvail)
            : 0;
          const fromCapital = usd - reservoirApplied;

          // Quotes use Token_Amount_USD (per-asset USD)
          const quotes = routerSim(asset.key, usd, slipPct, price);
          const odos = quotes.odos;
          const velora = quotes.velora;
          const winner: Router | null =
            !odos || !velora ? null : odos.out >= velora.out ? 'odos' : 'velora';

          const ctaLabel =
            mode === 'limit'        ? 'Nastaviť Limitnú objednávku cez CoW Swap'
            : overVolume            ? 'Otvoriť CoW Swap'
            : winner === 'odos'     ? 'Zrealizovať nákup cez Odos'
            : winner === 'velora'   ? 'Zrealizovať nákup cez Velora'
            : 'Otvoriť swap';

          const onCta = () => {
            const url =
              mode === 'limit' || overVolume ? 'https://swap.cow.fi/'
              : winner === 'odos'  ? 'https://app.odos.xyz/'
              : 'https://app.velora.xyz/';
            if (reservoirApplied > 0) {
              deductReservoir(reservoirApplied, `cbBTC LIMIT funding (CoW Swap)`);
              toast.success(`Profit Reservoir: -$${reservoirApplied.toFixed(2)} alokovaných na cbBTC`);
            }
            window.open(url, '_blank', 'noopener,noreferrer');
          };

          return (
            <div key={asset.key} className="rounded-xl p-3 bg-gradient-to-b from-[#0a0d12] to-[#070a0e] border border-emerald-500/10 space-y-2.5">
              {/* HEADER */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground tracking-wide">
                    USDC <ArrowRight className="inline w-3 h-3 mx-1 text-emerald-400" /> {asset.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{asset.sub} · ${usd.toFixed(2)} alokovaných</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Cena</p>
                  <p className="text-xs font-bold text-foreground tabular-nums">{price ? `$${price.toLocaleString()}` : '—'}</p>
                </div>
              </div>

              {/* TAB TOGGLE */}
              <div className="flex gap-1 bg-[#06080b] border border-border rounded-lg p-0.5">
                {(['market','limit'] as Mode[]).map(m => (
                  <button key={m}
                    onClick={() => setModes(s => ({ ...s, [asset.key]: m }))}
                    className={`flex-1 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      mode === m ? 'bg-emerald-500/20 text-emerald-300' : 'text-muted-foreground'
                    }`}
                  >{m === 'market' ? 'Market' : 'Limit'}</button>
                ))}
              </div>

              {/* MARKET PANEL */}
              {mode === 'market' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {(['odos','velora'] as Router[]).map(r => {
                      const q = r === 'odos' ? odos : velora;
                      const isWin = winner === r;
                      return (
                        <div key={r}
                          className={`relative rounded-lg p-2.5 border transition-all ${
                            overVolume
                              ? 'opacity-30 grayscale border-border bg-[#06080b]'
                              : isWin
                                ? 'opacity-100 border-emerald-400/70 bg-emerald-500/[0.08] shadow-[0_0_18px_-4px_rgba(16,185,129,0.55)]'
                                : 'opacity-40 border-border bg-[#06080b]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
                              {r === 'odos' ? 'Odos.xyz' : 'Velora (ParaSwap)'}
                            </span>
                            {isWin && !overVolume && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                          </div>
                          <p className="text-[9px] uppercase text-muted-foreground">Dostaneš</p>
                          <p className={`text-sm font-bold tabular-nums ${isWin && !overVolume ? 'text-emerald-300' : 'text-foreground'}`}>
                            {fmt6(q?.out)}
                          </p>
                          <div className="flex items-center justify-between mt-1 text-[9px] text-muted-foreground tabular-nums">
                            <span>Impact {q ? q.impactPct.toFixed(2) : '—'}%</span>
                            <span>Fee ${q ? q.feeUsd.toFixed(2) : '—'}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {overVolume ? (
                    <div className="flex items-start gap-2 rounded-lg p-2.5 bg-amber-500/10 border border-amber-500/40">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] font-semibold text-amber-300 leading-snug">
                        ⚠️ Objemy nad 500 USD už nie sú optimálne pre market routery. Urob limitnú objednávku na CoW Swap kvôli MEV ochrane a nulovým poplatkom za plyn.
                      </p>
                    </div>
                  ) : winner ? (
                    <div className="rounded-lg p-2.5 bg-emerald-500/10 border border-emerald-500/40">
                      <p className="text-[11px] font-bold text-emerald-300 leading-snug">
                        {winner === 'odos'
                          ? '👉 Odos.xyz má momentálne najlepší kurz. Urob swap na Odos.xyz'
                          : '👉 Velora má momentálne najlepší kurz. Urob swap na Velora'}
                      </p>
                    </div>
                  ) : null}
                </>
              )}

              {/* LIMIT PANEL (CoW Swap) */}
              {mode === 'limit' && (
                <>
                  <div className="rounded-lg p-3 border border-emerald-500/30 bg-emerald-500/[0.04] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                        <Lock className="w-3 h-3" /> CoW Swap · Self-Custody Limit
                      </span>
                      <span className="text-[9px] text-muted-foreground">Solver Metrics</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-[#06080b] rounded-md p-2">
                        <p className="text-[9px] uppercase text-muted-foreground tracking-wider">P2P Match</p>
                        <p className="text-sm font-bold text-emerald-300 tabular-nums">{asset.p2p}% <span className="text-[9px] text-muted-foreground font-normal">CoW Probability</span></p>
                      </div>
                      <div className="bg-[#06080b] rounded-md p-2">
                        <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Gasless</p>
                        <p className="text-sm font-bold text-emerald-300 tabular-nums">$0.00 <span className="text-[9px] text-muted-foreground font-normal">Cancel & Edit</span></p>
                      </div>
                    </div>
                  </div>

                  {/* Profit Reservoir — VÝHRADNE cbBTC + LIMIT */}
                  {isBtc && (
                    <div className="rounded-lg p-2.5 border border-amber-500/25 bg-amber-500/[0.04] space-y-2">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={useReservoirBtc}
                          onChange={e => setUseReservoirBtc(e.target.checked)}
                          className="mt-0.5 w-3.5 h-3.5 accent-amber-400"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                            <Coins className="w-3 h-3" /> Použiť Profit Reservoir
                          </p>
                          <p className="text-[10px] text-muted-foreground leading-snug">
                            Dostupné: <span className="text-amber-300 tabular-nums font-semibold">${reservoirAvail.toFixed(2)}</span>
                            {useReservoirBtc && (
                              <> · Aplikované: <span className="text-emerald-400 tabular-nums font-semibold">-${reservoirApplied.toFixed(2)}</span></>
                            )}
                          </p>
                          {useReservoirBtc && (
                            <p className="text-[10px] text-muted-foreground tabular-nums mt-0.5">
                              Z kapitálu: ${fromCapital.toFixed(2)} · Z reservoiru: ${reservoirApplied.toFixed(2)}
                            </p>
                          )}
                        </div>
                      </label>
                    </div>
                  )}

                  <div className="rounded-lg p-2.5 bg-emerald-500/10 border border-emerald-500/40">
                    <p className="text-[11px] font-bold text-emerald-300 leading-snug">
                      👉 CoW Swap Limit je aktívny. Prostriedky zostávajú bezpečne na tvojej peňaženke (Self-Custody) až do momentu exekúcie. Žiadne poplatky za plyn pri zrušení objednávky.
                    </p>
                  </div>
                </>
              )}

              {/* CTA */}
              <button
                onClick={onCta}
                className={`w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.98] ${
                  mode === 'limit'
                    ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                    : overVolume
                      ? 'bg-amber-500 text-black hover:bg-amber-400'
                      : 'bg-emerald-500 text-black hover:bg-emerald-400'
                }`}
              >{ctaLabel}</button>
            </div>
          );
        })}
      </div>

      {/* SELF-LEARNING LOG — reaktívne na aktuálnych víťazov */}
      <div className="glass-card p-3 bg-[#0a0d12] border border-border">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">Self-Learning Engine Log</h3>
        </div>
        <ul className="space-y-1 text-[10px] text-muted-foreground tabular-nums">
          {ASSETS.map(a => {
            const w = winners[a.key];
            const base = a.key === 'cbBTC' ? 62 : a.key === 'WETH' ? 54 : 78;
            const baseRouter: Router = a.key === 'SOL' ? 'velora' : 'odos';
            const live = w ?? baseRouter;
            const pct = w ? Math.min(95, base + (w === baseRouter ? 3 : -7)) : base;
            return (
              <li key={a.key} className="flex items-center justify-between">
                <span>{a.label} · 7d</span>
                <span className={live === 'odos' ? 'text-emerald-400' : 'text-amber-300'}>
                  {live === 'odos' ? 'Odos vyhral' : 'Velora vyhrala'} {pct}% swapov
                </span>
              </li>
            );
          })}
        </ul>
        <p className="text-[9px] text-muted-foreground mt-2 flex items-center gap-1">
          <Shield className="w-3 h-3" /> Slippage {slipPct}% · {freq === 'daily' ? 'Denný' : freq === 'weekly' ? 'Týždenný' : 'Mesačný'} režim
        </p>
      </div>
    </div>
  );
}
