import { useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Droplets, Gauge, Shield, ShieldAlert, TrendingDown, TrendingUp, Waves, Zap, Clock, Sparkles } from 'lucide-react';
import { useMarketEngine } from '@/contexts/MarketContext';
import { useMarketData } from '@/hooks/useMarketData';
import { useBtc200wSma } from '@/hooks/useBtc200wSma';
import { useFearGreed } from '@/hooks/usePrices';
import type { FactorKey, FactorReading, MarketMode } from '@/lib/coreSatelliteEngine';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useSatelliteAllocation } from '@/hooks/useSatelliteAllocation';
import { useDynamicSatellites } from '@/hooks/useDynamicSatellites';
import { useDcaTokenVisibility } from '@/lib/dcaTokenVisibility';
import { useSafetyBrakeBoost, type BrakeBoostAllocations } from '@/hooks/useSafetyBrakeBoost';
import { btcContinuousMarketPct, satContinuousMarketPct } from '@/lib/dynamicExecution';
import { SATELLITE_LABEL, effectiveBasketPercentages, type SatelliteToken } from '@/lib/satelliteAllocation';
import { useBtcOnlyMode } from '@/lib/btcOnlyMode';
import { PauseCircle } from 'lucide-react';
import { BASKET_LABELS, type Basket } from '@/lib/assetBaskets';
import { exactTenths } from '@/lib/dcaBasketEngine';
import { publishProxyPoolFlow } from '@/lib/mstrFundamentals';



const FACTOR_ICONS: Record<FactorKey, React.ComponentType<{ className?: string }>> = {
  wma200: Waves,
  fearGreed: Gauge,
  cbbc: Activity,
  liquidity: Droplets,
  volatility: Zap,
  confluence: Sparkles,
};

const FACTOR_TITLE: Record<FactorKey, string> = {
  wma200: '200WMA',
  fearGreed: 'Fear & Greed',
  cbbc: 'CBBC Kvalita',
  liquidity: 'Likvidita',
  volatility: 'Volatilita',
  confluence: 'Confluence',
};


