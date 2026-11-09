import { Activity, Check, Clock, Copy, Loader2, ShoppingCart, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useBtcDailyIndicators } from '@/hooks/useBtcDailyIndicators';
import { BrakeBoostBadge } from './BrakeBoostBadge';
import type { BrakeBoostState } from '@/lib/safetyBrakeBoost';
import { useSevenDayActivation, formatDdMm } from '@/hooks/useSevenDayActivation';
import { applyMinOrderRule } from '@/lib/minOrderRule';
import { formatYieldLine, resolveYieldEntry } from '@/hooks/useLlamaStakingApy';



/** Slovak number formatting — decimal comma. */
function sk(n: number, d = 2): string {
  return n.toFixed(d).replace('.', ',');
}
function skSigned(n: number, d = 2): string {
  return `${n >= 0 ? '+' : ''}${sk(n, d)}`;
}

export interface BtcExecutionCardProps {
  weightLabel: string;
  coinUsd: number;
  reflowAdd: number;
  baseCoinUsd: number;
  heldQty: number;
  price: number;
  sma200: number | null;
  smaDistPct: number | null;
  ema50: number | null;
  rsi14: number | null;
  volatility30d: number;
  momentum30d: number;
  brakeState?: BrakeBoostState | null;
  marketPct: number;
  limitPct: number;
  marketUsd: number;
  limitUsd: number;
  marketPrice: number;
  limitPrice: number;
  limitDiscountPct: number;
  regimeLabel: string;
  regimeReason: string;
  splitReason: string;
  rationale: string;
  syncLabel: string;
  emergencyPaused: boolean;
  marketDone: boolean;
  limitPending: boolean;
  limitFilled: boolean;
  marketBusy: boolean;
  limitBusy: boolean;
  cancelMarketBusy: boolean;
  cancelLimitBusy: boolean;
  marketAddedQty: number;
  limitAddedQty: number;
  onActivateMarket: () => void;
  onActivateLimit: () => void;
  onCancelMarket?: () => void;
  onCancelLimit?: () => void;
  onMarkExpired?: () => void;
  onCopy: (text: string) => void;
}

