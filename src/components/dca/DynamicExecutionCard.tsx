import { useEffect, useMemo, useState } from 'react';
import { Zap, TrendingUp, TrendingDown, Activity, Copy, Info, Check, Clock, X, Wallet, Banknote, Coins, Pencil, AlertTriangle, Ban, ShoppingCart } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { setPendingStake, navigateToTab } from '@/lib/pendingActions';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useLimitFillRates } from '@/hooks/useLimitFillRates';
import { useProfitReservoir, deductReservoir } from '@/lib/profitReservoir';
import {
  calcUnifiedExecution,
  fixedExecution,
  type CoinKey,
} from '@/lib/dynamicExecution';
import { formatPrice, formatLimitPrice, formatUsd, type PriceData } from '@/lib/crypto';

// BTC funding split based on Final Score (Profit Reservoir vs Regular Capital)
function btcReservoirPct(score: number): number {
  if (score <= 30) return 70;   // Deep Value
  if (score <= 60) return 50;   // Neutral
  return 15;                    // Overheated
}
function btcBandLabel(score: number): string {
  if (score <= 30) return 'Deep Value';
  if (score <= 60) return 'Neutral';
  return 'Overheated';
}


function getMondayWeek(d = new Date()): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

interface Props {
  score: number;
  prices: PriceData | undefined;
  /** Týždenná alokácia v USD (z Final Score × kapitál). Rozdelí sa medzi BTC/ETH/SOL. */
  investableUsd: number;
}

const COIN_PRICE_KEY: Record<CoinKey, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
};

// Cieľové portfólio váhy: BTC 64% / ETH 25% / SOL 11% (bez HYPE).
const TARGET_WEIGHTS: Record<CoinKey, number> = {
  btc: 0.64,
  eth: 0.25,
  sol: 0.11,
};

const COIN_LABEL_WEIGHT: Record<CoinKey, string> = {
  btc: '64%',
  eth: '25%',
  sol: '11%',
};

/**
 * Plne automatický engine.
 * - Market% / Limit% sú **rovnaké pre všetky tokeny** (riadi ich Score + agregované 14D momentum).
 * - Limit Distance % je **per-coin** (riadi ho 14D volatilita daného tokenu).
 */
