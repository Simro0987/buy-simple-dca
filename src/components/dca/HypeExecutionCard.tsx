import { Activity, ChevronDown, Clock, Copy, Loader2, ShoppingCart, X } from 'lucide-react';
import { useHypeDailyIndicators } from '@/hooks/useHypeDailyIndicators';
import { BrakeBoostBadge } from './BrakeBoostBadge';
import type { BrakeBoostState } from '@/lib/safetyBrakeBoost';
import { useSevenDayActivation, formatDdMm } from '@/hooks/useSevenDayActivation';
import { applyMinOrderRule } from '@/lib/minOrderRule';

/** Slovak number formatting — decimal comma + space thousands. */
function sk(n: number, d = 2): string {
  const [int, dec] = n.toFixed(d).split('.');
  const spaced = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return dec ? `${spaced},${dec}` : spaced;
}
function skSigned(n: number, d = 2): string {
  return `${n >= 0 ? '+' : ''}${sk(n, d)}`;
}

export interface HypeExecutionCardProps {
  /** Podiel v rámci yield koša v % */
  bucketSharePct: number;
  /** USD alokácia pre HYPE */
  allocationUsd: number;
  /** Exponenciálna váha (S^2.5) */
  weightRaw: number;
  /** Podiel na celom týždennom budgete v % */
  weeklySharePct: number;
  score: number;
  rsi14Fallback: number | null;
  priceVsSmaPct: number;
  fundamentalYield: number;
  fundamentalNote?: string;
  priceFallback: number;
  entryReason: string;
  hitCount: number;
  merged: boolean;
  mergeReason?: string;
  brakeState?: BrakeBoostState | null;
  stakingApy?: number;
  ilRiskReward?: string;
  compoundStatus?: string;
  marketBusy: boolean;
  limitBusy: boolean;
  onActivateMarket: (usd: number, qty: number, price: number) => void;
  onActivateLimit: (usd: number, qty: number, price: number) => void;
  onCopy: (text: string) => void;
}

