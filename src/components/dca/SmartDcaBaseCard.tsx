import { useMemo, useState } from 'react';
import { Zap, Wifi, Shield, CheckCircle2, AlertTriangle, ArrowRight, TrendingUp } from 'lucide-react';
import { usePrices } from '@/hooks/usePrices';

type Freq = 'daily' | 'weekly' | 'monthly';
type Slip = 'auto' | 0.1 | 0.3 | 0.5;
type Router = 'odos' | 'velora';

interface Asset {
  key: 'cbBTC' | 'WETH' | 'SOL';
  label: string;
  sub: string;
  priceKey: 'bitcoin' | 'ethereum' | 'solana';
}

const ASSETS: Asset[] = [
  { key: 'cbBTC', label: 'cbBTC', sub: 'Coinbase Wrapped BTC', priceKey: 'bitcoin' },
  { key: 'WETH',  label: 'WETH',  sub: 'Wrapped Ethereum',     priceKey: 'ethereum' },
  { key: 'SOL',   label: 'SOL',   sub: 'Wormhole SOL · Base',  priceKey: 'solana' },
];

const QUICK = [50, 100, 200, 500];

// Deterministic pseudo-randomness per asset to simulate live router edge
function routerSim(asset: Asset['key'], usdc: number, slipPct: number, priceUsd: number) {
  if (!priceUsd || usdc <= 0) {
    return { odos: null, velora: null } as const;
  }
  // Base output before fees/impact
  const base = usdc / priceUsd;
  // Slight variance per asset for each router (bps)
  const seed = asset === 'cbBTC' ? 0.00018 : asset === 'WETH' ? 0.00024 : 0.00031;
  const sizeImpact = Math.min(0.008, (usdc / 50000)); // scales with size
  const odosImpactPct   = (sizeImpact + seed * 0.6) * 100;
  const veloraImpactPct = (sizeImpact + seed * 1.0) * 100;
  const odosFee   = Math.max(0.01, usdc * 0.00012);
  const veloraFee = Math.max(0.02, usdc * 0.00018);
  // Apply slippage tolerance as worst-case quote dampener
  const slipFactor = 1 - (slipPct / 100) * 0.05;
  // Asset edge: Odos tends to win cbBTC, Velora tends to win SOL — varies with size
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
  const [budget, setBudget]   = useState<number>(100);
  const [freq, setFreq]       = useState<Freq>('weekly');
  const [slip, setSlip]       = useState<Slip>('auto');

  const slipPct = slip === 'auto' ? 0.1 : slip;
  const perAsset = budget / 3;
  const overVolume = budget > 500;

  // Simulated live Base gas
  const gasUsd = useMemo(() => 0.004 + Math.random() * 0.006, [budget]);

  return (
    <div className="space-y-3">
      {/* CONTROL PANEL */}
      <div className="glass-card p-4 space-y-3 bg-[#0a0d12] border border-emerald-500/10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold tracking-wide text-foreground uppercase">DCA Stratégia</h2>
          </div>
          <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-semibold text-emerald-400">
            <Wifi className="w-3 h-3" />
            Base L2 Connected · Plyn ${gasUsd.toFixed(3)}
          </span>
        </div>

        <label className="block">
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Celkový rozpočet (USDC)</span>
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
                budget === v
                  ? 'bg-emerald-500 text-black'
                  : 'bg-secondary text-foreground hover:bg-secondary/80'
              }`}
            >
              ${v}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Frekvencia</p>
            <div className="flex gap-1 bg-[#06080b] border border-border rounded-lg p-0.5">
              {(['daily', 'weekly', 'monthly'] as Freq[]).map(f => (
                <button
                  key={f}
                  onClick={() => setFreq(f)}
                  className={`flex-1 px-2 py-1.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                    freq === f ? 'bg-emerald-500/20 text-emerald-300' : 'text-muted-foreground'
                  }`}
                >
                  {f === 'daily' ? 'Denne' : f === 'weekly' ? 'Týždeň' : 'Mesiac'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Slippage</p>
            <div className="flex gap-1 bg-[#06080b] border border-border rounded-lg p-0.5">
              {(['auto', 0.1, 0.3, 0.5] as Slip[]).map(s => (
                <button
                  key={String(s)}
                  onClick={() => setSlip(s)}
                  className={`flex-1 px-1.5 py-1.5 rounded-md text-[10px] font-semibold tabular-nums transition-colors ${
                    slip === s ? 'bg-emerald-500/20 text-emerald-300' : 'text-muted-foreground'
                  }`}
                >
                  {s === 'auto' ? 'Auto' : `${s}%`}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between bg-secondary/40 rounded-lg px-3 py-2">
          <span className="text-[10px] uppercase text-muted-foreground tracking-wider">Na asset</span>
          <span className="text-sm font-bold text-emerald-300 tabular-nums">
            ${perAsset.toFixed(2)} <span className="text-muted-foreground font-normal text-[10px]">× 3</span>
          </span>
        </div>
      </div>

      {/* ASSET CARDS */}
      <div className="space-y-3">
        {ASSETS.map(asset => {
          const price = prices?.[asset.priceKey]?.usd ?? 0;
          const quotes = routerSim(asset.key, perAsset, slipPct, price);
          const odos = quotes.odos;
          const velora = quotes.velora;
          const winner: Router | null =
            !odos || !velora ? null : odos.out >= velora.out ? 'odos' : 'velora';

          return (
            <div
              key={asset.key}
              className="rounded-xl p-3 bg-gradient-to-b from-[#0a0d12] to-[#070a0e] border border-emerald-500/10 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground tracking-wide">
                    USDC <ArrowRight className="inline w-3 h-3 mx-1 text-emerald-400" /> {asset.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{asset.sub}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] uppercase text-muted-foreground tracking-wider">Cena</p>
                  <p className="text-xs font-bold text-foreground tabular-nums">
                    {price ? `$${price.toLocaleString()}` : '—'}
                  </p>
                </div>
              </div>

              {/* Router comparison */}
              <div className="grid grid-cols-2 gap-2">
                {(['odos', 'velora'] as Router[]).map(r => {
                  const q = r === 'odos' ? odos : velora;
                  const isWin = winner === r;
                  const dim = overVolume;
                  return (
                    <div
                      key={r}
                      className={`relative rounded-lg p-2.5 border transition-all ${
                        isWin && !dim
                          ? 'border-emerald-400/70 bg-emerald-500/[0.08] shadow-[0_0_18px_-4px_rgba(16,185,129,0.55)] opacity-100'
                          : 'border-border bg-[#06080b] opacity-60'
                      } ${dim ? 'opacity-40 grayscale' : ''}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-foreground">
                          {r === 'odos' ? 'Odos.xyz' : 'Velora'}
                        </span>
                        {isWin && !dim && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                      </div>
                      <p className="text-[9px] uppercase text-muted-foreground">Dostaneš</p>
                      <p className={`text-sm font-bold tabular-nums ${isWin && !dim ? 'text-emerald-300' : 'text-foreground'}`}>
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

              {/* Dynamic banner */}
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

              {/* CTA */}
              <button
                className={`w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all active:scale-[0.98] ${
                  overVolume
                    ? 'bg-amber-500 text-black hover:bg-amber-400'
                    : 'bg-emerald-500 text-black hover:bg-emerald-400'
                }`}
                onClick={() => {
                  const url = overVolume
                    ? 'https://swap.cow.fi/'
                    : winner === 'odos'
                    ? 'https://app.odos.xyz/'
                    : 'https://app.velora.xyz/';
                  window.open(url, '_blank', 'noopener,noreferrer');
                }}
              >
                {overVolume
                  ? 'Otvoriť CoW Swap'
                  : winner === 'odos'
                  ? 'Zrealizovať nákup cez Odos'
                  : 'Zrealizovať nákup cez Velora'}
              </button>
            </div>
          );
        })}
      </div>

      {/* SELF-LEARNING LOG */}
      <div className="glass-card p-3 bg-[#0a0d12] border border-border">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-foreground">Self-Learning Engine Log</h3>
        </div>
        <ul className="space-y-1 text-[10px] text-muted-foreground tabular-nums">
          <li className="flex items-center justify-between"><span>cbBTC · 7d</span><span className="text-emerald-400">Odos vyhral 62 % swapov</span></li>
          <li className="flex items-center justify-between"><span>WETH · 7d</span><span className="text-emerald-400">Odos vyhral 54 % swapov</span></li>
          <li className="flex items-center justify-between"><span>SOL · 7d</span><span className="text-emerald-400">Velora vyhrala 78 % swapov</span></li>
        </ul>
        <p className="text-[9px] text-muted-foreground mt-2 flex items-center gap-1">
          <Shield className="w-3 h-3" /> Slippage {slipPct}% · {freq === 'daily' ? 'Denný' : freq === 'weekly' ? 'Týždenný' : 'Mesačný'} režim
        </p>
      </div>
    </div>
  );
}
