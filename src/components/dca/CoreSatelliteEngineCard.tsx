import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Droplets, Gauge, Shield, ShieldAlert, TrendingDown, TrendingUp, Waves, Zap, Clock } from 'lucide-react';
import { useMarketEngine } from '@/contexts/MarketContext';
import { useMarketData } from '@/hooks/useMarketData';
import type { FactorKey, FactorReading, MarketMode } from '@/lib/coreSatelliteEngine';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';


const FACTOR_ICONS: Record<FactorKey, React.ComponentType<{ className?: string }>> = {
  wma200: Waves,
  fearGreed: Gauge,
  cbbc: Activity,
  liquidity: Droplets,
  volatility: Zap,
};

const FACTOR_TITLE: Record<FactorKey, string> = {
  wma200: '200WMA',
  fearGreed: 'Fear & Greed',
  cbbc: 'CBBC Kvalita',
  liquidity: 'Likvidita',
  volatility: 'Volatilita',
};

function factorTone(f: FactorReading): { ring: string; text: string; chip: string } {
  switch (f.status) {
    case 'pos':      return { ring: 'border-emerald-500/40', text: 'text-emerald-300', chip: 'bg-emerald-500/15' };
    case 'critical': return { ring: 'border-rose-500/60',    text: 'text-rose-200',    chip: 'bg-rose-500/25 animate-pulse' };
    case 'neg':      return { ring: 'border-amber-500/40',   text: 'text-amber-300',   chip: 'bg-amber-500/15' };
    default:         return { ring: 'border-border',         text: 'text-foreground',  chip: 'bg-secondary' };
  }
}

const MODE_STYLE: Record<MarketMode, { bg: string; text: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  ACCUMULATION: { bg: 'bg-emerald-500/15 border-emerald-500/40', text: 'text-emerald-300', label: 'ACCUMULATION · Hromaď pozície', icon: TrendingUp },
  CAUTIOUS_ACCUMULATION: { bg: 'bg-sky-500/15 border-sky-500/40', text: 'text-sky-300', label: 'CAUTIOUS ACCUMULATION · NAD + Panic F&G', icon: Shield },
  BALANCED:     { bg: 'bg-secondary border-border',              text: 'text-foreground',  label: 'BALANCED · Vyvážená alokácia', icon: Shield },
  DISTRIBUTION: { bg: 'bg-amber-500/15 border-amber-500/40',     text: 'text-amber-300',   label: 'DISTRIBUTION · Odľahčuj satelity', icon: TrendingDown },
  DEFENSIVE:    { bg: 'bg-rose-500/15 border-rose-500/50 animate-pulse', text: 'text-rose-200', label: 'DEFENSIVE · Freeze nových buyov', icon: ShieldAlert },
};

const ALERT_KEY = 'core-satellite-defensive-alert-ts';
const ALERT_THROTTLE_MS = 60 * 60 * 1000; // 1 h

interface Props {
  weeklyBudgetUsd: number;
}