export function HypeExecutionCard(p: HypeExecutionCardProps) {
  const { data: ind, isLoading: indLoading } = useHypeDailyIndicators();

  const mkt = useSevenDayActivation('hype_isMarketActive', { token: 'HYPE', leg: 'market' });
  const lmt = useSevenDayActivation('hype_isLimitActive', { token: 'HYPE', leg: 'limit' });

  // ── LIVE DATA (200 denných sviec / fallback live cena) ──
  const price = ind?.price ?? p.priceFallback;
  const sma200 = ind?.sma200 ?? 0;
  const ema50 = ind?.ema50 ?? 0;
  const atr14 = ind?.atr14 ?? 0;
  const swingHigh = ind?.swingHigh ?? 0;
  const rsiRaw = ind?.rsi14 ?? p.rsi14Fallback;
  const rsiVal = typeof rsiRaw === 'number' && Number.isFinite(rsiRaw) ? rsiRaw : null;
  const rsiState = rsiVal === null ? (indLoading ? 'Načítavam...' : 'Dáta nedostupné')
    : rsiVal >= 70 ? 'Prekúpené'
    : rsiVal > 30 ? 'Neutrálne'
    : 'Prepredané';

  const stakingApy = p.stakingApy ?? 2.4;
  const ilRiskReward = p.ilRiskReward ?? '1 : 2,1';
  const compoundStatus = p.compoundStatus ?? 'Natívny · auto';

  // ── SMOOTH DYNAMIC SPLIT ENGINE (0–100 %, súčet vždy presne 100 %) ──
  const rsiMod = rsiVal === null ? 0 : 50 - rsiVal;
  const smaDevPct = sma200 > 0 && price > 0 ? ((price - sma200) / sma200) * 100 : p.priceVsSmaPct;
  const trendMod = smaDevPct * 0.5;
  const rawMkt = 50 + rsiMod + trendMod;
  const baseMarketPct = Math.round(Math.min(Math.max(rawMkt, 0), 100));

  // ── HYPE LIMIT LOGIC: spot − 2.5 × ATR(14D) ──
  const limitPrice = price > 0 && atr14 > 0
    ? Math.max(price - 2.5 * atr14, 0)
    : price * 0.9;
  const limitDiscountPct = price > 0 && limitPrice > 0
    ? ((price - limitPrice) / price) * 100
    : 0;

  // S1 = % vs 200D SMA, R1 = % vs 30D swing high
  const s1Pct = sma200 > 0 && price > 0 ? ((price - sma200) / sma200) * 100 : 0;
  const r1Pct = swingHigh > 0 && price > 0 ? ((price - swingHigh) / swingHigh) * 100 : 0;

  // ── UNIVERSAL $10 RULE (Order Routing) ──
  const routed = applyMinOrderRule({
    symbol: 'HYPE',
    totalUsd: p.allocationUsd,
    marketPct: baseMarketPct,
    limitPct: 100 - baseMarketPct,
    rsi: rsiVal,
    bullish: sma200 > 0 && price > sma200,
  });
  const marketPct = routed.marketPct;
  const limitPct = routed.limitPct;
  // Safety Active Brake & Boost — multiplier IBA na MKT sumu (LMT zostáva nedotknutý).
  const marketUsd = Math.round(routed.marketUsd * (p.brakeState?.multiplier ?? 1) * 100) / 100;
  const limitUsd = routed.limitUsd;

  // Keep Telegram notifications in sync with live order details.
  mkt.setDetails({ usd: marketUsd, price: price });
  lmt.setDetails({ usd: limitUsd, price: limitPrice });

  const marketQty = price > 0 ? marketUsd / price : 0;
  const limitQty = limitPrice > 0 ? limitUsd / limitPrice : 0;

  const bullish = sma200 > 0 && price > sma200;
  const shortBull = ema50 > 0 && price > ema50;
  const qtyFmt = (n: number) => sk(n, 4);
  const priceFmt = (n: number) => sk(n, n >= 1 ? 2 : 4);

  const handleActivateMarket = () => { mkt.activate(); p.onActivateMarket(marketUsd, marketQty, price); };
  const handleActivateLimit = () => { lmt.activate(); p.onActivateLimit(limitUsd, limitQty, limitPrice); };

  const indicators = [
    { label: 'APY · DEFILLAMA', value: `${sk(stakingApy, 2)}%`, sub: 'Natívny HYPE staking', tone: 'text-emerald-300' },
    { label: 'IL R/R', value: ilRiskReward, sub: 'Impermanent loss pomer', tone: 'text-sky-300' },
    { label: 'COMPOUND', value: compoundStatus, sub: 'Yield reinvestícia', tone: 'text-emerald-300' },
    { label: 'LIMIT PÁS', value: '2,5×ATR', sub: atr14 > 0 ? `±$${sk(atr14, 4)}` : (indLoading ? 'Načítavam...' : 'Dáta nedostupné'), tone: 'text-amber-300' },
    {
      label: 'S1 SMA200',
      value: sma200 > 0 ? `${skSigned(s1Pct, 1)}%` : (indLoading ? 'Načítavam...' : 'Dáta nedostupné'),
      sub: sma200 > 0 ? `$${priceFmt(sma200)}` : 'Podpora',
      tone: s1Pct >= 0 ? 'text-emerald-300' : 'text-rose-300',
    },
    {
      label: 'R1 SWING HIGH',
      value: swingHigh > 0 ? `${skSigned(r1Pct, 1)}%` : (indLoading ? 'Načítavam...' : 'Dáta nedostupné'),
      sub: swingHigh > 0 ? `$${priceFmt(swingHigh)}` : 'Rezistencia',
      tone: r1Pct >= 0 ? 'text-emerald-300' : 'text-rose-300',
    },
  ];

  return (
    <div className="rounded-xl bg-background/60 ring-1 ring-emerald-500/20 p-3 space-y-3">
      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-bold text-emerald-200">HYPE</span>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 ring-1 ring-sky-500/30">ARB</span>
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/40">Yield</span>
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30">V norme</span>
          </div>
          <div className="flex items-center gap-1 flex-wrap">
            <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ring-1 ${
              bullish ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' : 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
            }`}>
              {bullish ? 'Bull market (cena > SMA 200) 🐂' : 'Bear market (cena < SMA 200) 🐻'}
            </span>
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ring-1 ${
              shortBull ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30' : 'bg-amber-500/10 text-amber-300 ring-amber-500/30'
            }`}>
              {shortBull ? 'Krátkodobý Bull ↗' : 'Krátkodobý Bear ↘'}
            </span>
            {p.merged && (
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40">Merged</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">Podiel v koši</p>
          <p className="text-sm font-bold text-foreground tabular-nums">{sk(p.weeklySharePct, 1)}%</p>
          <p className="text-[11px] text-primary font-semibold tabular-nums">${sk(p.allocationUsd)}</p>
        </div>
      </div>

      {/* ── CUSTOM SUBTITLE BLOCKS ── */}
      <div className="space-y-0.5">
        <p className="text-[10px] font-semibold text-sky-300 tabular-nums">
          {sk(p.bucketSharePct, 1)}% satelitného koša • ${sk(p.allocationUsd)} • relatívne skóre
        </p>
        <p className="text-[10px] font-semibold text-teal-300 tabular-nums">
          S {sk(p.score, 0)} • RSI {rsiVal === null ? (indLoading ? 'Načítavam...' : 'Dáta nedostupné') : sk(rsiVal, 1)} • MA {skSigned(smaDevPct, 0)}% • Fund. {sk(p.fundamentalYield, 0)}
        </p>
        <p className="text-[9px] text-muted-foreground flex items-center gap-1">
          {indLoading ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Activity className="w-2.5 h-2.5" />}
          {ind?.source === 'fallback' ? 'Live cena (bez Binance sviec)' : 'Binance'} · spot ${price > 0 ? priceFmt(price) : (indLoading ? 'Načítavam...' : 'Dáta nedostupné')} · {p.hitCount}/3 podmienok
        </p>
      </div>


      {/* ── 6-GRID INDICATORS ── */}
      <div className="grid grid-cols-2 gap-1.5">
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
        <div className="flex justify-between text-[8px] text-muted-foreground tabular-nums">
          <span>0</span><span>30</span><span>50</span><span>70</span><span>100</span>
        </div>
      </div>

      {/* ── ALLOCATION BAR ── */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[9px] tabular-nums">
          <span className="font-bold text-emerald-300">MKT {marketPct}%</span>
          <span className="text-muted-foreground uppercase tracking-wide">Alokácia ${sk(p.allocationUsd)}</span>
          <span className="font-bold text-amber-400">LMT {limitPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-background/60 overflow-hidden flex ring-1 ring-border">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${marketPct}%` }} />
          <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${limitPct}%` }} />
        </div>
      </div>

      {/* ── SIDE-BY-SIDE ACTION CARDS ── */}
      <div className="grid grid-cols-2 gap-1.5">
        {/* MKT */}
        <div className="rounded-lg p-2 bg-emerald-500/10 ring-1 ring-emerald-500/20">
          <div className="flex items-center justify-between gap-1 flex-wrap">
            <p className="text-[9px] font-bold uppercase tracking-wide text-emerald-300">MKT · {marketPct}%</p>
            <BrakeBoostBadge state={p.brakeState} />
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
          <p className="text-[9px] text-foreground/70 tabular-nums">≈ {qtyFmt(marketQty)} HYPE</p>
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-[10px] font-semibold text-foreground tabular-nums">{price > 0 ? priceFmt(price) : '—'}</p>
            <span className="text-[8px] text-muted-foreground uppercase">live</span>
          </div>
          {mkt.isActive ? (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="flex-1 min-w-0 px-1.5 py-1 rounded text-[9px] font-bold text-center truncate bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30">
                Aktívne do {mkt.activeUntil ? formatDdMm(mkt.activeUntil) : '—'}
              </span>
              <button
                type="button"
                onClick={mkt.clear}
                className="shrink-0 px-1.5 py-1 rounded text-[9px] font-bold flex items-center gap-0.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:scale-95"
              >
                <X className="w-3 h-3" /> Zrušiť
              </button>
            </div>
          ) : (
            <>
            <button
              type="button"
              onClick={handleActivateMarket}
              disabled={p.marketBusy || marketUsd <= 0 || price <= 0}
              className={`mt-1.5 w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 disabled:opacity-70 bg-emerald-500 text-background`}
            >
              {p.marketBusy ? 'Aktivujem…' : <><ShoppingCart className="w-3 h-3" /> Aktivovať Market</>}
            </button>
            </>
          )}

        </div>

        {/* LMT */}
        <div className="rounded-lg p-2 bg-amber-500/10 ring-1 ring-amber-500/20">
          <div className="flex items-center justify-between gap-1">
            <p className="text-[9px] font-bold uppercase tracking-wide text-amber-400">LMT · {limitPct}%</p>
            <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-amber-500/20 text-amber-200">Smart zľava</span>
          </div>
          <p className="text-[8px] font-semibold text-amber-200/90 tabular-nums">
            −{sk(limitDiscountPct, 1)}% pod spotom · 2,5× ATR
          </p>
          <div className="flex items-center gap-1">
            <p className="text-sm font-bold text-foreground tabular-nums">${sk(limitUsd)}</p>
            <button
              type="button"
              onClick={() => p.onCopy(limitUsd.toFixed(2))}
              className="p-0.5 rounded text-amber-300 hover:bg-foreground/10 active:scale-95"
              aria-label="Kopíruj LMT sumu"
            >
              <Copy className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[9px] text-foreground/70 tabular-nums">≈ {qtyFmt(limitQty)} HYPE</p>
          <p className="text-[8px] uppercase tracking-wide text-muted-foreground font-semibold mt-0.5">Limitná cena nákupu</p>
          <div className="flex items-center gap-1">
            <p className="text-[10px] font-semibold text-amber-200 tabular-nums">{limitPrice > 0 ? priceFmt(limitPrice) : '—'}</p>
            {limitPrice > 0 && (
              <button
                type="button"
                onClick={() => p.onCopy(limitPrice.toFixed(limitPrice >= 1 ? 2 : 4))}
                className="p-0.5 rounded text-amber-300 hover:bg-foreground/10 active:scale-95"
                aria-label="Kopíruj limitnú cenu"
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5 flex-wrap">
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300 tabular-nums">
              S1 {sma200 > 0 ? `${skSigned(s1Pct, 1)}%` : '—'}
            </span>
            <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-rose-500/15 text-rose-300 tabular-nums">
              R1 {swingHigh > 0 ? `${skSigned(r1Pct, 1)}%` : '—'}
            </span>
          </div>
          <p className="text-[8px] uppercase tracking-wide text-muted-foreground font-semibold mt-0.5">Platnosť príkazu: 7 dní</p>
          {lmt.isActive ? (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="flex-1 min-w-0 px-1.5 py-1 rounded text-[9px] font-bold text-center truncate bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/30">
                Aktívne do {lmt.activeUntil ? formatDdMm(lmt.activeUntil) : '—'}
              </span>
              <button
                type="button"
                onClick={lmt.clear}
                className="shrink-0 px-1.5 py-1 rounded text-[9px] font-bold flex items-center gap-0.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:scale-95"
              >
                <X className="w-3 h-3" /> Zrušiť
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleActivateLimit}
              disabled={p.limitBusy || limitUsd <= 0 || limitPrice <= 0}
              className="mt-1.5 w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 bg-amber-500 text-background active:scale-95 disabled:opacity-70"
            >
              {p.limitBusy ? 'Aktivujem…' : <><Clock className="w-3 h-3" /> Aktivovať Limit</>}
            </button>
          )}
        </div>
      </div>

      {/* ── COLLAPSIBLE ANALYTICS ── */}
      <details className="group rounded-lg bg-background/40 ring-1 ring-border/60">
        <summary className="cursor-pointer select-none list-none px-2 py-1.5 flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
          Zobraziť analytické detaily
          <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-2 pb-2 space-y-1">
          <p className="text-[10px] text-foreground/90 leading-snug bg-background/40 rounded px-2 py-1.5 border-l-2 border-primary/60">
            <span className="font-bold text-primary">Prečo limit? </span>
            {bullish ? 'Bull market' : 'Bear market'} · HYPE je {shortBull ? 'nad' : 'pod'} 50D EMA
            {ema50 > 0 ? ` ($${priceFmt(ema50)})` : ''}. Cielime na{' '}
            {limitPrice > 0 ? `$${priceFmt(limitPrice)}` : '—'} (cena teraz {price > 0 ? `$${priceFmt(price)}` : '—'}),
            čo je 2,5× ATR (${sk(atr14, 4)}) pod spotom — chytáme hlbokú volatilitu yield tokenu.
          </p>
          <p className="text-[10px] text-muted-foreground leading-snug">
            <span className="font-semibold text-foreground/80">Split: </span>
            HYPE stav: {skSigned(smaDevPct, 2)}% od 200SMA. Entry: {p.entryReason} ({p.hitCount}/3).
            Status: {`režim ${p.brakeState?.mode ?? 'NORMAL'}`}
            {p.merged ? ` · Merged (${p.mergeReason ?? 'min order rule'})` : ''}.
            HYPE MKT rozdelenie → {marketPct}/{limitPct}.
            Úprava podľa RSI ({rsiVal === null ? (indLoading ? 'Načítavam...' : 'Dáta nedostupné') : sk(rsiVal, 1)}).
            S1 {skSigned(s1Pct, 1)}% · R1 {skSigned(r1Pct, 1)}% → zľava {sk(limitDiscountPct, 1)}%.
          </p>
        </div>
      </details>
    </div>
  );
}
