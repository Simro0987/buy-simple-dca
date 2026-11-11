import { Activity, Clock, Copy, Loader2, ShoppingCart, X, CheckCircle2, Ban } from 'lucide-react';
import { useTokenDailyIndicators } from '@/hooks/useTokenDailyIndicators';
import { useLlamaStakingApy, formatYieldLine } from '@/hooks/useLlamaStakingApy';
import { useSevenDayActivation, formatDdMm } from '@/hooks/useSevenDayActivation';
import { BrakeBoostBadge } from './BrakeBoostBadge';
import { satAtrLimitDiscountPct } from '@/lib/dynamicExecution';
import { evaluateBrakeBoost } from '@/lib/safetyBrakeBoost';
import { basketAsset, BASKET_LABELS } from '@/lib/assetBaskets';
import type { SieveResult } from '@/lib/dcaBasketEngine';
import { SatelliteSieveDetails } from './SatelliteSieveDetails';
import { MstrMnavPanel } from './MstrMnavPanel';

/** Slovak number formatting — decimal comma + space thousands. */
function sk(n: number, d = 2): string {
  const [int, dec] = n.toFixed(d).split('.');
  const spaced = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? `${spaced},${dec}` : spaced;
}
function skSigned(n: number, d = 2): string {
  return `${n >= 0 ? '+' : ''}${sk(n, d)}`;
}
/** Dynamická presnosť podľa veľkosti ceny (mikro-cap tokeny majú 6 desatín). */
function dp(price: number): number {
  if (!(price > 0)) return 2;
  if (price >= 1000) return 2;
  if (price >= 10) return 3;
  if (price >= 0.1) return 4;
  return 6;
}

export interface GenericSatelliteExecutionCardProps {
  /** Ticker, napr. `ARB`. */
  symbol: string;
  /** Celý názov tokenu (CoinGecko). */
  name?: string;
  /** CoinGecko id — fallback zdroj pre cenu a denné sviece. */
  cgId?: string | null;
  imageUrl?: string | null;
  /** Podiel v % zo SATELITNÉHO koša (jediný zdroj pravdy z pipeline). */
  weightPct: number;
  /** Presná fiat alokácia z pipeline (USD). */
  allocUsd?: number;
  weeklyBudgetUsd: number;
  satelliteScore?: number;
  heldQty?: number;
  emergencyPaused?: boolean;
  filterStatus?: 'approved' | 'falling_knife' | 'stopped';
  redirectedUsd?: number;
  /** Sekvenčné sito KROK 0 / KROK 1 (iba kôš SATELITY). */
  sieve?: SieveResult;
  /** Suma, ktorú by token dostal bez filtrov (pri zamietnutí = presmerovaná). */
  baselineUsd?: number;
  /** Prijímatelia presmerovaného kapitálu v koši. */
  recipients?: { symbol: string; usd: number }[];
  onCopy: (text: string) => void;
}

/**
 * UNIVERZÁLNA satelitná DCA karta — automaticky vytvorená pre každý token
 * pridaný v Portfóliu. Rovnaká matematika a layout ako AAVE / ZEC / ENA:
 *  • MKT / LMT split: satContinuousMarketPct(price, 50D EMA)
 *  • LMT cena: 1.5× denný ATR pod spotom
 *  • 200D MA fallback → 50D EMA (nové tokeny nemajú 200 sviečok)
 *  • Brake & Boost multiplier iba na MKT sumu (default ruleset satelitu)
 *  • S1 / R1 pivot z 30D swing high/low + TP na R1 + 1× ATR
 */
