import { useMemo, useState } from 'react';
import { Zap, TrendingUp, TrendingDown, Activity, Copy, Info, Check, Clock, X, Wallet, Banknote, Coins, Pencil, AlertTriangle, ShoppingCart, Gauge } from 'lucide-react';
import { setPendingStake, navigateToTab } from '@/lib/pendingActions';
import { toast } from 'sonner';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useLimitFillRates } from '@/hooks/useLimitFillRates';
import { useFearGreed } from '@/hooks/usePrices';
import { useMarketEngine } from '@/contexts/MarketContext';
import { useMarketData } from '@/hooks/useMarketData';

import { useProfitReservoir, deductReservoir } from '@/lib/profitReservoir';
import { useEmergencyPause } from '@/lib/emergencyPause';
import {
  calcUnifiedExecution,
  fixedExecution,
  type CoinKey,
} from '@/lib/dynamicExecution';
import { formatLimitPrice, formatUsd, type PriceData } from '@/lib/crypto';

// BTC funding split based on Final Score (Profit Reservoir vs Regular Capital)
function btcReservoirPct(score: number): number {
  if (score <= 30) return 70;
  if (score <= 60) return 50;
  return 15;
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

// Cieľové portfólio váhy sú riadené Master Dynamic Allocation engine (Core ≥ 50 %).
// Zdroj pravdy: useMarketEngine().engine.perToken.

type Mode = 'market' | 'dynamic';

/**
 * Two-Tier Dynamic Allocation Matrix:
 *  - Tier 1: Cross-asset split — riadený plne Master Dynamic Allocation engine (žiadne fixné cieľové váhy).
 *  - Tier 2: Execution split per coin — MARKET vs LIMIT DYNAMIC, riadené
 *    Final Score, per-coin volatilitou/momentom a Fear & Greed indexom.
 */

export function DynamicExecutionCard({ score, prices, investableUsd }: Props) {
  const { data: metrics, isLoading } = usePerCoinMetrics();
  const { data: settings } = useAppSettings();
  const { data: fillRates } = useLimitFillRates();
  const { data: fg } = useFearGreed();
  const { engine } = useMarketEngine();
  const { data: market } = useMarketData();
  const [emergencyPaused] = useEmergencyPause();
  const syncLabel = (() => {
    const d = market?.generatedAt ? new Date(market.generatedAt) : null;
    return d && !Number.isNaN(d.getTime())
      ? d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })
      : '—';
  })();

  const tokenWeights: Record<CoinKey, number> = {
    btc: (engine.perToken.btc ?? 0) / 100,
    eth: (engine.perToken.eth ?? 0) / 100,
    sol: (engine.perToken.sol ?? 0) / 100,
  };
  const tokenLabel: Record<CoinKey, string> = {
    btc: `${engine.perToken.btc}%`,
    eth: `${engine.perToken.eth}%`,
    sol: `${engine.perToken.sol}%`,
  };
  const fgValue = typeof fg?.value === 'number' ? fg.value : 50;
  const fgLabel = fg?.classification ?? 'Neutral';
  const reservoir = useProfitReservoir();
  const qc = useQueryClient();
  const week = useMemo(() => getMondayWeek(), []);

  // ===== DECOUPLED activation state — Market and Dynamic run independently =====
  const [isMarketActive, setIsMarketActive] = useState<string | null>(null);
  const [isDynamicActive, setIsDynamicActive] = useState<string | null>(null);
  const [cancelBusy, setCancelBusy] = useState<string | null>(null);

  // Per-coin/per-mode edited prices (override oracle baseline)
  const [editedPrices, setEditedPrices] = useState<Record<CoinKey, Partial<Record<Mode, number>>>>(() => {
    try {
      const raw = localStorage.getItem('dca-target-prices-v2');
      if (!raw) return { btc: {}, eth: {}, sol: {} };
      const p = JSON.parse(raw);
      return { btc: p.btc ?? {}, eth: p.eth ?? {}, sol: p.sol ?? {} };
    } catch { return { btc: {}, eth: {}, sol: {} }; }
  });
  useMemo(() => {
    try { localStorage.setItem('dca-target-prices-v2', JSON.stringify(editedPrices)); } catch { /* noop */ }
  }, [editedPrices]);

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

  // ============= INDEPENDENT ACTIVATIONS =============
  const activateMarket = async (coin: CoinKey, amount: number, price: number, fromReservoir = 0) => {
    if (emergencyPaused) { toast.error('SYSTEM HALTED — exekúcia zablokovaná'); return; }
    if (isMarketActive === coin) return;
    setIsMarketActive(coin);
    try {
      const { error } = await supabase.functions.invoke('dca-execute', {
        body: { coin, kind: 'market', amount_usd: amount, target_price: price },
      });
      if (error) throw error;
      if (coin === 'btc' && fromReservoir > 0) {
        deductReservoir(fromReservoir, `BTC MARKET · ${formatUsd(amount)} (rezervoár ${formatUsd(fromReservoir)})`);
      }
      toast.success(`${coin.toUpperCase()} Market vykonaný ✓`);
      qc.invalidateQueries({ queryKey: ['dca_executions', week] });
      qc.invalidateQueries({ queryKey: ['app_settings'] });
    } catch (e) {
      toast.error('Chyba: ' + (e as Error).message);
    } finally {
      setIsMarketActive(null);
    }
  };

  const activateLimitDynamic = async (coin: CoinKey, amount: number, price: number, fromReservoir = 0) => {
    if (emergencyPaused) { toast.error('SYSTEM HALTED — Limit objednávky blokované'); return; }
    if (isDynamicActive === coin) return;
    setIsDynamicActive(coin);
    try {
      const { error } = await supabase.functions.invoke('dca-execute', {
        body: { coin, kind: 'limit', amount_usd: amount, target_price: price },
      });
      if (error) throw error;
      if (coin === 'btc' && fromReservoir > 0) {
        deductReservoir(fromReservoir, `BTC LIMIT DYNAMIC · ${formatUsd(amount)} (rezervoár ${formatUsd(fromReservoir)})`);
      }
      toast.success(`${coin.toUpperCase()} Limit Dynamic zadaný ⏳`);
      qc.invalidateQueries({ queryKey: ['dca_executions', week] });
      qc.invalidateQueries({ queryKey: ['app_settings'] });
    } catch (e) {
      toast.error('Chyba: ' + (e as Error).message);
    } finally {
      setIsDynamicActive(null);
    }
  };

  const handleCancelLimit = async (id: string, coin: string) => {
    if (!confirm(`Zrušiť limit objednávku ${coin}?`)) return;
    setCancelBusy(`${coin.toLowerCase()}-limit`);
    try {
      const { error } = await supabase.from('dca_executions').update({ status: 'CANCELLED' }).eq('id', id);
      if (error) throw error;
      toast.success(`${coin} limit zrušený`);
      qc.invalidateQueries({ queryKey: ['dca_executions', week] });
    } catch (e) {
      toast.error('Chyba: ' + (e as Error).message);
    } finally {
      setCancelBusy(null);
    }
  };

  const handleMarkExpired = async (id: string, coin: string) => {
    if (!confirm(`Označiť ${coin} limit ako nenaplnený (EXPIRED)?`)) return;
    setCancelBusy(`${coin.toLowerCase()}-limit`);
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
      setCancelBusy(null);
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
    return calcUnifiedExecution(score, metrics, fillRates ?? { eth: 0.5, sol: 0.5 });
  }, [metrics, score, fillRates]);

  const { executions, base } = result;
  const coins: CoinKey[] = ['btc', 'eth', 'sol'];

  // ===== DUAL-FACTOR PER-TOKEN SPLIT ENGINE =====
  // Each token has its OWN Market/Limit split derived from two factors (50/50 weight):
  //   a) SENTIMENT (Fear & Greed): low F&G → more MARKET; high F&G → more LIMIT.
  //      sentMarket = 80 − (fg/100)·60   (fg 0→80, fg 50→50, fg 100→20)
  //   b) VOLATILITY (per-coin 14D σ): high vol → more MARKET, low vol → more LIMIT.
  //      Per-asset dynamic scale reflects historický spread true range:
  //        BTC scale 6 (úzky), ETH scale 5, SOL scale 4 (najširší → vyšší multiplier).
  //      volMarket = 20 + clamp(vol/scale, 0..1)·60
  // Weights (CALIBRATED for altcoin sensitivity):
  //   • BTC: 50 % sent + 50 % vol
  //   • ETH/SOL: 40 % sent + 60 % vol  (vol dominuje pri altcoinoch)
  // Final marketPct = round(wS·sent + wV·vol), clamp [20, 80].
  const fgGlobal = fgValue;
  const VOL_SCALE: Record<string, number> = { BTC: 6, ETH: 5, SOL: 4 };
  const VOL_WEIGHT: Record<string, { sent: number; vol: number }> = {
    BTC: { sent: 0.5, vol: 0.5 },
    ETH: { sent: 0.4, vol: 0.6 },
    SOL: { sent: 0.4, vol: 0.6 },
  };
  function perTokenSplit(sym: string, vol30d: number): { marketPct: number; limitPct: number; sentMarket: number; volMarket: number; wSent: number; wVol: number; scale: number } {
    const sentMarket = Math.max(20, Math.min(80, 80 - (fgGlobal / 100) * 60));
    const scale = VOL_SCALE[sym] ?? 6;
    const w = VOL_WEIGHT[sym] ?? { sent: 0.5, vol: 0.5 };
    const volNorm = Math.max(0, Math.min(1, vol30d / scale));
    const volMarket = Math.max(20, Math.min(80, 20 + volNorm * 60));
    let marketPct = Math.round(Math.max(20, Math.min(80, w.sent * sentMarket + w.vol * volMarket)));
    if (emergencyPaused) marketPct = 0;
    return { marketPct, limitPct: 100 - marketPct, sentMarket, volMarket, wSent: w.sent, wVol: w.vol, scale };
  }
  function perTokenReason(sym: string, vol30d: number, split: ReturnType<typeof perTokenSplit>): string {
    const fgTag = fgGlobal < 30 ? 'extrémny strach' : fgGlobal > 75 ? 'extrémna chamtivosť' : 'neutrálny sentiment';
    const volTag = vol30d >= 4.5 ? 'vysoká' : vol30d >= 2.5 ? 'stredná' : 'nízka';
    const wTag = `váhy ${Math.round(split.wSent * 100)}/${Math.round(split.wVol * 100)} (sent/vol), škála ${split.scale}`;
    if (split.marketPct >= 65) {
      return `${sym} MKT navýšený na ${split.marketPct} % kvôli kombinácii ${fgTag} (F&G ${fgGlobal}) a ${volTag} 14D volatility (${vol30d.toFixed(2)} %) — šanca zachytiť rýchle dno. ${wTag}.`;
    }
    if (split.marketPct <= 35) {
      return `${sym} LMT navýšený na ${split.limitPct} % — ${fgTag} (F&G ${fgGlobal}) a ${volTag} volatilita (${vol30d.toFixed(2)} %) odporúčajú čakať na hlbšie sweep zóny a neplatiť market premium. ${wTag}.`;
    }
    return `${sym} vyvážený split ${split.marketPct}/${split.limitPct} — ${fgTag} (F&G ${fgGlobal}) a ${volTag} volatilita (${vol30d.toFixed(2)} %) v rovnováhe. ${wTag}.`;
  }

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
        <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${emergencyPaused ? 'bg-rose-500 text-white animate-pulse' : 'bg-primary/15 text-primary'}`}>
          {emergencyPaused ? 'HALTED' : 'AUTO'}
        </span>
      </div>

      {emergencyPaused && (
        <div className="rounded-lg border border-rose-500/60 bg-rose-500/15 px-3 py-2 flex items-center gap-2 animate-pulse">
          <AlertTriangle className="w-4 h-4 text-rose-300 flex-shrink-0" />
          <p className="text-[11px] font-bold tracking-wide text-rose-200 leading-snug">
            SYSTEM HALTED: MANUAL OVERRIDE — Market exekúcia 0 %, Limit objednávky blokované, engine zmrazený.
          </p>
        </div>
      )}

      {isLoading && (
        <p className="text-[11px] text-muted-foreground">Načítavam 14D volatilitu a momentum…</p>
      )}

      {/* FEAR & GREED PANEL */}
      <div className="bg-secondary/40 rounded-lg p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Gauge className="w-3.5 h-3.5 text-primary" />
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Fear & Greed Index
            </p>
          </div>
          <span className={`text-[10px] tabular-nums font-bold ${
            fgValue < 30 ? 'text-emerald-300'
            : fgValue > 75 ? 'text-rose-300'
            : 'text-foreground'
          }`}>
            {fgValue}/100 · {fgLabel}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-background/50 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              fgValue < 30 ? 'bg-emerald-500'
              : fgValue > 75 ? 'bg-rose-500'
              : 'bg-amber-500'
            }`}
            style={{ width: `${fgValue}%` }}
          />
        </div>
      </div>

      {/* Global Market/Limit split panel removed — split is now computed PER-TOKEN below
          via the Dual-Factor engine (Fear & Greed + per-coin 14D volatility). */}


      {/* PER-COIN ROWS */}
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
          const lockedLimitPrice = (lPending || lFilled) ? Number(st?.limit?.target_price ?? 0) : 0;
          const lockedLimitUsd = (lPending || lFilled) ? Number(st?.limit?.amount_usd ?? 0) : 0;
          const MomIcon = e.momentum30d >= 0 ? TrendingUp : TrendingDown;
          const momColor = e.momentum30d >= 0 ? 'text-emerald-400' : 'text-rose-400';

          const coinUsd = investableUsd * tokenWeights[c];
          // PER-TOKEN dual-factor split (F&G + per-coin 14D volatility).
          const split = perTokenSplit(e.symbol, e.volatility30d);
          const marketPct = split.marketPct;
          const dynamicPct = split.limitPct;
          const splitReason = perTokenReason(e.symbol, e.volatility30d, split);
          let marketUsdRaw = coinUsd * (marketPct / 100);
          let dynUsdRaw = coinUsd * (dynamicPct / 100);

          // $10 MIN VOLUME FILTER + merge rule
          const MIN_USD = 10;
          const totalInsufficient = coinUsd < MIN_USD;
          let dynMergedIntoMarket = false;
          if (!totalInsufficient && dynUsdRaw < MIN_USD) {
            marketUsdRaw = marketUsdRaw + dynUsdRaw;
            dynUsdRaw = 0;
            dynMergedIntoMarket = true;
          }
          let marketMergedIntoDyn = false;
          if (!totalInsufficient && !dynMergedIntoMarket && marketUsdRaw < MIN_USD) {
            dynUsdRaw = dynUsdRaw + marketUsdRaw;
            marketUsdRaw = 0;
            marketMergedIntoDyn = true;
          }

          // Market price = spot; Limit dynamic = spot * (1 + distance%)
          const marketOracle = price;
          const dynOracle = price > 0 ? price * (1 + e.limitDistancePct / 100) : 0;
          // STATE LOCK: once an order is PENDING/FILLED/EXECUTED, render the exact
          // target_price stored in DB at activation — stop listening to the live feed.
          const marketLockedPrice = mDone ? Number(st?.market?.target_price ?? 0) : 0;
          const marketLockedUsd = mDone ? Number(st?.market?.amount_usd ?? 0) : 0;
          const marketPriceEffective = (mDone && marketLockedPrice > 0)
            ? marketLockedPrice
            : (editedPrices[c]?.market ?? marketOracle);
          const dynPriceEffective = ((lPending || lFilled) && lockedLimitPrice > 0)
            ? lockedLimitPrice
            : (editedPrices[c]?.dynamic ?? dynOracle);
          const marketDrift = !mDone && marketOracle > 0 ? Math.abs(marketPriceEffective - marketOracle) / marketOracle * 100 : 0;
          const dynDrift = !(lPending || lFilled) && dynOracle > 0 ? Math.abs(dynPriceEffective - dynOracle) / dynOracle * 100 : 0;
          const marketDriftAlert = marketDrift > 2;
          const dynDriftAlert = dynDrift > 2;

          const dynUsd = lockedLimitPrice > 0 ? lockedLimitUsd : dynUsdRaw;
          const marketUsd = (mDone && marketLockedUsd > 0) ? marketLockedUsd : marketUsdRaw;

          // BTC funding
          const isBtc = c === 'btc';
          const btcResPctTarget = isBtc ? btcReservoirPct(score) : 0;
          const btcDesiredFromReservoir = isBtc ? (coinUsd * btcResPctTarget) / 100 : 0;
          const btcFromReservoir = isBtc ? Math.min(btcDesiredFromReservoir, Math.max(0, reservoir.stable)) : 0;
          const btcFromRegular = isBtc ? Math.max(0, coinUsd - btcFromReservoir) : 0;
          const btcReservoirShare = isBtc && coinUsd > 0 ? btcFromReservoir / coinUsd : 0;
          const btcReservoirCapped = isBtc && btcDesiredFromReservoir > btcFromReservoir + 0.005;

          const cancelLBusy = cancelBusy === `${c}-limit`;

          const heldQty = Number((settings?.manual_holdings as any)?.[c] ?? 0);
          const marketQty = marketPriceEffective > 0 ? marketUsd / marketPriceEffective : 0;
          const dynQty = dynPriceEffective > 0 ? dynUsd / dynPriceEffective : 0;
          const mAddedQty = mDone ? Number(st?.market?.quantity ?? 0) : 0;
          const lAddedQty = lFilled ? Number(st?.limit?.quantity ?? 0) : 0;
          const qtyFmt = (n: number) => c === 'btc' ? n.toFixed(6) : n.toFixed(4);

          return (
            <div key={c} className="bg-secondary/40 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground">{e.symbol}</span>
                  <span className="text-[9px] text-muted-foreground">váha {tokenLabel[c]} <span className="text-primary/80">· engine</span></span>
                  <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> Yahoo · {syncLabel}
                  </span>
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

              {/* SATELLITE RSI ROW — ETH/SOL only, visible (never tooltip-hidden) */}
              {(c === 'eth' || c === 'sol') && (() => {
                const rsi = c === 'eth' ? market?.eth?.rsi14 : market?.sol?.rsi14;
                const hasRsi = typeof rsi === 'number' && Number.isFinite(rsi);
                const toOversold = hasRsi ? Math.max(0, (rsi as number) - 30) : null;
                let toneCls = 'bg-secondary text-muted-foreground border-border';
                if (hasRsi) {
                  const v = rsi as number;
                  if (v < 35) toneCls = 'bg-sky-500/15 text-sky-300 border-sky-500/40';
                  else if (v > 65) toneCls = 'bg-orange-500/15 text-orange-300 border-orange-500/40';
                  else toneCls = 'bg-secondary text-foreground/80 border-border';
                }
                return (
                  <div className={`rounded border ${toneCls} px-2 py-1 flex items-center justify-between gap-2 text-[10px] tabular-nums`}>
                    <span className="font-semibold">
                      14D RSI: <span className="font-bold">{hasRsi ? (rsi as number).toFixed(1) : 'N/A (Syncing…)'}</span>
                    </span>
                    <span className="font-semibold">
                      To Oversold (30): <span className="font-bold">{toOversold !== null ? `${toOversold.toFixed(1)} pts` : 'N/A'}</span>
                    </span>
                  </div>
                );
              })()}


              {/* PER-TOKEN MKT / LMT SLIDER BAR — dual-factor engine (F&G + vol) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[9px] tabular-nums">
                  <span className="font-bold text-emerald-300">MKT {marketPct}%</span>
                  <span className="text-muted-foreground uppercase tracking-wide">
                    sent {Math.round(split.sentMarket)} · vol {Math.round(split.volMarket)}
                  </span>
                  <span className="font-bold text-amber-400">LMT {dynamicPct}%</span>
                </div>
                <div className="h-2 rounded-full bg-background/60 overflow-hidden flex ring-1 ring-border">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-500 ease-out"
                    style={{ width: `${marketPct}%` }}
                  />
                  <div
                    className="h-full bg-amber-500 transition-all duration-500 ease-out"
                    style={{ width: `${dynamicPct}%` }}
                  />
                </div>
              </div>

              {/* Suma pre token + držané */}
              <div className="flex items-center justify-between bg-background/40 rounded px-2 py-1.5">
                <div>
                  <p className="text-[10px] text-muted-foreground">Alokácia tokenu</p>
                  <p className="text-[9px] text-muted-foreground">
                    vlastním: <span className="text-foreground tabular-nums font-semibold">{qtyFmt(heldQty)} {e.symbol}</span>
                  </p>
                </div>
                <p className="text-sm font-bold text-foreground tabular-nums">
                  ${coinUsd.toFixed(2)}
                </p>
              </div>

              {/* BTC funding breakdown */}
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
                      <p className="text-xs font-bold tabular-nums text-emerald-200">{formatUsd(btcFromReservoir)}</p>
                      <p className="text-[9px] text-muted-foreground tabular-nums">dostupné {formatUsd(reservoir.stable)}</p>
                    </div>
                    <div className="rounded bg-secondary/60 border border-border px-2 py-1">
                      <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                        <Banknote className="w-3 h-3" /> Regular Capital
                      </div>
                      <p className="text-xs font-bold tabular-nums text-foreground">{formatUsd(btcFromRegular)}</p>
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

              {totalInsufficient && (
                <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-2.5 py-2 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-300 mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] font-semibold text-rose-200 leading-snug">
                    Nedostatočný týždenný rozpočet (Minimum pre exekúciu je 10 USD)
                  </p>
                </div>
              )}

              {/* DUAL-CARD: MARKET (left) + LIMIT DYNAMIC (right) — mobile stacks vertically */}
              <div className={`grid grid-cols-1 sm:grid-cols-2 gap-1.5 ${totalInsufficient ? 'opacity-40 pointer-events-none' : ''}`}>
                {([
                  {
                    mode: 'market' as Mode,
                    label: 'MARKET',
                    title: dynMergedIntoMarket ? `MARKET · ${(marketPct + dynamicPct)}% (zlúčené)` : `MARKET · ${marketPct}%`,
                    usd: marketUsd,
                    oracle: marketOracle,
                    effPrice: marketPriceEffective,
                    qty: marketQty,
                    drift: marketDrift,
                    driftAlert: marketDriftAlert,
                    accentText: 'text-emerald-300',
                    isPending: false,
                    isFilled: mDone,
                    addedQty: mDone ? mAddedQty : 0,
                    mergedHere: dynMergedIntoMarket,
                    mergedAway: marketMergedIntoDyn,
                  },
                  {
                    mode: 'dynamic' as Mode,
                    label: 'LIMIT DYNAMIC',
                    title: marketMergedIntoDyn
                      ? `LIMIT DYNAMIC · ${(marketPct + dynamicPct)}% (zlúčené)`
                      : `LIMIT DYNAMIC · ${dynamicPct}% (${e.limitDistancePct.toFixed(1)}%)`,
                    usd: dynUsd,
                    oracle: dynOracle,
                    effPrice: dynPriceEffective,
                    qty: dynQty,
                    drift: dynDrift,
                    driftAlert: dynDriftAlert,
                    accentText: 'text-primary',
                    isPending: lPending,
                    isFilled: lFilled,
                    addedQty: lFilled ? lAddedQty : 0,
                    mergedHere: marketMergedIntoDyn,
                    mergedAway: dynMergedIntoMarket,
                  },
                ]).map(card => {
                  const triggered = card.mode === 'dynamic'
                    ? (price > 0 && card.effPrice > 0 && price <= card.effPrice)
                    : false;
                  const isMerged = card.mergedAway;
                  const cardDisabled = isMerged || card.usd < MIN_USD;
                  // Per-card busy reads from its OWN independent state hook.
                  const cardBusy = card.mode === 'market'
                    ? isMarketActive === c
                    : isDynamicActive === c;
                  const cardBg = isMerged
                    ? 'bg-rose-500/5 ring-1 ring-rose-500/30 opacity-70'
                    : card.isFilled
                    ? 'bg-emerald-500/15 ring-1 ring-emerald-500/40'
                    : card.isPending
                    ? 'bg-amber-500/15 ring-1 ring-amber-500/40'
                    : card.driftAlert
                    ? 'bg-orange-500/10 ring-1 ring-orange-500/40'
                    : triggered
                    ? 'bg-emerald-500/20 ring-1 ring-emerald-500/50'
                    : (card.mode === 'market' ? 'bg-emerald-500/10' : 'bg-primary/10');
                  const baseDistPct = price > 0 && card.effPrice > 0 ? ((card.effPrice - price) / price) * 100 : 0;

                  return (
                    <div key={card.mode} className={`rounded p-2 relative overflow-hidden ${cardBg}`}>
                      <div className="flex items-center justify-between gap-1">
                        <p className={`text-[10px] font-semibold ${card.accentText}`}>{card.title}</p>
                        <button
                          onClick={() => copy(card.usd.toFixed(2))}
                          className="p-0.5 rounded text-foreground/70 hover:bg-foreground/10 active:scale-95"
                          aria-label={`Kopíruj USD ${e.symbol} ${card.mode}`}
                        >
                          <Copy className="w-3 h-3" />
                        </button>
                      </div>
                      {isMerged ? (
                        <p className="text-[10px] font-bold text-rose-300 leading-tight mt-0.5">
                          NEDOSTATOČNÁ SUMA<br/>
                          <span className="font-normal text-rose-200/80">
                            (Zlúčené do {card.mode === 'dynamic' ? 'Market' : 'Limit Dynamic'})
                          </span>
                        </p>
                      ) : (
                        <>
                          <p className="text-sm font-bold text-foreground tabular-nums">${card.usd.toFixed(2)}</p>
                          <p className="text-[9px] text-foreground/70 tabular-nums">
                            ≈ {qtyFmt(card.qty)} {e.symbol}
                          </p>
                          {card.isFilled && card.addedQty > 0 && (
                            <p className="text-[9px] text-emerald-400 tabular-nums">
                              +{qtyFmt(card.addedQty)} {e.symbol} pridané
                            </p>
                          )}
                          <div className="flex items-center justify-between gap-1 mt-1">
                            <div className="flex items-center gap-1 min-w-0">
                              <p className="text-[10px] font-semibold text-foreground tabular-nums">
                                {card.effPrice > 0 ? formatLimitPrice(card.effPrice) : '—'}
                                <span className="text-[9px] text-muted-foreground ml-1">
                                  ({baseDistPct >= 0 ? '+' : ''}{baseDistPct.toFixed(2)}%)
                                </span>
                              </p>
                              {card.effPrice > 0 && (
                                <button
                                  type="button"
                                  onClick={() => copy(card.effPrice.toFixed(c === 'btc' ? 2 : 4))}
                                  className={`p-0.5 rounded hover:bg-foreground/10 active:scale-95 ${card.accentText}`}
                                  aria-label="Kopíruj cieľovú cenu"
                                  title="Kopíruj cieľovú cenu"
                                >
                                  <Copy className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                if (card.isFilled || card.isPending || (card.mode === 'market' && mDone)) {
                                  toast.info('Cena je uzamknutá (order aktívny)');
                                  return;
                                }
                                const current = card.effPrice;
                                const input = window.prompt(
                                  `Upraviť cieľovú cenu pre ${symU} (${card.mode === 'market' ? 'Market' : 'Limit Dynamic'})`,
                                  current.toFixed(c === 'btc' ? 0 : 2),
                                );
                                if (input === null) return;
                                const v = Number(input);
                                if (!Number.isFinite(v) || v <= 0) { toast.error('Neplatná cena'); return; }
                                setEditedPrices(prev => ({
                                  ...prev,
                                  [c]: { ...prev[c], [card.mode]: v },
                                }));
                              }}
                              disabled={card.isFilled || card.isPending || (card.mode === 'market' && mDone)}
                              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                              aria-label="Upraviť cenu"
                              title={card.isFilled || card.isPending || (card.mode === 'market' && mDone) ? 'Cena uzamknutá' : 'Upraviť cenu'}
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                          {card.driftAlert && (
                            <p className="text-[9px] text-orange-300 flex items-center gap-1 leading-tight mt-0.5">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Odchýlka {card.drift.toFixed(1)} % od oracle
                            </p>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (card.isFilled || card.isPending || cardBusy || cardDisabled) return;
                              const reservoirShare = isBtc ? card.usd * btcReservoirShare : 0;
                              if (card.mode === 'market') {
                                activateMarket(c, card.usd, card.effPrice, reservoirShare);
                              } else {
                                activateLimitDynamic(c, card.usd, card.effPrice, reservoirShare);
                              }
                            }}
                            disabled={emergencyPaused || card.isFilled || card.isPending || cardBusy || cardDisabled || card.effPrice <= 0}
                            className={`mt-1.5 w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 disabled:opacity-70 ${
                              card.isFilled ? 'bg-emerald-500 text-background'
                              : card.isPending ? (triggered ? 'bg-emerald-500 text-background' : 'bg-amber-500 text-background')
                              : cardBusy ? (card.mode === 'market' ? 'bg-emerald-600 text-background' : 'bg-primary/80 text-background')
                              : (card.mode === 'market'
                                ? 'bg-emerald-500 text-background'
                                : (triggered ? 'bg-emerald-500 text-background' : 'bg-primary text-primary-foreground'))
                            }`}
                          >
                            {card.isFilled ? <><Check className="w-3 h-3" /> {card.mode === 'market' ? 'Vykonané' : 'Naplnené'}</>
                              : card.isPending ? <><Clock className="w-3 h-3" /> {triggered ? 'Pripravené' : 'Aktívna 🟢'}</>
                              : cardBusy ? 'Aktivujem…'
                              : (card.mode === 'market'
                                ? <><ShoppingCart className="w-3 h-3" /> Aktivovať Market</>
                                : 'Aktivovať Limit Dynamic')}
                          </button>
                          {card.mode === 'dynamic' && card.isPending && st?.limit?.id && (
                            <div className="mt-1 grid grid-cols-2 gap-1">
                              <button
                                onClick={() => handleMarkExpired(st.limit.id, symU)}
                                disabled={cancelLBusy}
                                className="px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 active:scale-95 disabled:opacity-70"
                                title="Limit sa nenaplnil — zarátaj do fill-rate"
                              >
                                <Clock className="w-3 h-3" /> Nenaplnil sa
                              </button>
                              <button
                                onClick={() => handleCancelLimit(st.limit.id, symU)}
                                disabled={cancelLBusy}
                                className="px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:scale-95 disabled:opacity-70"
                              >
                                <X className="w-3 h-3" /> Zrušiť
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
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

              <p className="text-[10px] text-muted-foreground leading-snug">
                <span className="font-semibold text-foreground/80">Prečo? </span>
                {splitReason} {e.rationale}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