function factorTone(f: FactorReading): { ring: string; text: string; chip: string } {
  switch (f.status) {
    case 'pos':      return { ring: 'border-emerald-500/40', text: 'text-emerald-300', chip: 'bg-emerald-500/15' };
    case 'critical': return { ring: 'border-rose-500/60',    text: 'text-rose-200',    chip: 'bg-rose-500/25 animate-pulse' };
    case 'neg':      return { ring: 'border-amber-500/40',   text: 'text-amber-300',   chip: 'bg-amber-500/15' };
    case 'neu':      return { ring: 'border-amber-500/40', text: 'text-amber-300', chip: 'bg-amber-500/10' };
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
  const { engine, isDegraded, isLoading: engineLoading } = useMarketEngine();
  const { data: market, isPending: marketLoading } = useMarketData();
  const { data: bn } = useBtc200wSma();
  // BTC Live + 200WMA: Binance (fallback na predošlé dáta trhu).
  const btcLivePrice = bn?.price ?? market?.btc?.price ?? 0;
  const btcWma200 = bn?.sma200w ?? market?.btc?.ma200w ?? 0;
  const btcWmaStaleFlag = bn ? false : market?.btc?.ma200wStale === true;
  const lastSync = market?.generatedAt ? new Date(market.generatedAt) : null;
  const lastSyncLabel = lastSync && !Number.isNaN(lastSync.getTime())
    ? lastSync.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })
    : marketLoading ? 'Načítavam...' : 'Dáta nedostupné';
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
  // Štyri makro koše; BTC-only ich bezpečne prepíše na 100/0/0/0.
  const [btcOnly, setBtcOnly] = useBtcOnlyMode();
  const rawCoreWeightPct = Math.max(0, Math.min(100, engine.coreWeight));
  const { satellites: dynamicSats } = useDynamicSatellites();
  const { activeSatellites } = useDcaTokenVisibility();
  const satAlloc = useSatelliteAllocation(
    weeklyBudgetUsd,
    rawCoreWeightPct,
    btcOnly,
    dynamicSats,
    activeSatellites,
    { SATELLITES: engine.satelliteWeight, HIGH_BETA: engine.highBetaWeight, PROXY: engine.proxyWeight },
  );
  // Makro váhy sú iba vstupom do waterfall; všetky zobrazované podiely
  // a USD sumy patria ku konečnému výsledku rovnakej alokácie.
  const effective = effectiveBasketPercentages(satAlloc.basketUsd);
  const coreWeightPct = effective.CORE;
  const satWeightPct = effective.SATELLITES;
  const highBetaWeightPct = effective.HIGH_BETA;
  const proxyWeightPct = effective.PROXY;
  const coreDisp = coreWeightPct.toFixed(1);
  const satDisp = satWeightPct.toFixed(1);
  const highBetaDisp = highBetaWeightPct.toFixed(1);
  const proxyDisp = proxyWeightPct.toFixed(1);
  const coreUsd = satAlloc.basketUsd.CORE;
  const proxyFreedUsd = (satAlloc.cascade?.proxyToCoreUsd ?? 0) + (satAlloc.cascade?.proxyReduceToCoreUsd ?? 0);
  const proxyBoostUsd = satAlloc.cascade?.proxyBoostReserveUsd ?? 0;
  const satUsd = satAlloc.basketUsd.SATELLITES;
  const highBetaUsd = satAlloc.basketUsd.HIGH_BETA;
  const proxyUsd = satAlloc.basketUsd.PROXY;

  // ── CAPITAL SPILL — koľko MKT kapitálu blokuje Brake (STOP/REDUCE) a kam tečie ──
  const { data: fg } = useFearGreed();
  const fgValue = typeof fg?.value === 'number' ? fg.value : 50;
  const btcWmaDistPct = (() => {
    const p = btcLivePrice;
    const w = btcWma200;
    if (!(p > 0) || !(w > 0) || btcWmaStaleFlag) return null;
    const d = ((p - w) / w) * 100;
    return Number.isFinite(d) ? d : null;
  })();

  const allocations = useMemo<BrakeBoostAllocations>(() => {
    const btcMktPct = btcContinuousMarketPct(fgValue, btcWmaDistPct);
    const out: BrakeBoostAllocations = {
      // MSTR uvoľnený kapitál prechádza cez bonus_pool → v BTC základe sa nepočíta dvakrát.
      btc: { marketUsd: (Math.max(0, coreUsd - proxyFreedUsd) * btcMktPct) / 100, limitUsd: (Math.max(0, coreUsd - proxyFreedUsd) * (100 - btcMktPct)) / 100 },
    };
    for (const s of satAlloc.satelliteList) {
      const ind = satAlloc.indicators[s.token as SatelliteToken];
      const mktPct = satContinuousMarketPct(ind?.price ?? 0, ind?.ema50 ?? 0);
      out[s.token as SatelliteToken] = {
        marketUsd: (s.usd * mktPct) / 100,
        limitUsd: (s.usd * (100 - mktPct)) / 100,
      };
    }
    return out;
  }, [coreUsd, proxyFreedUsd, fgValue, btcWmaDistPct, satAlloc.satelliteList, satAlloc.indicators]);

  const proxyPool = useMemo(() => ({ freedUsd: proxyFreedUsd, boostUsd: proxyBoostUsd }), [proxyFreedUsd, proxyBoostUsd]);
  const brake = useSafetyBrakeBoost(allocations, proxyPool);
  useEffect(() => {
    publishProxyPoolFlow({
      toPoolUsd: brake.result?.proxyFreedUsd ?? proxyFreedUsd,
      fromPoolUsd: brake.result?.proxyBoostFromPoolUsd ?? 0,
      fromReserveUsd: brake.result?.proxyBoostFromReserveUsd ?? proxyBoostUsd,
    });
  }, [brake.result, proxyFreedUsd, proxyBoostUsd]);
  const blocked = (brake.result?.list ?? []).filter(r => r.token !== 'btc' && r.redirectedOutUsd > 0.01);
  const stopped = blocked.filter(r => r.mode === 'STOP');
  const reduced = blocked.filter(r => r.mode === 'REDUCE');
  const redirectedUsd = brake.result?.totalRedirectedUsd ?? 0;
  const btcSharePct = brake.result?.btcSharePct ?? 0;
  const floorTopUpUsd = brake.result?.btcFloorTopUpUsd ?? 0;
  const tokenNames = (list: typeof blocked) =>
    list.map(r => SATELLITE_LABEL[r.token as SatelliteToken] ?? r.token.toUpperCase()).join(', ');




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
            { k: 'C', t: '4 koše', v: `${coreDisp}/${satDisp}/${highBetaDisp}/${proxyDisp}`, c: 'text-sky-300' },
            { k: 'D', t: 'Tokeny', v: `BTC + ${satAlloc.satelliteList.length}`, c: 'text-violet-300' },

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
            <Clock className="w-2.5 h-2.5" /> 200WMA · Binance · {lastSyncLabel}
          </span>
        </div>

        {/* BTC LIVE PRICE + 200WMA DISTANCE — visible (never tooltip-hidden) */}
        {(() => {
          const btcPrice = btcLivePrice;
          const btcWma = btcWma200;
          const stale = btcWmaStaleFlag;
          const hasPrice = btcPrice > 0;
          const hasDist = hasPrice && btcWma > 0 && !stale;
          const dist = hasDist ? btcWmaDistPct : null;
          let tone = 'bg-amber-500/10 text-amber-300 border-amber-500/40';
          if (dist !== null) {
            if (dist < 0) tone = 'bg-rose-500/15 text-rose-300 border-rose-500/40';
            else if (dist > 10) tone = 'bg-amber-500/15 text-amber-300 border-amber-500/40';
            else tone = 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40';
          }
          const priceLabel = hasPrice
            ? `$${btcPrice.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
            : marketLoading ? 'Načítavam...' : 'Dáta nedostupné';
          const distLabel = dist !== null
            ? `${dist >= 0 ? '+' : ''}${dist.toFixed(2)}%`
            : marketLoading ? 'Načítavam...' : 'Dáta nedostupné';
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
            const missing = f.value === 'Dáta nedostupné';
            const factorValue = missing && engineLoading ? 'Načítavam...' : f.value;
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
                  key={factorValue}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`text-[9px] tabular-nums font-semibold mt-0.5 w-full break-words leading-tight ${missing ? "text-amber-300" : "text-foreground/80"}`}
                >
                  {factorValue}
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
            Core {coreDisp}% · Satelity {satDisp}% · High-Beta {highBetaDisp}% · Proxy {proxyDisp}%
          </span>
        </motion.div>
      </AnimatePresence>

      {/* ALL / BTC ONLY — manuálny master override */}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
          Režim alokácie
        </span>
        <div className="inline-flex rounded-full border border-border bg-background/60 p-0.5 ring-1 ring-border">
          {([
            { id: false as const, label: 'ALL' },
            { id: true as const, label: 'BTC ONLY' },
          ]).map((opt) => {
            const active = btcOnly === opt.id;
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => setBtcOnly(opt.id)}
                className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wide transition-all ${
                  active
                    ? opt.id
                      ? 'bg-amber-500 text-black shadow-[0_0_12px_-2px_rgba(245,158,11,0.6)]'
                      : 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {btcOnly && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 flex items-center gap-2">
          <PauseCircle className="w-4 h-4 text-amber-300 shrink-0" />
          <p className="text-[10px] font-semibold leading-snug text-amber-200">
            ⏸️ Satellites Paused — 100 % kapitálu smeruje do BTC Override.
          </p>
        </div>
      )}

      {/* MASTER STACK BAR — 4 makro koše */}
      <div className="space-y-1.5">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] uppercase tracking-wide font-semibold">
          <span className="text-sky-300">Core · BTC · {coreDisp}%</span>
          <span className="text-violet-300">Satelity · 7 · {satDisp}%</span>
          <span className="text-rose-300">High-Beta · 7 · {highBetaDisp}%</span>
          <span className="text-amber-300">Proxy · MSTR · {proxyDisp}%</span>
        </div>
        <div className="h-4 rounded-full bg-background/60 overflow-hidden flex ring-1 ring-border">
          <motion.div
            className="h-full bg-gradient-to-r from-sky-500 to-blue-500"
            animate={{ width: `${coreWeightPct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
            animate={{ width: `${satWeightPct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
          <motion.div
            className="h-full bg-gradient-to-r from-rose-500 to-orange-500"
            animate={{ width: `${highBetaWeightPct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
          <motion.div
            className="h-full bg-gradient-to-r from-amber-400 to-yellow-500"
            animate={{ width: `${proxyWeightPct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] tabular-nums">
          <span className="text-sky-300 font-semibold">{coreDisp}% · ${coreUsd.toFixed(0)}</span>
          <span className="text-violet-300 font-semibold">{satDisp}% · ${satUsd.toFixed(0)}</span>
          <span className="text-rose-300 font-semibold">{highBetaDisp}% · ${highBetaUsd.toFixed(0)}</span>
          <span className="text-amber-300 font-semibold">{proxyDisp}% · ${proxyUsd.toFixed(0)}</span>
        </div>
        {/* SMOOTH MACRO RATIO — plynulý prechod k makro cieľu */}
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <Clock className="w-3 h-3 shrink-0" />
          {engine.ratioDrifting ? (
            <span>
              Plynulý prechod: cieľ Core <strong className="text-sky-300">{engine.rawCoreTargetPct.toFixed(1)} %</strong>
              {' '}(Δ {engine.ratioGapPp > 0 ? '+' : ''}{engine.ratioGapPp.toFixed(1)} pp) · max 2,5 pp / 24 h · BTC floor 50 %
            </span>
          ) : (
            <span>Makro pomer stabilizovaný (cieľ {engine.rawCoreTargetPct.toFixed(1)} %) · BTC floor 50 % vždy platí</span>
          )}
        </div>
      </div>


      {/* PER-TOKEN BARS — BTC (CORE) + 7 satelitov podľa relatívneho skóre */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Token alokácia · Amount to Buy (live)
          </p>
          <span className="text-[9px] tabular-nums text-muted-foreground">
            Σ skóre {satAlloc.totalScore.toFixed(0)}
          </span>
        </div>

        {/* CORE */}
        <div className="flex items-center gap-2">
          <span className="w-9 text-[10px] font-bold text-amber-300">BTC</span>
          <div className="flex-1 h-2.5 rounded-full bg-background/60 overflow-hidden ring-1 ring-border">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-500"
              animate={{ width: `${coreWeightPct}%` }}
              transition={{ type: 'spring', stiffness: 110, damping: 22 }}
            />
          </div>
          <span className="w-24 text-right text-[10px] tabular-nums text-foreground font-bold">
            <span className="text-foreground">${coreUsd.toFixed(0)}</span>
            <span className="text-muted-foreground ml-1 font-normal">({coreDisp}%)</span>
          </span>
        </div>

        {/* OSTATNÉ KOŠE — inverse-RSI ostáva jediným zdrojom vnútorných váh. */}
        <div className={`mt-2 pt-2 border-t border-border/60 space-y-1.5 ${btcOnly ? 'opacity-50 grayscale pointer-events-none select-none' : ''}`}>
          {(['SATELLITES', 'HIGH_BETA', 'PROXY'] as Basket[]).map((basket) => {
            const rows = satAlloc.satelliteList.filter((row) => row.basket === basket);
            const shares = exactTenths(rows.map((row) => row.weight));
            const maxShare = Math.max(...shares, 1);
            const tones: Record<string, string> = { SATELLITES: 'text-violet-300', HIGH_BETA: 'text-rose-300', PROXY: 'text-amber-300' };
            const bars: Record<string, string> = { SATELLITES: 'bg-violet-500', HIGH_BETA: 'bg-rose-500', PROXY: 'bg-amber-500' };
            return (
              <section key={basket} className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <span className={`flex items-center gap-1 text-[9px] uppercase tracking-wide font-semibold ${tones[basket]}`}>
                    <Sparkles className="w-2.5 h-2.5" /> {BASKET_LABELS[basket]}
                  </span>
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    {rows.length} tokenov · ${satAlloc.basketUsd[basket].toFixed(0)}
                  </span>
                </div>
                {rows.map((s, index) => {
                  const sharePct = shares[index] ?? 0;
                  return (
                <div key={s.token} className="flex items-center gap-2">
                  <span className={`w-12 text-[10px] font-bold flex items-center gap-1 ${tones[basket]}`}>
                    {s.label}
                  </span>
                  <div className="flex-1 min-w-0 h-2.5 rounded-full bg-background/60 overflow-hidden ring-1 ring-border">
                    <motion.div
                      className={`h-full ${bars[basket]}`}
                      animate={{ width: `${Math.min(100, (sharePct / maxShare) * 100)}%` }}
                      transition={{ type: 'spring', stiffness: 110, damping: 22 }}
                    />
                  </div>
                  <span className="w-24 text-right text-[10px] tabular-nums font-bold shrink-0">
                    <span className="text-foreground">${s.usd.toFixed(2)}</span>
                    <span className="text-muted-foreground ml-1 font-normal">
                      (S{s.score.toFixed(0)}·{sharePct.toFixed(1)}%)
                    </span>
                  </span>
                </div>
                  );
                })}
              </section>
            );
          })}


          {/* CAPITAL SPILL NOTE — presmerovanie blokovaného MKT kapitálu */}
          {redirectedUsd > 0.01 && (
            <div className="mt-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 space-y-0.5">
              <p className="text-[10px] leading-snug text-amber-200">
                ⚠️{' '}
                {stopped.length > 0 && (
                  <span className="font-bold">{stopped.length} token{stopped.length > 1 ? 'y' : ''} v STOP režime ({tokenNames(stopped)}){reduced.length > 0 ? ' · ' : ' '}</span>
                )}
                {reduced.length > 0 && (
                  <span className="font-bold">{reduced.length} v REDUCE ({tokenNames(reduced)}) </span>
                )}
                → kapitál <span className="tabular-nums font-bold">${redirectedUsd.toFixed(2)}</span> presmerovaný do BTC Core &amp; aktívnych satelitov.
              </p>
              <p className="text-[9px] tabular-nums text-amber-200/80">
                BTC podiel na MKT pipeline: {(btcSharePct * 100).toFixed(1)} %
                {floorTopUpUsd > 0.01 ? ` · floor doplnok +$${floorTopUpUsd.toFixed(2)}` : ''} · pravidlo Core ≥ 50 %{' '}
                {btcSharePct >= 0.4999 ? '✅ splnené' : '⚠️ dopĺňa sa'} · LMT sumy nedotknuté
              </p>
            </div>
          )}

          {satAlloc.satelliteList.some(s => s.maFallback) && (
            <p className="text-[9px] text-muted-foreground/80 italic pt-0.5">
              200D MA nedostupná pri niektorých satelitoch → použitá 50D EMA.
            </p>
          )}

        </div>

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
          Core ${coreUsd.toFixed(0)} · Sat ${satUsd.toFixed(0)} · HB ${highBetaUsd.toFixed(0)} · Proxy ${proxyUsd.toFixed(0)}
        </span>
      </div>
    </div>
  );
}