export function CoreSatelliteEngineCard({ weeklyBudgetUsd }: Props) {
  const { engine, isDegraded } = useMarketEngine();
  const { data: market } = useMarketData();
  const lastSync = market?.generatedAt ? new Date(market.generatedAt) : null;
  const lastSyncLabel = lastSync && !Number.isNaN(lastSync.getTime())
    ? lastSync.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const lastModeRef = useRef<MarketMode | null>(null);


  // Defensive lock → Telegram alert (one-shot, throttled).
  useEffect(() => {
    if (!engine.defensiveLock) return;
    if (lastModeRef.current === 'DEFENSIVE') return;
    lastModeRef.current = engine.mode;

    const lastTs = Number(localStorage.getItem(ALERT_KEY) || 0);
    if (Date.now() - lastTs < ALERT_THROTTLE_MS) return;
    const chatId = localStorage.getItem('telegram_chat_id')?.trim();
    if (!chatId) return;

    void supabase.functions.invoke('telegram-cycle-alert', {
      body: {
        chatId,
        cycleScore: Math.round(engine.coreWeight),
        cyclePhase: {
          phase: 'distribution',
          label: 'DEFENSIVE — Volatility lock',
          confidence: 95,
        },
      },
    }).then(({ error }) => {
      if (error) return;
      localStorage.setItem(ALERT_KEY, String(Date.now()));
      toast.warning('DEFENSIVE režim: Telegram alert odoslaný');
    }).catch(() => { /* silent */ });
  }, [engine.defensiveLock, engine.mode, engine.coreWeight]);

  useEffect(() => {
    if (!engine.defensiveLock) lastModeRef.current = engine.mode;
  }, [engine.defensiveLock, engine.mode]);

  const ModeIcon = MODE_STYLE[engine.mode].icon;
  const coreUsd = (weeklyBudgetUsd * engine.coreWeight) / 100;
  const satUsd = weeklyBudgetUsd - coreUsd;

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-primary flex-shrink-0" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-foreground truncate">
            Master Dynamic Allocation · Live Pipeline
          </h2>
        </div>
        {isDegraded && (
          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/15 text-amber-300">
            Fallback dáta
          </span>
        )}
      </div>

      {/* CAPITAL PIPELINE — Step A → B → C → D → E */}
      <div className="rounded-lg border border-border bg-background/40 p-2.5 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          Capital Pipeline · tok kapitálu
        </p>
        <div className="grid grid-cols-5 gap-1 text-center text-[9px]">
          {[
            { k: 'A', t: 'Weekly $', v: `$${weeklyBudgetUsd.toFixed(0)}`, c: 'text-foreground' },
            { k: 'B', t: '5 Factors', v: engine.mode.slice(0, 4), c: 'text-primary' },
            { k: 'C', t: 'Core/Sat', v: `${engine.coreWeight}/${engine.satelliteWeight}`, c: 'text-sky-300' },
            { k: 'D', t: 'Per token', v: `${engine.perToken.btc}·${engine.perToken.eth}·${engine.perToken.sol}`, c: 'text-violet-300' },
            { k: 'E', t: 'Mkt / Lim', v: 'auto', c: 'text-emerald-300' },
          ].map((s, i) => (
            <div key={s.k} className="flex flex-col items-center gap-0.5">
              <span className="w-5 h-5 rounded-full bg-secondary text-[9px] font-bold flex items-center justify-center text-foreground">
                {s.k}
              </span>
              <span className="text-[8px] uppercase tracking-tight text-muted-foreground truncate w-full">{s.t}</span>
              <motion.span
                key={s.v}
                initial={{ opacity: 0, y: 2 }}
                animate={{ opacity: 1, y: 0 }}
                className={`tabular-nums font-bold ${s.c} truncate w-full`}
              >
                {s.v}
              </motion.span>
              {i < 4 && <span className="hidden" />}
            </div>
          ))}
        </div>
      </div>


      {/* 5 FACTORS PANEL */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            5 faktorov trhového režimu
          </p>
          <span className="text-[9px] text-muted-foreground tabular-nums flex items-center gap-1">
            <Clock className="w-2.5 h-2.5" /> 200WMA · Yahoo Finance · {lastSyncLabel}
          </span>
        </div>

        {/* BTC LIVE PRICE + 200WMA DISTANCE — visible (never tooltip-hidden) */}
        {(() => {
          const btcPrice = market?.btc?.price ?? 0;
          const btcWma = market?.btc?.ma200w ?? 0;
          const stale = market?.btc?.ma200wStale === true;
          const hasPrice = btcPrice > 0;
          const hasDist = hasPrice && btcWma > 0 && !stale;
          const dist = hasDist ? ((btcPrice - btcWma) / btcWma) * 100 : null;
          let tone = 'bg-secondary text-muted-foreground border-border';
          if (dist !== null) {
            if (dist < 0) tone = 'bg-rose-500/15 text-rose-300 border-rose-500/40';
            else if (dist > 10) tone = 'bg-amber-500/15 text-amber-300 border-amber-500/40';
            else tone = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
          }
          const priceLabel = hasPrice
            ? `$${btcPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            : 'N/A (Syncing…)';
          const distLabel = dist !== null
            ? `${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%`
            : 'N/A';
          return (
            <div className={`mb-2 rounded-lg border ${tone} px-2.5 py-1.5 flex items-center justify-between gap-2 flex-wrap`}>
              <span className="text-[10px] font-semibold tabular-nums">
                BTC Live: <span className="font-bold">{priceLabel}</span>
              </span>
              <span className="text-[10px] font-bold tabular-nums">
                Distance from 200WMA: {distLabel}
              </span>
            </div>
          );
        })()}

        <div className="grid grid-cols-5 gap-1.5">
          {engine.factors.map((f) => {
            const Icon = FACTOR_ICONS[f.key];
            const tone = factorTone(f);
            return (
              <motion.div
                key={f.key}
                layout
                className={`rounded-lg border ${tone.ring} ${tone.chip} p-1.5 flex flex-col items-center text-center`}
                title={f.detail}
              >
                <Icon className={`w-3.5 h-3.5 mb-0.5 ${tone.text}`} />
                <span className={`text-[9px] font-bold uppercase tracking-tight ${tone.text} truncate w-full`}>
                  {FACTOR_TITLE[f.key]}
                </span>
                <motion.span
                  key={f.value}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-[9px] tabular-nums font-semibold text-foreground/80 mt-0.5 truncate w-full"
                >
                  {f.value}
                </motion.span>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* MODE BADGE */}
      <AnimatePresence mode="wait">
        <motion.div
          key={engine.mode}
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ duration: 0.25 }}
          className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border ${MODE_STYLE[engine.mode].bg}`}
        >
          <span className={`flex items-center gap-1.5 text-xs font-bold tracking-wide ${MODE_STYLE[engine.mode].text}`}>
            <ModeIcon className="w-4 h-4" />
            {MODE_STYLE[engine.mode].label}
          </span>
          <span className="text-[10px] tabular-nums opacity-80 text-foreground">
            Core {engine.coreWeight}% · Sat {engine.satelliteWeight}%
          </span>
        </motion.div>
      </AnimatePresence>

      {/* MASTER STACK BAR */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          <span>Core · BTC</span>
          <span>Satellites · ETH + SOL</span>
        </div>
        <div className="h-4 rounded-full bg-background/60 overflow-hidden flex ring-1 ring-border">
          <motion.div
            className="h-full bg-gradient-to-r from-sky-500 to-blue-500"
            animate={{ width: `${engine.coreWeight}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
            animate={{ width: `${engine.satelliteWeight}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] tabular-nums">
          <motion.span className="text-sky-300 font-semibold" animate={{ opacity: 1 }}>
            {engine.coreWeight}% · ${coreUsd.toFixed(0)}
          </motion.span>
          <motion.span className="text-violet-300 font-semibold">
            {engine.satelliteWeight}% · ${satUsd.toFixed(0)}
          </motion.span>
        </div>
      </div>

      {/* PER-TOKEN SYNC BARS */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          Token alokácia · Amount to Buy (live)
        </p>
        {([
          { key: 'btc', label: 'BTC', pct: engine.perToken.btc, color: 'from-amber-400 to-amber-500', text: 'text-amber-300' },
          { key: 'eth', label: 'ETH', pct: engine.perToken.eth, color: 'from-indigo-400 to-indigo-500', text: 'text-indigo-300' },
          { key: 'sol', label: 'SOL', pct: engine.perToken.sol, color: 'from-fuchsia-400 to-fuchsia-500', text: 'text-fuchsia-300' },
        ] as const).map((row) => (
          <div key={row.key} className="flex items-center gap-2">
            <span className={`w-9 text-[10px] font-bold ${row.text}`}>{row.label}</span>
            <div className="flex-1 h-2.5 rounded-full bg-background/60 overflow-hidden ring-1 ring-border">
              <motion.div
                className={`h-full bg-gradient-to-r ${row.color}`}
                animate={{ width: `${row.pct}%` }}
                transition={{ type: 'spring', stiffness: 110, damping: 22 }}
              />
            </div>
            <motion.span
              key={row.pct}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="w-24 text-right text-[10px] tabular-nums text-foreground font-bold"
            >
              <span className="text-foreground">${((weeklyBudgetUsd * row.pct) / 100).toFixed(0)}</span>
              <span className="text-muted-foreground ml-1 font-normal">({row.pct}%)</span>
            </motion.span>
          </div>
        ))}
      </div>

      {/* RYI — Real Yield Index "Staking Booster" (ETH vs SOL satellite split) */}
      <div className="rounded-lg border border-[#14F195]/25 bg-[#14F195]/5 p-2.5 space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-[#14F195] font-semibold flex items-center gap-1">
            <Zap className="w-3 h-3" /> RYI · Staking Booster
          </p>
          <span className="text-[9px] text-muted-foreground">APY − inflácia (Real Yield)</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="rounded bg-indigo-500/10 border border-indigo-500/30 px-2 py-1">
            <p className="text-[9px] text-indigo-300 font-semibold">ETH</p>
            <p className="text-sm font-bold tabular-nums text-indigo-200">{engine.satelliteRyi.eth >= 0 ? '+' : ''}{engine.satelliteRyi.eth.toFixed(1)}%</p>
          </div>
          <div className="rounded bg-fuchsia-500/10 border border-fuchsia-500/30 px-2 py-1">
            <p className="text-[9px] text-fuchsia-300 font-semibold">SOL</p>
            <p className="text-sm font-bold tabular-nums text-fuchsia-200">{engine.satelliteRyi.sol >= 0 ? '+' : ''}{engine.satelliteRyi.sol.toFixed(1)}%</p>
          </div>
        </div>
        <p className="text-[9px] leading-snug text-foreground/70">
          {engine.satelliteRyi.boosterApplied
            ? `Posun alokácie o ${Math.abs(engine.satelliteRyi.shiftPp).toFixed(0)} pp smerom k ${engine.satelliteRyi.shiftPp >= 0 ? 'ETH' : 'SOL'} (vyšší Real Yield).`
            : 'Rozdiel Real Yield je zanedbateľný — bez posunu alokácie.'}
        </p>
      </div>

      {/* NARRATIVE — "Prečo?" */}
      <div className="rounded-lg border border-border bg-secondary/40 p-2.5 space-y-1">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          Prečo? · Narratív posunu
        </p>
        <ul className="space-y-1">
          {engine.narrative.map((n, i) => (
            <motion.li
              key={`${engine.mode}-${i}`}
              initial={{ opacity: 0, x: -4 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="text-[11px] leading-snug text-foreground/90"
            >
              · {n}
            </motion.li>
          ))}
        </ul>
        {engine.defensiveLock && (
          <p className="text-[10px] text-rose-300 font-semibold pt-1 border-t border-rose-500/30 mt-1">
            🛑 Nové buy príkazy sú zmrazené až do poklesu volatility.
          </p>
        )}
      </div>

      {/* STEP E — forward to execution */}
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 px-2.5 py-2 flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">
          ↓ Step E · Forward do Dynamic Execution Engine
        </span>
        <span className="text-[10px] tabular-nums text-foreground font-bold">
          Core ${((weeklyBudgetUsd * engine.coreWeight) / 100).toFixed(0)} · Sat ${((weeklyBudgetUsd * engine.satelliteWeight) / 100).toFixed(0)}
        </span>
      </div>
    </div>
  );
}