export function BtcExecutionCard(p: BtcExecutionCardProps) {
  const btcYield = resolveYieldEntry('BTC');
  // Live daily indicators from Binance (200 denných sviec) — majú prednosť pred props.
  const { data: ind, isLoading: indLoading } = useBtcDailyIndicators();

  // 7-dňová aktivácia (localStorage) pre MKT a LMT nezávisle.
  const mkt = useSevenDayActivation('btc_dca_mkt_active_until', { token: 'BTC', leg: 'market' });
  const lmt = useSevenDayActivation('btc_dca_lmt_active_until', { token: 'BTC', leg: 'limit' });
  const mktActive = mkt.isActive || p.marketDone;
  const lmtActive = lmt.isActive || p.limitPending || p.limitFilled;

  const handleActivateMarket = () => { mkt.activate(); p.onActivateMarket(); };
  const handleCancelMarket = () => { mkt.clear(); p.onCancelMarket?.(); };
  const handleActivateLimit = () => { lmt.activate(); p.onActivateLimit(); };
  const handleCancelLimit = () => { lmt.clear(); p.onCancelLimit?.(); };



  const price = ind?.price ?? p.price;
  const sma200 = ind?.sma200 ?? p.sma200;
  const smaDistPct = ind ? ind.smaDistPct : p.smaDistPct;
  const ema50 = ind?.ema50 ?? p.ema50;

  const qtyFmt = (n: number) => sk(n, 6);
  const MomIcon = p.momentum30d >= 0 ? TrendingUp : TrendingDown;

  const bearish = sma200 !== null && price > 0 && price < sma200;
  const shortBull = ema50 !== null && price > 0 && price > ema50;
  const rsiRaw = ind?.rsi14 ?? p.rsi14;
  const rsiVal = typeof rsiRaw === 'number' && Number.isFinite(rsiRaw) ? rsiRaw : null;
  const rsiState = rsiVal === null ? (indLoading ? 'Načítavam...' : 'Dáta nedostupné')
    : rsiVal >= 70 ? 'Prekúpené'
    : rsiVal > 30 ? 'Neutrálne'
    : 'Prepredané';

  // ── SMOOTH DYNAMIC SPLIT ENGINE (continuous, sum always exactly 100 %) ──
  const rsiMod = rsiVal === null ? 0 : 50 - rsiVal;
  const smaDevPct = sma200 !== null && sma200 > 0 && price > 0
    ? ((price - sma200) / sma200) * 100
    : (smaDistPct ?? 0);
  const trendMod = smaDevPct * 0.5;
  const rawMkt = 50 + rsiMod + trendMod;
  const baseMarketPct = Math.round(Math.min(Math.max(rawMkt, 10), 90));

  // ── DYNAMIC TARGET LIMIT PRICE ──
  const limitPrice = price > 0
    ? (ema50 !== null && ema50 > 0 && ema50 < price ? ema50 : price * 0.97)
    : p.limitPrice;
  const limitDiscountPct = price > 0 && limitPrice > 0
    ? ((price - limitPrice) / price) * 100
    : p.limitDiscountPct;

  const marketPrice = price > 0 ? price : p.marketPrice;

  // ── UNIVERSAL $10 RULE (Order Routing) ──
  const routed = applyMinOrderRule({
    symbol: 'BTC',
    totalUsd: p.coinUsd,
    marketPct: baseMarketPct,
    limitPct: 100 - baseMarketPct,
    rsi: rsiVal,
    bullish: sma200 !== null && price > 0 && price > sma200,
  });
  const marketPct = routed.marketPct;
  const limitPct = routed.limitPct;
  const marketUsd = routed.marketUsd;
  const limitUsd = routed.limitUsd;
  // Keep Telegram notifications in sync with live order details.
  mkt.setDetails({ usd: marketUsd, price: marketPrice });
  lmt.setDetails({ usd: limitUsd, price: limitPrice });

  const marketQty = marketPrice > 0 ? marketUsd / marketPrice : 0;
  const limitQty = limitPrice > 0 ? limitUsd / limitPrice : 0;



  const indicators = [
    {
      label: '200D SMA',
      value: indLoading && !sma200 ? 'Načítavam...' : sma200 ? `$${sk(sma200, 0)}` : 'Dáta nedostupné',
      sub: smaDistPct === null ? (indLoading ? 'Načítavam...' : 'Dáta nedostupné') : `${skSigned(smaDistPct, 2)}% odchýlka`,
      tone: smaDistPct === null ? 'text-muted-foreground'
        : smaDistPct >= 0 ? 'text-emerald-300' : 'text-rose-300',
    },
    {
      label: '50D EMA',
      value: indLoading && !ema50 ? 'Načítavam...' : ema50 ? `$${sk(ema50, 0)}` : 'Dáta nedostupné',
      sub: shortBull ? 'Cena nad EMA' : 'Cena pod EMA',
      tone: shortBull ? 'text-emerald-300' : 'text-rose-300',
    },
    {
      label: 'RSI (14D)',
      value: rsiVal === null ? (indLoading ? 'Načítavam...' : 'Dáta nedostupné') : sk(rsiVal, 1),
      sub: rsiState,
      tone: rsiVal === null ? 'text-muted-foreground'
        : rsiVal >= 70 ? 'text-orange-300'
        : rsiVal <= 30 ? 'text-sky-300' : 'text-emerald-300',
    },

    {
      label: 'Volatilita / Trend',
      value: `${sk(p.volatility30d, 2)}%`,
      sub: `Momentum ${skSigned(p.momentum30d, 1)}%`,
      tone: p.momentum30d >= 0 ? 'text-emerald-300' : 'text-rose-300',
    },
    {
      label: 'Brake & Boost',
      value: p.brakeState?.mode ? p.brakeState.mode.replace('_', ' ') : 'NORMAL',
      sub: p.brakeState?.evaluated ? `MKT × ${(p.brakeState.multiplier * 100).toFixed(0)} %` : 'Čakám na indikátory',
      tone: (p.brakeState?.mode === 'STOP' || p.brakeState?.mode === 'REDUCE') ? 'text-orange-300' : 'text-emerald-300',
    },

  ];

  return (
    <div className="rounded-xl bg-background/60 ring-1 ring-border p-3 space-y-3">
      {/* ── HEADER ── */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-full bg-amber-500/15 ring-1 ring-amber-500/40 flex items-center justify-center text-[10px] font-bold text-amber-300">
            ₿
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-bold text-foreground">BTC</span>
              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-primary/15 text-primary ring-1 ring-primary/30">CORE</span>
              <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ring-1 ${
                (p.brakeState?.mode === 'STOP' || p.brakeState?.mode === 'REDUCE')
                  ? 'bg-orange-500/15 text-orange-300 ring-orange-500/40'
                  : 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40'
              }`}>
                {(p.brakeState?.mode === 'STOP' || p.brakeState?.mode === 'REDUCE') ? 'Prehriaty' : 'V norme'}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <Clock className="w-2.5 h-2.5" /> Binance · {p.syncLabel}
            </p>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">Týždenný podiel</p>
          <p className="text-sm font-bold text-foreground tabular-nums">{p.weightLabel}</p>
          <p className="text-[11px] text-primary font-semibold tabular-nums">${sk(p.coinUsd)}</p>
        </div>
      </div>

      {/* Market context tags + live price */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ring-1 ${
            bearish
              ? 'bg-rose-500/10 text-rose-300 ring-rose-500/30'
              : 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
          }`}>
            {bearish ? 'Bear market (cena < SMA 200) 🐻' : 'Bull market (cena > SMA 200) 🐂'}
          </span>
          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ring-1 ${
            shortBull
              ? 'bg-emerald-500/10 text-emerald-300 ring-emerald-500/30'
              : 'bg-amber-500/10 text-amber-300 ring-amber-500/30'
          }`}>
            {shortBull ? 'Krátkodobý Bull ↗' : 'Krátkodobý Bear ↘'}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] tabular-nums text-muted-foreground">
          {indLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
          <span className="text-foreground font-bold">${sk(price)}</span>
          <MomIcon className={`w-3 h-3 ${p.momentum30d >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} />
        </div>

      </div>


      {/* ── INDICATOR GRID ── */}
      <div className="grid grid-cols-2 gap-1.5">
        {indicators.map(ind => (
          <div key={ind.label} className="rounded-lg bg-secondary/30 ring-1 ring-border/70 px-2 py-1.5">
            <p className="text-[8px] uppercase tracking-wide text-muted-foreground font-semibold">{ind.label}</p>
            <p className={`text-xs font-bold tabular-nums break-words ${ind.value === 'Dáta nedostupné' || ind.value === 'Načítavam...' ? 'text-amber-300' : ind.tone}`}>{ind.value}</p>
            <p className="text-[9px] text-muted-foreground tabular-nums">{ind.sub}</p>
          </div>
        ))}
        {btcYield && (
          <div className="rounded-lg bg-secondary/30 ring-1 ring-border/70 px-2 py-1.5">
            <p className="text-[8px] uppercase tracking-wide text-muted-foreground font-semibold">KDE STAKOVAŤ</p>
            <p className="text-xs font-bold tabular-nums text-sky-300">0 %</p>
            <p className="text-[9px] text-muted-foreground break-words">{formatYieldLine(btcYield)}</p>
          </div>
        )}
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
          <span className="text-muted-foreground uppercase tracking-wide">Alokácia ${sk(p.coinUsd)}</span>
          <span className="font-bold text-amber-400">LMT {limitPct}%</span>
        </div>
        <div className="h-2 rounded-full bg-background/60 overflow-hidden flex ring-1 ring-border">
          <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${marketPct}%` }} />
          <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${limitPct}%` }} />
        </div>
        <div className="flex items-center justify-between text-[9px] text-muted-foreground">
          <span>vlastním: <span className="text-foreground font-semibold tabular-nums">{qtyFmt(p.heldQty)} BTC</span></span>
          {p.reflowAdd > 0.01 && (
            <span className="text-emerald-300 tabular-nums">+${sk(p.reflowAdd)} reflow (base ${sk(p.baseCoinUsd)})</span>
          )}
        </div>
      </div>

      {/* ── SIDE-BY-SIDE ACTION CARDS ── */}
      <div className="grid grid-cols-2 gap-1.5">
        {/* MKT */}
        <div className={`rounded-lg p-2 ${p.marketDone ? 'bg-emerald-500/15 ring-1 ring-emerald-500/40' : 'bg-emerald-500/10 ring-1 ring-emerald-500/20'}`}>
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
          <p className="text-[9px] text-foreground/70 tabular-nums">≈ {qtyFmt(marketQty)} BTC</p>
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-[10px] font-semibold text-foreground tabular-nums">
              {marketPrice > 0 ? sk(marketPrice) : '—'}
            </p>
            <span className="text-[8px] text-muted-foreground uppercase">live</span>
          </div>
          {p.marketDone && p.marketAddedQty > 0 && (
            <p className="text-[9px] text-emerald-400 tabular-nums">+{qtyFmt(p.marketAddedQty)} BTC pridané</p>
          )}
          {mktActive ? (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="flex-1 min-w-0 px-1.5 py-1 rounded text-[9px] font-bold text-center truncate bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30">
                Aktívne do {mkt.activeUntil ? formatDdMm(mkt.activeUntil) : '—'}
              </span>
              <button
                type="button"
                onClick={handleCancelMarket}
                disabled={p.cancelMarketBusy}
                className="shrink-0 px-1.5 py-1 rounded text-[9px] font-bold flex items-center gap-0.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:scale-95 disabled:opacity-70"
              >
                <X className="w-3 h-3" /> Zrušiť
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={handleActivateMarket}
                disabled={p.emergencyPaused || p.marketBusy || marketUsd <= 0 || marketPrice <= 0}
                className={`mt-1.5 w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 disabled:opacity-70 bg-emerald-500 text-background`}
              >
                {p.marketBusy ? 'Aktivujem…' : <><ShoppingCart className="w-3 h-3" /> Aktivovať Market</>}
              </button>
            </>
          )}


        </div>

        {/* LMT */}
        <div className={`rounded-lg p-2 ${
          p.limitFilled ? 'bg-emerald-500/15 ring-1 ring-emerald-500/40'
          : p.limitPending ? 'bg-amber-500/15 ring-1 ring-amber-500/40'
          : 'bg-amber-500/10 ring-1 ring-amber-500/20'
        }`}>
          <div className="flex items-center justify-between gap-1">
            <p className="text-[9px] font-bold uppercase tracking-wide text-amber-400">LMT · {limitPct}%</p>
            <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-amber-500/20 text-amber-200">
              Smart zľava −{sk(limitDiscountPct, 1)}%
            </span>
          </div>
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
          <p className="text-[9px] text-foreground/70 tabular-nums">≈ {qtyFmt(limitQty)} BTC</p>
          <div className="flex items-center gap-1 mt-0.5">
            <p className="text-[10px] font-semibold text-amber-200 tabular-nums">
              {limitPrice > 0 ? sk(limitPrice) : '—'}
            </p>
            {limitPrice > 0 && (
              <button
                type="button"
                onClick={() => p.onCopy(limitPrice.toFixed(2))}
                className="p-0.5 rounded text-amber-300 hover:bg-foreground/10 active:scale-95"
                aria-label="Kopíruj limitnú cenu"
              >
                <Copy className="w-3 h-3" />
              </button>
            )}
          </div>
          {p.limitFilled && p.limitAddedQty > 0 && (
            <p className="text-[9px] text-emerald-400 tabular-nums">+{qtyFmt(p.limitAddedQty)} BTC pridané</p>
          )}
          {lmtActive ? (
            <>
              <div className="mt-1.5 flex items-center gap-1">
                <span className="flex-1 min-w-0 px-1.5 py-1 rounded text-[9px] font-bold text-center truncate bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/30">
                  Aktívne do {lmt.activeUntil ? formatDdMm(lmt.activeUntil) : '—'}
                </span>
                <button
                  type="button"
                  onClick={handleCancelLimit}
                  disabled={p.cancelLimitBusy}
                  className="shrink-0 px-1.5 py-1 rounded text-[9px] font-bold flex items-center gap-0.5 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:scale-95 disabled:opacity-70"
                >
                  <X className="w-3 h-3" /> Zrušiť
                </button>
              </div>
              {p.onMarkExpired && (
                <button
                  type="button"
                  onClick={p.onMarkExpired}
                  disabled={p.cancelLimitBusy}
                  className="mt-1 w-full px-1 py-1 rounded text-[9px] font-bold flex items-center justify-center gap-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 active:scale-95 disabled:opacity-70"
                >
                  <Clock className="w-3 h-3" /> Nenaplnil
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              onClick={handleActivateLimit}
              disabled={p.emergencyPaused || p.limitBusy || limitUsd <= 0 || limitPrice <= 0}
              className="mt-1.5 w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 disabled:opacity-70 bg-amber-500 text-background"
            >
              {p.limitBusy ? 'Aktivujem…' : 'Aktivovať Limit'}
            </button>
          )}

        </div>
      </div>

      {/* ── ANALYTICAL FOOTER ── */}
      <div className="space-y-1">
        <p className="text-[10px] text-foreground/90 leading-snug bg-background/40 rounded px-2 py-1.5 border-l-2 border-primary/60">
          <span className="font-bold text-primary">Prečo limit? </span>
          {bearish ? 'Bear market' : 'Bull market'} · BTC je {shortBull ? 'nad' : 'pod'} 50D EMA
          {ema50 ? ` ($${sk(ema50, 2)})` : ''}. Cielime presne na limitnú cenu{' '}
          {limitPrice > 0 ? `$${sk(limitPrice, 2)}` : '—'} (cena teraz {price > 0 ? `$${sk(price, 2)}` : '—'}).
        </p>
        <p className="text-[10px] text-muted-foreground leading-snug">
          <span className="font-semibold text-foreground/80">Split: </span>
          BTC stav: {smaDistPct === null ? 'Dáta nedostupné' : `${skSigned(smaDistPct, 2)}%`} od 200SMA (limit +40 %).
          Status: {`režim ${p.brakeState?.mode ?? 'NORMAL'}`}.
          BTC MKT rozdelenie → {marketPct}/{limitPct}.
          Úprava podľa RSI ({rsiVal === null ? (indLoading ? 'Načítavam...' : 'Dáta nedostupné') : sk(rsiVal, 1)}).
          Vol {sk(p.volatility30d, 2)}% + trend {skSigned(p.momentum30d, 1)}% → úprava zľavy na {sk(limitDiscountPct, 1)}%.
        </p>
      </div>

    </div>
  );
}