export function GenericSatelliteExecutionCard(p: GenericSatelliteExecutionCardProps) {
  const symU = p.symbol.toUpperCase();
  const { data: ind, isLoading } = useTokenDailyIndicators(symU, true, p.cgId ?? undefined);
  const meta = basketAsset(symU);
  const hasYield = meta?.hasYield !== false;
  const { entry: llamaEntry } = useLlamaStakingApy(symU, hasYield);
  const apyEntry = hasYield ? llamaEntry : null;

  const keyBase = symU.toLowerCase();
  const mkt = useSevenDayActivation(`${keyBase}_isMarketActive`, { token: symU, leg: 'market' });
  const lmt = useSevenDayActivation(`${keyBase}_isLimitActive`, { token: symU, leg: 'limit' });

  const price = ind?.price ?? 0;
  const ema50 = ind?.ema50 ?? 0;
  const maRaw = ind?.sma200 ?? 0;
  const maFallback = !(maRaw > 0) && ema50 > 0;
  const ma = maRaw > 0 ? maRaw : ema50;
  const rsiVal = typeof ind?.rsi14 === 'number' && Number.isFinite(ind.rsi14) ? ind.rsi14 : null;
  const atr14 = ind?.atr14 ?? 0;
  const maDistPct = price > 0 && ma > 0 ? ((price - ma) / ma) * 100 : null;
  const d = dp(price);

  const source = ind?.source === 'yahoo'
    ? 'Yahoo Finance'
    : ind?.source === 'binance'
    ? 'Binance'
    : ind?.source === 'coingecko'
      ? 'CoinGecko'
      : isLoading ? 'Načítavam...' : 'Dáta nedostupné';
  const dexSuffix = ind?.livePriceSource === 'dexscreener'
    ? ` · živá cena DexScreener${ind.dexLiquidityUsd ? ` (likvidita $${sk(ind.dexLiquidityUsd / 1e6, 1)}M)` : ''}`
    : '';
  const sourceLabelBase = ind?.source === 'yahoo'
    ? `${source} · ${symU} denné sviece akcie (${ind.candleCount}D)`
    : ind?.source === 'coingecko'
    ? `${source} · ${symU} denné zatvárania (${ind.candleCount}D)`
    : ind?.source === 'binance'
      ? `${source} · ${symU}/USDT denné sviece`
      : `${source} · ${symU}`;
  const sourceLabel = `${sourceLabelBase}${dexSuffix}${meta ? ` · kôš ${BASKET_LABELS[meta.basket]}` : ''}`;

  const rsiState = rsiVal === null ? (isLoading ? 'Načítavam...' : 'Dáta nedostupné')
    : rsiVal >= 70 ? 'Prekúpené'
    : rsiVal > 30 ? 'Neutrálne'
    : 'Prepredané';

  // ── Brake & Boost — default satelitný ruleset ──
  const brakeState = evaluateBrakeBoost(
    keyBase,
    price > 0 && ma > 0 && rsiVal !== null ? { price, ma200: ma, rsi14: rsiVal } : null,
  );
  const multiplier = brakeState.multiplier;

  // ── MKT / LMT split ──
  const coinUsd = typeof p.allocUsd === 'number' && Number.isFinite(p.allocUsd)
    ? Math.max(0, p.allocUsd)
    : (p.weeklyBudgetUsd * p.weightPct) / 100;
  const sieveFailed = p.sieve?.passed === false;
  const stopped = p.filterStatus === 'falling_knife' || p.filterStatus === 'stopped' || sieveFailed;

  // Dynamický MKT/LMT split z RSI: Market % = 90 − (RSI − 30) × 2, clamp 10..90.
  const rsiForSplit = rsiVal ?? 50;
  const marketPct = Math.max(10, Math.min(90, Math.round(90 - (rsiForSplit - 30) * 2)));
  const limitPct = 100 - marketPct;
  const baseMarketUsd = (coinUsd * marketPct) / 100;
  const limitUsd = (coinUsd * limitPct) / 100;
  const marketUsd = Math.round(baseMarketUsd * multiplier * 100) / 100;

  const discountPct = satAtrLimitDiscountPct(price, atr14) || 5;
  const limitPrice = price > 0 ? Math.max(price * (1 - discountPct / 100), 0) : 0;
  const limitDistPct = price > 0 && limitPrice > 0 ? ((limitPrice - price) / price) * 100 : 0;

  const marketQty = price > 0 ? marketUsd / price : 0;
  const limitQty = limitPrice > 0 ? limitUsd / limitPrice : 0;
  mkt.setDetails({ usd: marketUsd, price });
  lmt.setDetails({ usd: limitUsd, price: limitPrice });

  // ── S1 / R1 pivot + TP ──
  const high30 = ind?.swingHigh ?? 0;
  const low30 = ind?.swingLow ?? 0;
  const pivot = high30 > 0 && low30 > 0 && price > 0 ? (high30 + low30 + price) / 3 : 0;
  const s1 = pivot > 0 ? 2 * pivot - high30 : 0;
  const r1 = pivot > 0 ? 2 * pivot - low30 : 0;
  const tp = r1 > 0 ? r1 + atr14 : 0;

  const bearish = ma > 0 && price > 0 && price < ma;
  const shortBull = ema50 > 0 && price > 0 && price > ema50;
  const sideways = maDistPct !== null && Math.abs(maDistPct) < 3;
  const qtyFmt = (n: number) => sk(n, 2);

  const indicators = [
    {
      label: '50D EMA',
      value: ema50 > 0 ? `$${sk(ema50, d)}` : (isLoading ? 'Načítavam...' : 'Dáta nedostupné'),
      sub: shortBull ? 'Cena nad 50D EMA' : 'Cena pod 50D EMA',
      tone: shortBull ? 'text-emerald-300' : 'text-amber-300',
    },
    {
      label: maFallback ? '200D MA → 50D EMA' : '200D SMA',
      value: ma > 0 ? `$${sk(ma, d)}` : (isLoading ? 'Načítavam...' : 'Dáta nedostupné'),
      sub: maDistPct === null ? (isLoading ? 'Načítavam...' : 'Dáta nedostupné') : `${skSigned(maDistPct, 2)}% od MA`,
      tone: bearish ? 'text-rose-300' : 'text-emerald-300',
    },
    {
      label: 'RSI (14)',
      value: rsiVal === null ? (isLoading ? 'Načítavam...' : 'Dáta nedostupné') : sk(rsiVal, 1),
      sub: rsiState,
      tone: rsiVal !== null && rsiVal >= 70 ? 'text-rose-300' : rsiVal !== null && rsiVal <= 30 ? 'text-emerald-300' : 'text-sky-300',
    },
    {
      label: 'ATR (14D)',
      value: atr14 > 0 ? `±$${sk(atr14, d)}` : (isLoading ? 'Načítavam...' : 'Dáta nedostupné'),
      sub: `LMT −${sk(discountPct, 2)}%`,
      tone: 'text-amber-300',
    },
    {
      label: 'SAT SKÓRE',
      value: typeof p.satelliteScore === 'number' ? sk(p.satelliteScore, 0) : 'Dáta nedostupné',
      sub: 'Váha v satelitnom koši',
      tone: 'text-violet-300',
    },
    {
      label: 'BRAKE & BOOST',
      value: brakeState.mode.replace('_', ' '),
      sub: `MKT × ${(multiplier * 100).toFixed(0)} %`,
      tone: multiplier < 1 ? 'text-orange-300' : multiplier > 1 ? 'text-sky-300' : 'text-emerald-300',
    },
    ...(hasYield ? [{
      label: 'KDE STAKOVAŤ',
      value: apyEntry ? `${apyEntry.estimated ? '~' : ''}${sk(apyEntry.apy, apyEntry.estimated ? 1 : 2)} %` : 'Dáta nedostupné',
      sub: apyEntry
        ? `${formatYieldLine(apyEntry)}${apyEntry.estimated ? ' · odhad' : ` · ${apyEntry.chain}`}${apyEntry.strategy === 'DEX LP' ? ' · ⚠ IL riziko' : ''}`
        : 'Žiadny bezpečný pool > $1M TVL',
      tone: 'text-sky-300',
    }] : []),
  ];

  return (
    <div className="rounded-xl bg-background/60 ring-1 ring-border p-3 space-y-3">
      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {p.imageUrl ? (
            <img src={p.imageUrl} alt={`${symU} logo`} loading="lazy" className="w-8 h-8 rounded-full ring-1 ring-violet-500/40" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-violet-500/15 ring-1 ring-violet-500/40 flex items-center justify-center text-[10px] font-bold text-violet-300">
              {symU.slice(0, 4)}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-foreground">{symU}</span>
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30">
                Satelit
              </span>
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-secondary/60 text-muted-foreground ring-1 ring-border">
                Auto z Portfólia
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="w-2.5 h-2.5" /> {sourceLabel}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">Podiel v koši</p>
          <p className="text-sm font-bold text-foreground tabular-nums">{sk(p.weightPct, 1)}%</p>
          <p className="text-[11px] text-primary font-semibold tabular-nums">${sk(coinUsd)}</p>
        </div>
      </div>

      {/* Trend tags + live price */}
      <div className="flex flex-wrap items-center gap-1.5">
        {p.filterStatus === 'falling_knife' ? (
          <span className="inline-flex items-center gap-1 rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-[9px] font-bold text-destructive line-through">
            <Ban className="h-3 w-3" /> Zastavené: Padajúca dýka (Čaká sa na dno)
          </span>
        ) : p.filterStatus === 'stopped' ? (
          <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-2 py-1 text-[9px] font-bold text-muted-foreground line-through">
            <Ban className="h-3 w-3" /> Zastavené: {sieveFailed ? p.sieve!.reason : 'Cena pod 200WMA'}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[9px] font-bold text-primary">
            <CheckCircle2 className="h-3 w-3" /> Schválené: Zdravý trend
          </span>
        )}
        {(p.redirectedUsd ?? 0) > 0.005 && (
          <span className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[9px] font-bold text-primary">
            +${sk(p.redirectedUsd ?? 0)} presmerované zo zlyhaných tokenov
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ring-1 ${
            bearish
              ? 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
              : 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
          }`}>
            {bearish ? 'Cena pod MA 🐻' : 'Cena nad MA 🐂'}
          </span>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ring-1 ${
            sideways
              ? 'bg-secondary/60 text-muted-foreground ring-border'
              : shortBull
                ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
                : 'bg-amber-500/10 text-amber-300 ring-amber-500/30'
          }`}>
            {sideways ? 'Sideways ↔️' : shortBull ? 'Krátkodobý Bull ↗' : 'Krátkodobý Bear ↘'}
          </span>
          {apyEntry && (
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 ring-1 ring-sky-500/30">
              🌾 {formatYieldLine(apyEntry)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
          {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
          <span className={`font-bold ${price > 0 ? 'text-foreground' : 'text-amber-300'}`}>{price > 0 ? sk(price, d) : (isLoading ? 'Načítavam...' : 'Dáta nedostupné')}</span>
        </div>
      </div>

      {symU === 'MSTR' && <MstrMnavPanel sieve={p.sieve} />}
      {p.sieve && (
        <SatelliteSieveDetails
          symbol={symU}
          sieve={p.sieve}
          baselineUsd={p.baselineUsd ?? 0}
          recipients={p.recipients ?? []}
        />
      )}

      {/* ── INDICATOR GRID ── */}
      <div className={`grid grid-cols-2 gap-1.5 ${stopped ? 'opacity-45 pointer-events-none' : ''}`}>
        {indicators.map(i => (
          <div key={i.label} className="rounded-lg bg-secondary/30 ring-1 ring-border/70 px-2 py-1.5">
            <p className="text-[8px] uppercase tracking-wide text-muted-foreground font-semibold">{i.label}</p>
            <p className={`text-xs font-bold tabular-nums break-words ${i.value === 'Dáta nedostupné' || i.value === 'Načítavam...' ? 'text-amber-300' : i.tone}`}>{i.value}</p>
            <p className="text-[9px] text-muted-foreground tabular-nums">{i.sub}</p>
          </div>
        ))}
      </div>

      {/* ── RSI THERMOMETER ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[9px]">
          <span className="uppercase tracking-wide text-muted-foreground font-semibold">RSI teplomer</span>
          <span className={`tabular-nums font-bold ${rsiVal === null ? "text-amber-300" : "text-foreground"}`}>
            {rsiVal === null ? rsiState : `${sk(rsiVal, 1)} · ${rsiState}`}
          </span>
        </div>
        <div className="relative h-2 rounded-full overflow-visible bg-gradient-to-r from-cyan-400 via-emerald-400 via-40% to-rose-500 ring-1 ring-border">
          {rsiVal !== null && (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-background ring-2 ring-foreground shadow"
              style={{ left: `${Math.min(100, Math.max(0, rsiVal))}%` }}
            />
          )}
        </div>
      </div>

      {/* ── S1 / R1 PIVOT + TP ── */}
      <div className="grid grid-cols-3 gap-1.5">
        <div className="rounded-lg bg-emerald-500/10 ring-1 ring-emerald-500/20 px-2 py-1.5">
          <p className="text-[8px] uppercase tracking-wide text-emerald-300 font-semibold">S1 · Support</p>
          <p className="text-xs font-bold tabular-nums text-foreground">{s1 > 0 ? `$${sk(s1, d)}` : '—'}</p>
        </div>
        <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/20 px-2 py-1.5">
          <p className="text-[8px] uppercase tracking-wide text-amber-300 font-semibold">R1 · Resist.</p>
          <p className="text-xs font-bold tabular-nums text-foreground">{r1 > 0 ? `$${sk(r1, d)}` : '—'}</p>
        </div>
        <div className="rounded-lg bg-primary/10 ring-1 ring-primary/20 px-2 py-1.5">
          <p className="text-[8px] uppercase tracking-wide text-primary font-semibold">TP · R1+ATR</p>
          <p className="text-xs font-bold tabular-nums text-foreground">{tp > 0 ? `$${sk(tp, d)}` : '—'}</p>
        </div>
      </div>

      {/* ── ALLOCATION BAR ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[9px] tabular-nums">
          <span className="font-bold text-emerald-300">MKT {marketPct}%</span>
          <span className="text-muted-foreground uppercase tracking-wide">Alokácia ${sk(coinUsd)}</span>
          <span className="font-bold text-amber-400">LMT {limitPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-background/60 overflow-hidden flex ring-1 ring-border">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${marketPct}%` }} />
          <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${limitPct}%` }} />
        </div>
        {(p.heldQty ?? 0) > 0 && (
          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
            <span>vlastním: <span className="text-foreground font-semibold tabular-nums">{qtyFmt(p.heldQty ?? 0)} {symU}</span></span>
          </div>
        )}
      </div>

      {/* ── ACTION: MKT + LMT ── */}
      <div className="grid grid-cols-2 gap-1.5">
        {/* MKT */}
        <div className="rounded-lg p-2 bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">MKT · {marketPct}%</p>
            <BrakeBoostBadge state={brakeState} />
          </div>
          <div className="flex items-center gap-1">
            <p className="text-sm font-bold text-foreground tabular-nums">${sk(marketUsd)}</p>
            <button
              type="button"
              onClick={() => p.onCopy(marketUsd.toFixed(2))}
              className="p-0.5 rounded text-emerald-300 hover:bg-foreground/10 active:scale-95"
              aria-label="Kopíruj MKT sumu"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[9px] text-foreground/70 tabular-nums">≈ {qtyFmt(marketQty)} {symU}</p>
          <p className="text-[10px] font-semibold text-foreground tabular-nums mt-0.5">
            {price > 0 ? sk(price, d) : (isLoading ? 'Načítavam...' : 'Dáta nedostupné')} <span className="text-[8px] text-muted-foreground uppercase">live</span>
          </p>
          {mkt.isActive ? (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="flex-1 min-w-0 px-1.5 py-1 rounded text-[9px] font-bold text-center truncate bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/60">
                <CheckCircle2 className="inline w-3 h-3 mr-0.5" /> Zrealizované
              </span>
              <button
                type="button"
                onClick={() => mkt.clear()}
                className="shrink-0 px-1.5 py-1 rounded text-[9px] font-bold flex items-center gap-0.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:scale-95"
              >
                <X className="w-3 h-3" /> Zrušiť
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => mkt.activate()}
              disabled={p.emergencyPaused || marketUsd <= 0 || price <= 0 || stopped}
              className="mt-1.5 w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 disabled:opacity-70 bg-emerald-500 text-background"
            >
              <ShoppingCart className="w-3 h-3" /> Aktivovať Market
            </button>
          )}
        </div>

        {/* LMT — nedotknutý multiplierom */}
        <div className="rounded-lg p-2 bg-primary/10 ring-1 ring-primary/20">
          <p className="text-[9px] font-bold uppercase tracking-wide text-primary">LMT · {limitPct}%</p>
          <div className="flex items-center gap-1">
            <p className="text-sm font-bold text-foreground tabular-nums">${sk(limitUsd)}</p>
            <button
              type="button"
              onClick={() => p.onCopy(limitUsd.toFixed(2))}
              className="p-0.5 rounded text-primary hover:bg-foreground/10 active:scale-95"
              aria-label="Kopíruj LMT sumu"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[9px] text-foreground/70 tabular-nums">≈ {qtyFmt(limitQty)} {symU}</p>
          <p className="text-[10px] font-semibold text-foreground tabular-nums mt-0.5">
            {limitPrice > 0 ? sk(limitPrice, d) : '—'}
            <span className="text-[9px] text-muted-foreground ml-1">({sk(limitDistPct, 2)}%)</span>
          </p>
          {lmt.isActive ? (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="flex-1 min-w-0 px-1.5 py-1 rounded text-[9px] font-bold text-center truncate bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/60">
                <Clock className="inline w-3 h-3 mr-0.5" /> Čaká na burze (7d · {lmt.activeUntil ? formatDdMm(lmt.activeUntil) : '—'})
              </span>
              <button
                type="button"
                onClick={() => lmt.clear()}
                className="shrink-0 px-1.5 py-1 rounded text-[9px] font-bold flex items-center gap-0.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:scale-95"
              >
                <X className="w-3 h-3" /> Zrušiť
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => lmt.activate()}
              disabled={p.emergencyPaused || limitUsd <= 0 || limitPrice <= 0 || stopped}
              className="mt-1.5 w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 disabled:opacity-70 bg-primary text-primary-foreground"
            >
              Aktivovať Limit
            </button>
          )}
        </div>
      </div>

      {/* ── ANALYTICAL FOOTER ── */}
      <div className="space-y-1">
        <p className="text-[10px] text-foreground/90 leading-snug bg-background/40 rounded px-2 py-1.5 border-l-2 border-violet-400/60">
          <span className="font-bold text-violet-300">Satelit {symU}{p.name ? ` (${p.name})` : ''}. </span>
          Karta bola vytvorená automaticky pri pridaní tokenu do Portfólia. Split {marketPct}/{limitPct} je
          odvodený zo vzorca Market % = 90 − (RSI − 30) × 2 (clamp 10..90); limit leží 1.5× ATR pod spotom (−{sk(discountPct, 2)} %).
          Brake & Boost mení MKT sumu (× {(multiplier * 100).toFixed(0)} %). Uvoľnený kapitál dotuje Boost tokeny, prebytok ide do BTC, nedostatok sa kryje z Hotovostnej rezervy.
          {maFallback ? ' 200D MA nedostupná → použitá 50D EMA.' : ''}
        </p>
      </div>
    </div>
  );
}