export function DynamicExecutionCard({ score, prices, investableUsd }: Props) {
  const { data: metrics, isLoading } = usePerCoinMetrics();
  const { data: settings } = useAppSettings();
  const { data: fillRates } = useLimitFillRates();
  const reservoir = useProfitReservoir();
  const qc = useQueryClient();
  const week = useMemo(() => getMondayWeek(), []);
  const [busy, setBusy] = useState<string | null>(null);

  // === Unified slider: LIMIT -1 % (left) vs LIMIT DYNAMIC (right), per všetky tokeny.
  const [limit1Pct, setLimit1Pct] = useState<number>(() => {
    try {
      const raw = localStorage.getItem('limit-split-v1');
      const v = raw ? Number(JSON.parse(raw)) : 50;
      return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 50;
    } catch { return 50; }
  });
  useEffect(() => {
    try { localStorage.setItem('limit-split-v1', JSON.stringify(limit1Pct)); } catch { /* noop */ }
  }, [limit1Pct]);
  const limitDynPct = 100 - limit1Pct;

  // === Per-coin/per-mode manually edited prices (override oracle baseline)
  type Mode = 'limit1' | 'dynamic';
  const [editedPrices, setEditedPrices] = useState<Record<CoinKey, Partial<Record<Mode, number>>>>(() => {
    try {
      const raw = localStorage.getItem('dca-target-prices-v1');
      if (!raw) return { btc: {}, eth: {}, sol: {} };
      const p = JSON.parse(raw);
      return { btc: p.btc ?? {}, eth: p.eth ?? {}, sol: p.sol ?? {} };
    } catch { return { btc: {}, eth: {}, sol: {} }; }
  });
  useEffect(() => {
    try { localStorage.setItem('dca-target-prices-v1', JSON.stringify(editedPrices)); } catch { /* noop */ }
  }, [editedPrices]);

  // Day 7 burgundy modal — "Nepadlo · Presunúť kapitál"
  const [day7Coin, setDay7Coin] = useState<CoinKey | null>(null);


  const { data: executionsRows } = useQuery({
    queryKey: ['dca_executions', week],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dca_executions')
        .select('*')
        .eq('week_number', week);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const execStatus = useMemo(() => {
    const m = new Map<string, { market?: any; limit?: any }>();
    for (const r of (executionsRows ?? []) as any[]) {
      const cur = m.get(r.coin) ?? {};
      if (r.kind === 'market') cur.market = r;
      else cur.limit = r;
      m.set(r.coin, cur);
    }
    return m;
  }, [executionsRows]);

  const handleExecute = async (
    coin: CoinKey,
    kind: 'market'|'limit',
    amount: number,
    price: number,
    fromReservoir = 0,
  ) => {
    const key = `${coin}-${kind}`;
    setBusy(key);
    try {
      const { error } = await supabase.functions.invoke('dca-execute', {
        body: { coin, kind, amount_usd: amount, target_price: price },
      });
      if (error) throw error;
      if (coin === 'btc' && fromReservoir > 0) {
        deductReservoir(
          fromReservoir,
          `BTC ${kind.toUpperCase()} · ${formatUsd(amount)} (rezervoár ${formatUsd(fromReservoir)})`,
        );
      }
      toast.success(kind === 'market' ? `${coin.toUpperCase()} market vykonaný ✓` : `${coin.toUpperCase()} limit zadaný ⏳`);
      qc.invalidateQueries({ queryKey: ['dca_executions', week] });
      qc.invalidateQueries({ queryKey: ['app_settings'] });
    } catch (e) {
      toast.error('Chyba: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };


  const handleCancelLimit = async (id: string, coin: string) => {
    if (!confirm(`Zrušiť limit objednávku ${coin}?`)) return;
    setBusy(`${coin.toLowerCase()}-limit`);
    try {
      const { error } = await supabase.from('dca_executions').update({ status: 'CANCELLED' }).eq('id', id);
      if (error) throw error;
      toast.success(`${coin} limit zrušený`);
      qc.invalidateQueries({ queryKey: ['dca_executions', week] });
    } catch (e) {
      toast.error('Chyba: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleMarkExpired = async (id: string, coin: string) => {
    if (!confirm(`Označiť ${coin} limit ako nenaplnený (EXPIRED)?`)) return;
    setBusy(`${coin.toLowerCase()}-limit`);
    try {
      const { error } = await supabase
        .from('dca_executions')
        .update({ status: 'EXPIRED', filled_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      toast.success(`${coin} označený ako nenaplnený`);
      qc.invalidateQueries({ queryKey: ['dca_executions', week] });
      qc.invalidateQueries({ queryKey: ['limit-fill-rates'] });
    } catch (e) {
      toast.error('Chyba: ' + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };


  const result = useMemo(() => {
    if (!metrics) {
      const fallback = {
        btc: fixedExecution('btc'),
        eth: fixedExecution('eth'),
        sol: fixedExecution('sol'),
      };
      return {
        executions: fallback,
        sharedMarketPct: 60,
        sharedLimitPct: 40,
        sharedMomentumAvg: 0,
        sharedMomentumAdj: 0,
        base: { marketPct: 60, limitPct: 40, distance: -4 },
      };
    }
    const raw = calcUnifiedExecution(score, metrics, fillRates ?? { eth: 0.5, sol: 0.5 });

    // MONEY MODE REGIME OVERRIDE — re-shapes Market/Limit split for extremes
    //  CAPITULATION (score ≤ 25): 30 % Market / 70 % Limit, limits 2–4 % below spot
    //  PARABOLIC    (score ≥ 80): 20 % Market / 80 % Limit, defensive deep limits (-5 to -8 %)
    //  NEUTRAL: unchanged engine output
    if (score <= 25 || score >= 80) {
      const capit = score <= 25;
      const newMarket = capit ? 30 : 20;
      const newLimit  = 100 - newMarket;
      const minDist   = capit ? -4 : -8;
      const maxDist   = capit ? -2 : -5;
      const clampDist = (d: number) => Math.max(minDist, Math.min(maxDist, d));
      const coins: CoinKey[] = ['btc', 'eth', 'sol'];
      const overridden = { ...raw.executions } as typeof raw.executions;
      for (const c of coins) {
        const cur = overridden[c];
        const dist = clampDist(cur.limitDistancePct);
        overridden[c] = {
          ...cur,
          marketPct: newMarket,
          limitPct: newLimit,
          limitDistancePct: Math.round(dist * 10) / 10,
        };
      }
      return {
        ...raw,
        executions: overridden,
        sharedMarketPct: newMarket,
        sharedLimitPct: newLimit,
      };
    }
    return raw;
  }, [metrics, score, fillRates]);

  const { executions, sharedMarketPct, sharedLimitPct, sharedMomentumAvg, sharedMomentumAdj, base } = result;
  const coins: CoinKey[] = ['btc', 'eth', 'sol'];

  // MONEY MODE regime tag for "why" text
  const moneyMode: 'CAPITULATION' | 'NEUTRAL' | 'PARABOLIC' =
    score <= 25 ? 'CAPITULATION' : score >= 80 ? 'PARABOLIC' : 'NEUTRAL';

  // "Prečo Market/Limit?" — vychádza zo skóre a momenta
  const splitReason = useMemo(() => {
    if (moneyMode === 'CAPITULATION') {
      return `⚡ MONEY MODE CAPITULATION (score ${score}) → presúvam váhu do staggered Limitov 2–4 % pod spotom (chytám likvidačné knôty). Override: 30/70.`;
    }
    if (moneyMode === 'PARABOLIC') {
      return `⚡ MONEY MODE PARABOLIC (score ${score}) → škrtím Market expozíciu, defenzívne hlboké Limity 5–8 % pod spotom. Override: 20/80.`;
    }
    const scorePart =
      score <= 45 ? `Skóre ${score} → mierne lacný, base ${base.marketPct}/${base.limitPct}.`
      : score <= 60 ? `Skóre ${score} → neutrálny, base ${base.marketPct}/${base.limitPct}.`
      : `Skóre ${score} → drahší, base ${base.marketPct}/${base.limitPct} (viac limit).`;
    const momPart =
      sharedMomentumAdj === 0
        ? `Priemerné 14D momentum ${sharedMomentumAvg.toFixed(1)}% — bez úpravy.`
        : sharedMomentumAvg > 0
        ? `Priemerné 14D momentum +${sharedMomentumAvg.toFixed(1)}% (uptrend) → +${sharedMomentumAdj}% k market% (chyť trend).`
        : `Priemerné 14D momentum ${sharedMomentumAvg.toFixed(1)}% (downtrend) → +${sharedMomentumAdj}% k market% (defenzívne nakupuj pokles).`;
    return `${scorePart} ${momPart}`;
  }, [score, base, sharedMomentumAvg, sharedMomentumAdj, moneyMode]);

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Skopírované');
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">Dynamic Execution Engine</h3>
        </div>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-primary/15 text-primary">
          AUTO
        </span>
      </div>

      {isLoading && (
        <p className="text-[11px] text-muted-foreground">Načítavam 14D volatilitu a momentum…</p>
      )}

      {/* GLOBÁLNY SPLIT — Limit -1 % vs Limit Dynamic (užívateľsky riadený, všetky tokeny) */}
      <div className="bg-secondary/40 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Limit -1 % / Limit Dynamic split (všetky tokeny)
          </p>
          <span className="text-[10px] tabular-nums font-bold text-foreground">
            L-1 {Math.round(limit1Pct)} / DYN {Math.round(limitDynPct)}
          </span>
        </div>
        <div className="h-2.5 rounded-full bg-background/50 overflow-hidden flex">
          <div className="h-full bg-emerald-500" style={{ width: `${limit1Pct}%` }} />
          <div className="h-full bg-primary" style={{ width: `${limitDynPct}%` }} />
        </div>
        <Slider
          value={[limit1Pct]}
          min={0}
          max={100}
          step={5}
          onValueChange={(v) => setLimit1Pct(v[0] ?? 50)}
          aria-label="Limit -1 % / Limit Dynamic split"
        />
        <div className="flex items-start gap-1.5 pt-1 border-t border-border">
          <Info className="w-3 h-3 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-[10px] text-foreground/80 leading-snug">
            <span className="font-semibold">Rozdelenie týždenného DCA rozpočtu: </span>
            Ľavá strana ide do <span className="text-emerald-300 font-semibold">Limit -1 %</span> (oracle cena − 1.0 %),
            pravá do <span className="text-primary font-semibold">Limit Dynamic</span> (per-coin volatilita).
            {' '}{splitReason}
          </p>
        </div>
      </div>

      {/* PER-COIN: alokácia USD → Market / Limit + distance */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
            Rozdelenie alokácie podľa tokenov
          </p>
          <span className="text-[10px] tabular-nums text-foreground font-semibold">
            Σ ${investableUsd.toFixed(0)}
          </span>
        </div>
        {coins.map(c => {
          const e = executions[c];
          const price = prices?.[COIN_PRICE_KEY[c]]?.usd ?? 0;
          const symU = e.symbol.toUpperCase();
          const st = execStatus.get(symU);
          const mDone = st?.market?.status === 'EXECUTED';
          const lFilled = st?.limit?.status === 'FILLED';
          const lPending = st?.limit?.status === 'PENDING';
          // Keď je limit zadaný (PENDING) alebo naplnený → cena/suma sa zamknú a nemenia sa kým ho nezrušíš
          const lockedLimitPrice = (lPending || lFilled) ? Number(st?.limit?.target_price ?? 0) : 0;
          const lockedLimitUsd = (lPending || lFilled) ? Number(st?.limit?.amount_usd ?? 0) : 0;
          const limitPrice = lockedLimitPrice > 0 ? lockedLimitPrice : price * (1 + e.limitDistancePct / 100);
          const MomIcon = e.momentum30d >= 0 ? TrendingUp : TrendingDown;
          const momColor = e.momentum30d >= 0 ? 'text-emerald-400' : 'text-rose-400';

          // Suma pre tento token podľa cieľovej váhy v portfóliu
          const coinUsd = investableUsd * TARGET_WEIGHTS[c];
          const marketUsd = coinUsd * (e.marketPct / 100);
          const limitUsd = lockedLimitUsd > 0 ? lockedLimitUsd : coinUsd * (e.limitPct / 100);

          // BTC-only funding split: Profit Reservoir vs Regular Capital (dynamic by Final Score)
          const isBtc = c === 'btc';
          const btcResPctTarget = isBtc ? btcReservoirPct(score) : 0;
          const btcDesiredFromReservoir = isBtc ? (coinUsd * btcResPctTarget) / 100 : 0;
          const btcFromReservoir = isBtc ? Math.min(btcDesiredFromReservoir, Math.max(0, reservoir.stable)) : 0;
          const btcFromRegular = isBtc ? Math.max(0, coinUsd - btcFromReservoir) : 0;
          const btcReservoirShare = isBtc && coinUsd > 0 ? btcFromReservoir / coinUsd : 0;
          const btcReservoirCapped = isBtc && btcDesiredFromReservoir > btcFromReservoir + 0.005;


          const mBg = mDone ? 'bg-emerald-500/15 ring-1 ring-emerald-500/40' : 'bg-primary/10';
          const lBg = lFilled
            ? 'bg-emerald-500/15 ring-1 ring-emerald-500/40'
            : lPending
            ? 'bg-amber-500/15 ring-1 ring-amber-500/40'
            : 'bg-emerald-500/10';
          const mBusy = busy === `${c}-market`;
          const lBusy = busy === `${c}-limit`;

          // Aktuálne držané tokeny
          const heldQty = Number((settings?.manual_holdings as any)?.[c] ?? 0);
          // Množstvo tokenov pre market/limit objednávku
          const marketQty = price > 0 ? marketUsd / price : 0;
          const limitQty = limitPrice > 0 ? limitUsd / limitPrice : 0;
          // Skutočne pridané z executions (ak vykonané/naplnené)
          const mAddedQty = mDone ? Number(st?.market?.quantity ?? 0) : 0;
          const lAddedQty = lFilled ? Number(st?.limit?.quantity ?? 0) : 0;
          const qtyFmt = (n: number) => c === 'btc' ? n.toFixed(6) : n.toFixed(4);
          // Zamknuté % distancie pri pendingu (na zobrazenie)
          const displayLimitDistPct = lockedLimitPrice > 0 && price > 0
            ? ((lockedLimitPrice / price) - 1) * 100
            : e.limitDistancePct;

          return (
            <div key={c} className="bg-secondary/40 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs font-bold text-foreground">{e.symbol}</span>
                  <span className="text-[9px] text-muted-foreground">váha {COIN_LABEL_WEIGHT[c]}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] tabular-nums">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Activity className="w-3 h-3" /> vol {e.volatility30d.toFixed(2)}%
                  </span>
                  <span className={`flex items-center gap-1 ${momColor}`}>
                    <MomIcon className="w-3 h-3" />
                    {e.momentum30d >= 0 ? '+' : ''}{e.momentum30d.toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Suma pre token + držané */}
              <div className="flex items-center justify-between bg-background/40 rounded px-2 py-1.5">
                <div>
                  <p className="text-[10px] text-muted-foreground">Alokácia tokenu</p>
                  <p className="text-[9px] text-muted-foreground">vlastním: <span className="text-foreground tabular-nums font-semibold">{qtyFmt(heldQty)} {e.symbol}</span></p>
                </div>
                <p className="text-sm font-bold text-foreground tabular-nums">
                  ${coinUsd.toFixed(2)}
                </p>
              </div>

              {/* BTC funding breakdown — Profit Reservoir vs Regular Capital */}
              {isBtc && coinUsd > 0 && (
                <div className="bg-background/40 rounded px-2 py-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Zdroj financovania BTC
                    </p>
                    <span className="text-[9px] text-muted-foreground">
                      Score {score} · {btcBandLabel(score)} · cieľ {btcResPctTarget}%
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-1">
                      <div className="flex items-center gap-1 text-[9px] text-emerald-300">
                        <Wallet className="w-3 h-3" /> Profit Reservoir
                      </div>
                      <p className="text-xs font-bold tabular-nums text-emerald-200">
                        {formatUsd(btcFromReservoir)}
                      </p>
                      <p className="text-[9px] text-muted-foreground tabular-nums">
                        dostupné {formatUsd(reservoir.stable)}
                      </p>
                    </div>
                    <div className="rounded bg-secondary/60 border border-border px-2 py-1">
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <Banknote className="w-3 h-3" /> Regular Capital
                      </div>
                      <p className="text-xs font-bold tabular-nums text-foreground">
                        {formatUsd(btcFromRegular)}
                      </p>
                      <p className="text-[9px] text-muted-foreground tabular-nums">
                        {(btcReservoirShare * 100).toFixed(0)}% / {(100 - btcReservoirShare * 100).toFixed(0)}%
                      </p>
                    </div>
                  </div>
                  {btcReservoirCapped && reservoir.stable > 0 && (
                    <p className="text-[9px] text-amber-400 leading-snug">
                      ⚠ Rezervoár nemá dosť — strop nastavený na dostupný zostatok, rozdiel sa presunie do Regular Capital.
                    </p>
                  )}
                </div>
              )}

              {/* Market / Limit rozdelenie sumy */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className={`rounded p-2 ${mBg}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-primary font-semibold">MARKET {e.marketPct}%</p>

                    <button
                      onClick={() => copy(marketUsd.toFixed(2))}
                      className="p-0.5 rounded text-primary hover:bg-primary/20 active:scale-95"
                      aria-label={`Kopíruj market USD ${e.symbol}`}
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-foreground tabular-nums">
                    ${marketUsd.toFixed(2)}
                  </p>
                  <p className="text-[9px] text-foreground/70 tabular-nums">
                    ≈ {qtyFmt(marketQty)} {e.symbol}
                  </p>
                  {mDone && mAddedQty > 0 && (
                    <p className="text-[9px] text-emerald-400 tabular-nums">
                      +{qtyFmt(mAddedQty)} {e.symbol} pridané
                    </p>
                  )}
                  <p className="text-[9px] text-muted-foreground">teraz, za trhovú cenu</p>
                  <button
                    onClick={() => !mDone && handleExecute(c, 'market', marketUsd, price, isBtc ? marketUsd * btcReservoirShare : 0)}
                    disabled={mDone || mBusy || marketUsd <= 0 || price <= 0}
                    className={`mt-1.5 w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 disabled:opacity-70 ${
                      mDone ? 'bg-emerald-500 text-background' : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    {mDone ? <><Check className="w-3 h-3" /> Vykonané</> : (mBusy ? '…' : 'Vykonať')}
                  </button>
                </div>
                {(() => {
                  // Live progress: how close current price is to triggering the limit
                  const liveDistPct = price > 0 && limitPrice > 0 ? ((price - limitPrice) / price) * 100 : 0;
                  const triggered = price > 0 && price <= limitPrice;
                  const initialBand = Math.max(0.1, Math.abs(displayLimitDistPct));
                  const progress = triggered
                    ? 100
                    : Math.max(0, Math.min(100, (1 - liveDistPct / initialBand) * 100));
                  const barColor = triggered
                    ? 'bg-emerald-500'
                    : progress >= 60
                    ? 'bg-amber-400'
                    : 'bg-emerald-500/40';
                  const cardBg = triggered
                    ? 'bg-emerald-500/20 ring-1 ring-emerald-500/50'
                    : lBg;
                  return (
                    <div className={`rounded p-2 relative overflow-hidden ${cardBg}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] text-emerald-400 font-semibold">LIMIT {e.limitPct}%</p>
                        <button
                          onClick={() => copy(limitUsd.toFixed(2))}
                          className="p-0.5 rounded text-emerald-400 hover:bg-emerald-500/20 active:scale-95"
                          aria-label={`Kopíruj limit USD ${e.symbol}`}
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-sm font-bold text-foreground tabular-nums">
                        ${limitUsd.toFixed(2)}
                      </p>
                      <p className="text-[9px] text-foreground/70 tabular-nums">
                        ≈ {qtyFmt(limitQty)} {e.symbol}
                      </p>
                      {lFilled && lAddedQty > 0 && (
                        <p className="text-[9px] text-emerald-400 tabular-nums">
                          +{qtyFmt(lAddedQty)} {e.symbol} pridané
                        </p>
                      )}
                      <p className="text-[9px] text-muted-foreground">
                        limit @ {displayLimitDistPct.toFixed(1)}%
                        {lockedLimitPrice > 0 && <span className="ml-1 text-amber-400">🔒 ${formatLimitPrice(lockedLimitPrice)}</span>}
                      </p>
                      <button
                        onClick={() => !lFilled && !lPending && handleExecute(c, 'limit', limitUsd, limitPrice, isBtc ? limitUsd * btcReservoirShare : 0)}
                        disabled={lFilled || lPending || lBusy || limitUsd <= 0 || price <= 0}
                        className={`mt-1.5 w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 disabled:opacity-70 ${
                          lFilled ? 'bg-emerald-500 text-background'
                          : lPending ? (triggered ? 'bg-emerald-500 text-background' : 'bg-amber-500 text-background')
                          : (triggered ? 'bg-emerald-500 text-background' : 'bg-emerald-500/80 text-background')
                        }`}
                      >
                        {lFilled ? <><Check className="w-3 h-3" /> Naplnené</>
                          : lPending ? <><Clock className="w-3 h-3" /> {triggered ? 'Pripravené' : 'Sleduje'}</>
                          : (lBusy ? '…' : (triggered ? 'Pripravené — zadať' : 'Zadať limit'))}
                      </button>
                      {lPending && st?.limit?.id && (
                        <div className="mt-1 grid grid-cols-2 gap-1">
                          <button
                            onClick={() => handleMarkExpired(st.limit.id, symU)}
                            disabled={lBusy}
                            className="px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 active:scale-95 disabled:opacity-70"
                            title="Limit sa nenaplnil — zarátaj do fill-rate"
                          >
                            <Clock className="w-3 h-3" /> Nenaplnil sa
                          </button>
                          <button
                            onClick={() => handleCancelLimit(st.limit.id, symU)}
                            disabled={lBusy}
                            className="px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:scale-95 disabled:opacity-70"
                          >
                            <X className="w-3 h-3" /> Zrušiť
                          </button>
                        </div>
                      )}
                      {/* Progress bar: fills as market price approaches limit */}
                      {price > 0 && !lFilled && (
                        <div className="mt-1.5 h-1 rounded-full bg-background/60 overflow-hidden">
                          <div
                            className={`h-full ${barColor} transition-all duration-500`}
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* 💰 Presunúť do STAKE — len pre ETH/SOL po úspešnej akumulácii */}
              {!isBtc && (mAddedQty + lAddedQty) > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const totalQty = mAddedQty + lAddedQty;
                    setPendingStake({
                      symbol: symU as 'ETH' | 'SOL',
                      amount: Number(totalQty.toFixed(8)),
                      source: 'dca',
                    });
                    navigateToTab('staking');
                    toast.success(`Pripravené na stake: ${qtyFmt(totalQty)} ${e.symbol}`);
                  }}
                  className="w-full px-2 py-1.5 rounded text-[10px] font-bold flex items-center justify-center gap-1.5 bg-primary/15 text-primary hover:bg-primary/25 ring-1 ring-primary/40 active:scale-95"
                >
                  <Coins className="w-3 h-3" />
                  💰 Presunúť do STAKE ({qtyFmt(mAddedQty + lAddedQty)} {e.symbol})
                </button>
              )}


              {/* Limit cena (kopírovateľná) + live market distance */}
              <div className="bg-background/40 rounded px-2 py-1.5 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">Limit cena ({e.limitDistancePct.toFixed(1)}%)</p>
                    <p className="text-sm font-semibold text-foreground tabular-nums">
                      {price > 0 ? formatLimitPrice(limitPrice) : '—'}
                    </p>
                  </div>
                  <button
                    onClick={() => price > 0 && copy(limitPrice.toFixed(4))}
                    disabled={price <= 0}
                    className="p-1.5 rounded bg-primary/10 text-primary hover:bg-primary/20 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label={`Kopíruj limit cenu ${e.symbol}`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Live market price + distance tracker */}
                {price > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] text-muted-foreground tabular-nums">
                      Trh: {formatLimitPrice(price)}
                    </span>
                    {(() => {
                      const distancePct = ((price - limitPrice) / price) * 100;
                      const isTriggered = price <= limitPrice;
                      const isClose = !isTriggered && distancePct <= 8 && distancePct >= 0.1;
                      const badgeColor = isTriggered
                        ? 'bg-gain/15 text-gain border-gain/30'
                        : isClose
                        ? 'bg-warning/15 text-warning border-warning/30'
                        : 'bg-muted/40 text-muted-foreground border-border';
                      const label = isTriggered
                        ? 'Pripravené'
                        : isClose
                        ? `-${distancePct.toFixed(2)}%`
                        : `-${distancePct.toFixed(2)}%`;
                      return (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded border tabular-nums ${badgeColor}`}>
                          {label}
                        </span>
                      );
                    })()}
                  </div>
                )}
              </div>



              {/* Multiplier breakdown — len pre ETH/SOL */}
              {e.multiplierBreakdown && (
                <div className="bg-background/40 rounded px-2 py-1.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Final {e.symbol} Limit (BTC × mult)
                    </p>
                    <span className="text-[10px] tabular-nums font-bold text-foreground">
                      ×{e.multiplierBreakdown.total.toFixed(3)}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 text-[9px] tabular-nums">
                    <div className="bg-secondary/40 rounded px-1.5 py-1">
                      <p className="text-muted-foreground">Base (T={e.multiplierBreakdown.T})</p>
                      <p className="text-foreground font-semibold">×{e.multiplierBreakdown.base.toFixed(2)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded px-1.5 py-1">
                      <p className="text-muted-foreground">Vol (VR {e.multiplierBreakdown.VR.toFixed(2)})</p>
                      <p className="text-foreground font-semibold">×{e.multiplierBreakdown.vol.toFixed(3)}</p>
                    </div>
                    <div className="bg-secondary/40 rounded px-1.5 py-1">
                      <p className="text-muted-foreground">Fb ({(e.multiplierBreakdown.fill * 100).toFixed(0)}%)</p>
                      <p className="text-foreground font-semibold">×{e.multiplierBreakdown.fb.toFixed(3)}</p>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-muted-foreground leading-snug">
                <span className="font-semibold text-foreground/80">Prečo? </span>
                {e.rationale}
              </p>
            </div>
          );
        })}
      </div>

      {/* Day 7 modal — Nepadlo · Presunúť kapitál */}
      {day7Coin && (() => {
        const c = day7Coin;
        const symU = c.toUpperCase();
        const coinUsd = investableUsd * TARGET_WEIGHTS[c];
        const l1Usd = coinUsd * (limit1Pct / 100);
        const spot = prices?.[COIN_PRICE_KEY[c]]?.usd ?? 0;
        const sObj = execStatus.get(symU);
        const pendingLimitId: string | undefined = sObj?.limit?.status === 'PENDING' ? sObj.limit.id : undefined;
        const isBtc = c === 'btc';
        const btcResShareNow = isBtc && coinUsd > 0
          ? Math.min((coinUsd * btcReservoirPct(score)) / 100, Math.max(0, reservoir.stable)) / coinUsd
          : 0;

        const runMigrateToMarket = async () => {
          try {
            if (pendingLimitId) {
              await supabase.from('dca_executions').update({ status: 'CANCELLED' }).eq('id', pendingLimitId);
            }
            // Wipe Limit Dynamic local override + reset Limit -1 % local override
            setEditedPrices(prev => ({ ...prev, [c]: {} }));
            await handleExecute(c, 'market', l1Usd, spot, isBtc ? l1Usd * btcResShareNow : 0);
            toast.success(`${symU} — Limit Dynamic zrušený, Limit -1 % presunutý do Market (${formatUsd(l1Usd)})`);
          } catch (err) {
            toast.error('Chyba: ' + (err as Error).message);
          } finally {
            setDay7Coin(null);
          }
        };
        const runCancelOnly = async () => {
          try {
            if (pendingLimitId) {
              await supabase.from('dca_executions').update({ status: 'CANCELLED' }).eq('id', pendingLimitId);
            }
            setEditedPrices(prev => ({ ...prev, [c]: {} }));
            qc.invalidateQueries({ queryKey: ['dca_executions', week] });
            toast.success(`${symU} — Limit Dynamic zrušený a vymazaný`);
          } finally {
            setDay7Coin(null);
          }
        };

        return (
          <div
            className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
            onClick={() => setDay7Coin(null)}
          >
            <div
              className="w-full max-w-md glass-card p-5 space-y-4"
              onClick={(ev) => ev.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Deň 7 · New Market</p>
                  <h2 className="text-base font-bold text-foreground">Nepadlo — Presunúť kapitál ({symU})</h2>
                </div>
                <button
                  onClick={() => setDay7Coin(null)}
                  className="p-1 rounded-md hover:bg-secondary"
                  aria-label="Zatvoriť"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>

              <div className="bg-secondary/40 rounded-lg p-3 space-y-1.5 text-[11px] text-foreground/90 leading-relaxed">
                <p>
                  <span className="font-semibold text-rose-300">Limit Dynamic</span> bude úplne zrušený a vymazaný
                  (žiadny presun rozpočtu).
                </p>
                <p>
                  <span className="font-semibold text-orange-300">Limit -1 %</span> alokácia
                  ({formatUsd(l1Usd)}) sa zruší a celá pretečie do okamžitej Market Buy položky nižšie.
                </p>
              </div>

              <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-orange-200 font-semibold">Market Buy</p>
                <p className="text-base font-bold text-foreground tabular-nums">
                  {formatUsd(l1Usd)} {symU} @ spot {spot > 0 ? formatLimitPrice(spot) : '—'}
                </p>
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  ≈ {spot > 0 ? (l1Usd / spot).toFixed(c === 'btc' ? 6 : 4) : '—'} {symU}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={runCancelOnly}
                  className="w-full px-3 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-rose-500/15 text-rose-300 border border-rose-500/40 hover:bg-rose-500/25 active:scale-[0.98]"
                >
                  <Ban className="w-3.5 h-3.5" /> Zrušiť starý čakajúci limit
                </button>
                <button
                  type="button"
                  onClick={runMigrateToMarket}
                  disabled={l1Usd <= 0 || spot <= 0}
                  className="w-full px-3 py-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-2 bg-orange-500/20 text-orange-200 border border-orange-500/50 hover:bg-orange-500/30 active:scale-[0.98] disabled:opacity-50"
                >
                  <ShoppingCart className="w-3.5 h-3.5" /> Odoslať New Market nákup ({formatUsd(l1Usd)})
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
