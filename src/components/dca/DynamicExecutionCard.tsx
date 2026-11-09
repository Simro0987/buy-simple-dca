import { useMemo, useState, useEffect } from 'react';
import { Zap, TrendingUp, TrendingDown, Activity, Copy, Info, Check, Clock, X, Wallet, Banknote, Coins, Pencil, AlertTriangle, ShoppingCart, Gauge, Sparkles, PauseCircle } from 'lucide-react';
import { useBtcOnlyMode } from '@/lib/btcOnlyMode';
import { BtcExecutionCard } from './BtcExecutionCard';
import { EthExecutionCard } from './EthExecutionCard';
import { SolExecutionCard } from './SolExecutionCard';
import { GenericSatelliteExecutionCard } from './GenericSatelliteExecutionCard';
import { useDynamicSatellites } from '@/hooks/useDynamicSatellites';
import { BASKET_LABELS, type Basket } from '@/lib/assetBaskets';
import { exactTenths } from '@/lib/dcaBasketEngine';
import { useDcaTokenVisibility } from '@/lib/dcaTokenVisibility';
import { HypeExecutionCard } from './HypeExecutionCard';
import { YieldTokenExecutionCard } from './YieldTokenExecutionCard';


import { useYieldTokenMetrics } from '@/hooks/useYieldTokenMetrics';
import { useSatelliteAllocation } from '@/hooks/useSatelliteAllocation';
import { effectiveBasketPercentages, type SatelliteToken } from '@/lib/satelliteAllocation';

import { useAddTokenTransaction } from '@/hooks/useTokenTransactions';
import { computeYieldAllocations, computeYieldExecution, yieldContinuousMarketPct } from '@/lib/yieldAllocation';
import { NETWORK_STYLE } from '@/lib/yieldTokens';
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

// profit reservoir removed — single Weekly Investment source of truth
import { useEmergencyPause } from '@/lib/emergencyPause';
import { useSafetyBrakeBoost } from '@/hooks/useSafetyBrakeBoost';
import {
  calcUnifiedExecution,
  fixedExecution,
  btcContinuousMarketPct,
  satContinuousMarketPct,
  
  type CoinKey,
} from '@/lib/dynamicExecution';
import { formatLimitPrice, formatUsd, type PriceData } from '@/lib/crypto';
import { useRegimeLimits } from '@/hooks/useRegimeLimits';
import { computeContinuousLimit, continuousLimitAllocPct } from '@/lib/continuousLimit';
import { useConfluenceMetrics } from '@/hooks/useConfluenceMetrics';
import { octagonExecutionSplit, averageOctagonScore } from '@/lib/octagonExecution';

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
  const { metrics: octMetrics } = useConfluenceMetrics();
  const octagonScore = useMemo(
    () => averageOctagonScore([octMetrics.BTC, octMetrics.ETH, octMetrics.SOL]),
    [octMetrics],
  );
  const octagon = useMemo(() => octagonExecutionSplit(octagonScore), [octagonScore]);
  const marketDataUnavailable = Boolean(market?.fallback || market?.degraded);
  const [emergencyPaused] = useEmergencyPause();
  // Safety Active Brake & Boost — režimy pre všetky tokeny (multiplier iba na MKT).
  const { states: brakeStates } = useSafetyBrakeBoost();
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
  
  const qc = useQueryClient();
  const week = useMemo(() => getMondayWeek(), []);
  const addTxCore = useAddTokenTransaction();
  const CG_ID_FOR_COIN: Record<CoinKey, string> = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana' };
  const coinFallbackInsert = async (coin: CoinKey, amount: number, price: number, kind: 'market' | 'limit') => {
    const qty = price > 0 ? amount / price : 0;
    if (qty <= 0) throw new Error('Neplatná cena/množstvo');
    await addTxCore.mutateAsync({
      coingecko_id: CG_ID_FOR_COIN[coin],
      symbol: coin.toUpperCase(),
      side: 'buy',
      quantity: qty,
      price_usd: price,
      note: kind === 'market' ? 'DCA Market (fallback)' : 'DCA Limit (fallback)',
    });
  };

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
  const activateMarket = async (coin: CoinKey, amount: number, price: number) => {
    if (emergencyPaused) { toast.error('SYSTEM HALTED — exekúcia zablokovaná'); return; }
    if (isMarketActive === coin) return;
    setIsMarketActive(coin);
    try {
      try {
        const { error } = await supabase.functions.invoke('dca-execute', {
          body: { coin, kind: 'market', amount_usd: amount, target_price: price },
        });
        if (error) throw error;
        toast.success(`${coin.toUpperCase()} Market vykonaný ✓`);
      } catch (edgeErr) {
        // Fallback — zapíš priamo do portfólia (token_transactions), aby UI nezostalo blokované
        console.warn('dca-execute failed, using fallback:', edgeErr);
        await coinFallbackInsert(coin, amount, price, 'market');
        toast.success(`Úspešne aktivované a pridané do portfólia (${coin.toUpperCase()})`);
      }
      qc.invalidateQueries({ queryKey: ['dca_executions', week] });
      qc.invalidateQueries({ queryKey: ['app_settings'] });
      qc.invalidateQueries({ queryKey: ['token_transactions'] });
      qc.invalidateQueries({ queryKey: ['avgBuyPrices'] });
      qc.invalidateQueries({ queryKey: ['globalBalances'] });
    } catch (e) {
      toast.error('Chyba: ' + (e as Error).message);
    } finally {
      setIsMarketActive(null);
    }
  };

  const activateLimitDynamic = async (coin: CoinKey, amount: number, price: number) => {
    if (emergencyPaused) { toast.error('SYSTEM HALTED — Limit objednávky blokované'); return; }
    if (isDynamicActive === coin) return;
    setIsDynamicActive(coin);
    try {
      try {
        const { error } = await supabase.functions.invoke('dca-execute', {
          body: { coin, kind: 'limit', amount_usd: amount, target_price: price },
        });
        if (error) throw error;
        toast.success(`${coin.toUpperCase()} Limit Dynamic zadaný ⏳`);
      } catch (edgeErr) {
        console.warn('dca-execute failed, using fallback:', edgeErr);
        await coinFallbackInsert(coin, amount, price, 'limit');
        toast.success(`Úspešne aktivované a pridané do portfólia (${coin.toUpperCase()})`);
      }
      qc.invalidateQueries({ queryKey: ['dca_executions', week] });
      qc.invalidateQueries({ queryKey: ['app_settings'] });
      qc.invalidateQueries({ queryKey: ['token_transactions'] });
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

  const handleCancelMarket = async (
    id: string,
    coin: string,
    qty: number,
    amountUsd: number,
  ) => {
    if (!confirm(`Zrušiť Market ${coin} a vrátiť hodnoty z portfólia?`)) return;
    setCancelBusy(`${coin.toLowerCase()}-market`);
    try {
      const { error } = await supabase
        .from('dca_executions')
        .update({ status: 'CANCELLED' })
        .eq('id', id);
      if (error) throw error;

      // Revert app_settings.manual_holdings + initial_cost_basis (columns exist at runtime, not in generated types)
      const { data: settingsRow } = await (supabase as any)
        .from('app_settings')
        .select('id, manual_holdings, initial_cost_basis')
        .limit(1)
        .maybeSingle();
      if (settingsRow) {
        const key = coin.toLowerCase();
        const mh = { ...((settingsRow.manual_holdings as Record<string, number> | null) ?? {}) };
        const cb = { ...((settingsRow.initial_cost_basis as Record<string, number> | null) ?? {}) };
        mh[key] = Math.max(0, Number(mh[key] ?? 0) - Number(qty || 0));
        cb[key] = Math.max(0, Number(cb[key] ?? 0) - Number(amountUsd || 0));
        await (supabase as any)
          .from('app_settings')
          .update({ manual_holdings: mh, initial_cost_basis: cb })
          .eq('id', settingsRow.id);
      }

      toast.success(`${coin} Market zrušený — hodnoty vrátené`);
      qc.invalidateQueries({ queryKey: ['dca_executions', week] });
      qc.invalidateQueries({ queryKey: ['app_settings'] });
      qc.invalidateQueries({ queryKey: ['token_transactions'] });
      qc.invalidateQueries({ queryKey: ['globalBalances'] });
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

  // ── Regime-based dynamic limit engine (50D EMA + 7d support, 2.0–7.5% failsafe) ──
  const livePriceMap: Partial<Record<CoinKey, number>> = {
    btc: prices?.bitcoin?.usd ?? 0,
    eth: prices?.ethereum?.usd ?? 0,
    sol: prices?.solana?.usd ?? 0,
  };
  const { data: regimeMap } = useRegimeLimits(livePriceMap);

  // Auto-write to portfolio holdings when a limit order becomes FILLED.
  // Tracks written orders by ID to prevent duplicate writes + auto-confirms with toast.
  useEffect(() => {
    for (const [coinSym, status] of execStatus.entries()) {
      const lim = (status as Record<string, { status?: string; quantity?: unknown; id?: string; executed_price?: unknown; amount_usd?: unknown }>)?.limit;
      if (!lim || lim.status !== 'FILLED') continue;
      const qty = Number(lim.quantity ?? 0);
      if (qty <= 0 || !lim.id) continue;
      const writtenKey = `portfolio-limit-written-${lim.id}`;
      if (localStorage.getItem(writtenKey)) continue;
      try {
        const cgMap: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };
        const px = Number(lim.executed_price ?? 0);
        const usd = Number(lim.amount_usd ?? 0);
        void (async () => {
          const { data: userRes } = await supabase.auth.getUser();
          const uid = userRes.user?.id;
          if (!uid) return;
          const note = `DCA limit fill (${lim.id})`;
          const { data: existing } = await supabase.from('token_transactions').select('id').eq('note', note).limit(1);
          if (existing && existing.length > 0) { localStorage.setItem(writtenKey, '1'); return; }
          const { error: insErr } = await supabase.from('token_transactions').insert({
            user_id: uid,
            coingecko_id: cgMap[coinSym] ?? coinSym.toLowerCase(),
            symbol: coinSym,
            side: 'buy',
            quantity: qty,
            price_usd: px,
            executed_at: new Date().toISOString(),
            note,
          });
          if (insErr) { toast.error('Zápis do histórie zlyhal: ' + insErr.message); return; }
          localStorage.setItem(writtenKey, '1');
          window.dispatchEvent(new Event('portfolio-updated'));
          qc.invalidateQueries({ queryKey: ['token_transactions'] });
          qc.invalidateQueries({ queryKey: ['globalBalances'] });
          qc.invalidateQueries({ queryKey: ['dca_executions', week] });
          qc.invalidateQueries({ queryKey: ['app_settings'] });
          qc.invalidateQueries({ queryKey: ['limit-fill-rates'] });
        })();
        toast.success(`✅ ${coinSym} LIMIT automaticky naplnený`, {
          description: `${qty.toFixed(4)} ${coinSym}${px > 0 ? ` @ $${px.toFixed(px >= 1 ? 2 : 4)}` : ''}${usd > 0 ? ` · ${formatUsd(usd)}` : ''} · zapísané do portfólia.`,
          duration: 8000,
        });
      } catch { /* noop */ }

    }
  }, [execStatus, qc, week]);

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

  // ===== YIELD BUCKET + AUTOMATIC REFLOW =====
  // Ak filter 3/3 pre yield tokeny vyhodnotí 0 aktívnych, celý yield bucket
  // sa automaticky prerozdelí do Core/Satelites v pomere engine.perToken.
  const { data: yieldMetricsData } = useYieldTokenMetrics();
  const yieldWeightPct = engine.yieldWeight ?? 0;
  const yieldBucketUsd = (investableUsd * yieldWeightPct) / 100;
  const yieldAllocations = useMemo(
    () => computeYieldAllocations(yieldBucketUsd, yieldMetricsData),
    [yieldBucketUsd, yieldMetricsData],
  );
  // SATELLITES pool — jednotné relatívne skóre pre satelity.
  // BTC-ONLY override → kôš = $0 a S² matematika sa obchádza (žiadne NaN).
  const [btcOnly] = useBtcOnlyMode();
  // Dynamické satelity z Portfólia (tracked_tokens) — automaticky dostanú plnú DCA kartu.
  const { satellites: dynamicSats } = useDynamicSatellites();
  // Odstránené tokeny z Portfólia → ich DCA karty zmiznú a kôš sa prepočíta.
  const { activeSatellites, isHidden: isTokenRemoved } = useDcaTokenVisibility();
  const satAlloc = useSatelliteAllocation(
    investableUsd,
    engine.perToken.btc ?? 50,
    btcOnly,
    dynamicSats,
    [],
    { SATELLITES: engine.satelliteWeight, HIGH_BETA: engine.highBetaWeight, PROXY: engine.proxyWeight },
  );
  const effectiveBasketPct = effectiveBasketPercentages(satAlloc.basketUsd);
  // JEDINÝ ZDROJ PRAVDY — USD sumy už obsahujú makro budget aj waterfall.
  const satUsd = (t: SatelliteToken) => satAlloc.bySatellite[t]?.usd ?? 0;
  const basketLocalPct = useMemo(() => {
    const out: Record<string, number> = {};
    for (const basket of ['SATELLITES', 'HIGH_BETA', 'PROXY'] as Basket[]) {
      const rows = satAlloc.satelliteList.filter((row) => row.basket === basket);
      const exact = exactTenths(rows.map((row) => row.weight));
      rows.forEach((row, index) => { out[row.token] = exact[index] ?? 0; });
    }
    return out;
  }, [satAlloc.satelliteList]);
  const satPoolPct = (t: SatelliteToken) => basketLocalPct[t] ?? 0;
  // BTC-ONLY override: satelitné karty sa vizuálne stlmia a deaktivujú.
  const satDimCls = btcOnly ? 'opacity-50 grayscale pointer-events-none select-none' : '';
  // LINK / AAVE / HYPE — ich podiel v satelitnom koši
  const satBucketUsd = (['link', 'aave', 'hype'] as const)
    .reduce((sum, t) => sum + satUsd(t), 0);

  const yieldUsedUsd = yieldAllocations.filter(a => a.active).reduce((s, a) => s + a.usd, 0);
  const yieldReflowUsd = Math.max(0, yieldBucketUsd - yieldUsedUsd);
  const sumCoreSatWeights = coins.reduce((s, c) => s + tokenWeights[c], 0);
  const reflowPerCoin: Record<CoinKey, number> = {
    btc: sumCoreSatWeights > 0 ? yieldReflowUsd * (tokenWeights.btc / sumCoreSatWeights) : 0,
    eth: sumCoreSatWeights > 0 ? yieldReflowUsd * (tokenWeights.eth / sumCoreSatWeights) : 0,
    sol: sumCoreSatWeights > 0 ? yieldReflowUsd * (tokenWeights.sol / sumCoreSatWeights) : 0,
  };



  // ===== CONTINUOUS MARKET/LIMIT GEARBOX =====
  // Žiadne skokové prahy — čistá lineárna interpolácia (viď dynamicExecution.ts).
  //   BTC: base 50, +(50−F&G)·0.6, −wmaDistPct·0.8 → clamp(20, 80).
  //   ETH/SOL: base 50, −((price−ema50)/ema50)·200 → clamp(20, 80).
  //   ETH/SOL limit price: (aktuálna cena) − 1.5 × denný ATR.
  const fgGlobal = fgValue;
  const btcWmaDistPct = (() => {
    const p = market?.btc?.price ?? 0;
    const w = market?.btc?.ma200w ?? 0;
    if (!(p > 0) || !(w > 0) || market?.btc?.ma200wStale) return null;
    const d = ((p - w) / w) * 100;
    return Math.abs(d) > 20 ? null : d;
  })();


  // ===== SAFETY BRAKE (Priority A — Override) =====
  //   BTC/ETH/SOL (jednotná logika): RSI(14D) > 75 → 10 % MKT / 90 % LMT (3.0× ATR pod spot)
  interface SafetyBrake {
    active: boolean;
    reason: string;   // krátky popis pre badge
    detail: string;   // dlhší popis
    limitPrice: number; // 0 ak nie je aktívny
    distancePct: number; // v % (záporné)
  }
  /**
   * Starý 10/90 RSI Safety Brake bol úplne odstránený.
   * Prehriatie/podchladenie riadi výhradne Safety Active Brake & Boost engine
   * (multiplier IBA na finálnu MKT sumu). Ponechané ako no-op pre kompatibilitu.
   */
  function computeSafetyBrake(_coin: CoinKey): SafetyBrake {
    return { active: false, reason: '', detail: '', limitPrice: 0, distancePct: 0 };
  }


  interface SplitOut {
    marketPct: number;
    limitPct: number;
    fgContrib: number;
    wmaContrib: number;
    emaDiffPct: number;
    brake: SafetyBrake;
  }

  function perTokenSplit(coin: CoinKey): SplitOut {
    const brake = computeSafetyBrake(coin);
    let marketPct: number;
    let fgContrib = 0;
    let wmaContrib = 0;
    let emaDiffPct = 0;
    if (coin === 'btc') {
      fgContrib = (50 - fgGlobal) * 0.6;
      wmaContrib = btcWmaDistPct !== null ? -btcWmaDistPct * 0.8 : 0;
      marketPct = btcContinuousMarketPct(fgGlobal, btcWmaDistPct);
    } else {
      const info = regimeMap?.[coin];
      const price = info?.price ?? 0;
      const ema50 = info?.ema50 ?? 0;
      if (price > 0 && ema50 > 0) {
        emaDiffPct = ((price - ema50) / ema50) * 100;
        marketPct = satContinuousMarketPct(price, ema50);
      } else {
        marketPct = 50;
      }
    }
    // PRIORITY A: Safety Brake override — 10/90
    if (brake.active) marketPct = 10;
    if (emergencyPaused) marketPct = 0;
    return { marketPct, limitPct: 100 - marketPct, fgContrib, wmaContrib, emaDiffPct, brake };
  }

  /**
   * CAPITAL FLOW — suma zablokovaná STOP/REDUCE na altoch (ETH, SOL, yield koš)
   * sa presúva do BTC Market alokácie. LMT hodnoty sa nemenia.
   */
  const redirectedToBtcUsd = (() => {
    let freed = 0;
    // ETH / SOL
    for (const alt of ['eth', 'sol'] as CoinKey[]) {
      const st = brakeStates[alt];
      const cut = Math.max(0, 1 - (st?.multiplier ?? 1));
      if (cut <= 0) continue;
      const sp = perTokenSplit(alt);
      const baseUsd = investableUsd * (tokenWeights[alt] ?? 0) * (sp.marketPct / 100);
      freed += baseUsd * cut;
    }
    // Yield koš (HYPE, LINK, AAVE)
    for (const a of yieldAllocations ?? []) {
      const key = a.symbol.toLowerCase() as 'hype' | 'link' | 'aave';
      const st = brakeStates[key];
      const cut = Math.max(0, 1 - (st?.multiplier ?? 1));
      if (cut <= 0) continue;
      freed += computeYieldExecution(a, score).marketUsd * cut;
    }
    return Math.round(freed * 100) / 100;
  })();

  /** Vzdialenosť BTC od 200D SMA v %, alebo null ak nedostupné. */
  function btcSmaDistPct(): number | null {
    const p = market?.btc?.price ?? prices?.bitcoin?.usd ?? 0;
    const sma = market?.btc?.ma200d ?? 0;
    if (!(p > 0) || !(sma > 0)) return null;
    return ((p - sma) / sma) * 100;
  }

  /** Krátky riadok stavu pre narratív posunu: "[Coin] stav: … · Status: …ný Safety Brake." */
  function safetyStatusLine(sym: string, coin: CoinKey, split: SplitOut): string {
    const status = split.brake.active ? 'Aktívny' : 'Neaktívny';
    // Jednotný RSI-based status pre BTC/ETH/SOL (rovnaká logika Safety Brake).
    const rsi = coin === 'btc' ? market?.btc?.rsi14 : coin === 'eth' ? market?.eth?.rsi14 : market?.sol?.rsi14;
    const rsiTxt = typeof rsi === 'number' && Number.isFinite(rsi)
      ? `RSI ${rsi.toFixed(1)} (limit 75)`
      : `RSI ${isLoading ? 'Načítavam...' : 'Dáta nedostupné'}`;
    return `${sym} stav: ${rsiTxt}. Status: ${status} Safety Brake.`;
  }

  function perTokenReason(sym: string, coin: CoinKey, split: SplitOut, atrDiscount: number): string {
    const statusLine = safetyStatusLine(sym, coin, split);
    if (split.brake.active) {
      return `${statusLine} ${sym} SAFETY BRAKE → 10/90. ${split.brake.detail}`;
    }
    if (coin === 'btc') {
      const wmaTxt = btcWmaDistPct === null
        ? '200WMA Dáta nedostupné'
        : `${btcWmaDistPct >= 0 ? '+' : ''}${btcWmaDistPct.toFixed(1)}% od 200WMA`;
      const fgTxt = `F&G ${fgGlobal}`;
      const dir = split.marketPct > 55 ? 'MKT navýšený' : split.marketPct < 45 ? 'LMT navýšený' : 'vyvážený split';
      return `${statusLine} ${sym} ${dir} → ${split.marketPct}/${split.limitPct}. ${fgTxt} kontribuuje ${split.fgContrib >= 0 ? '+' : ''}${split.fgContrib.toFixed(1)} pp, ${wmaTxt} kontribuuje ${split.wmaContrib >= 0 ? '+' : ''}${split.wmaContrib.toFixed(1)} pp (base 50, plynulá interpolácia).`;
    }
    const emaTxt = `${split.emaDiffPct >= 0 ? '+' : ''}${split.emaDiffPct.toFixed(2)}% vs 50D EMA`;
    const dir = split.marketPct > 55 ? 'MKT navýšený' : split.marketPct < 45 ? 'LMT navýšený' : 'vyvážený split';
    return `${statusLine} ${sym} ${dir} → ${split.marketPct}/${split.limitPct}. ${emaTxt} plynulo mení pomer; hlbšia zľava plynulo presúva váhu do LMT (strop 70 %). Limitná cena vychádza z dennej volatility (ATR) škálovanej RSI → −${atrDiscount.toFixed(2)} %.`;
  }



  const copy = (text: string) => {
    // Slovak locale — decimal comma instead of decimal point
    const skFormatted = String(text).replace(/\./g, ',');
    navigator.clipboard.writeText(skFormatted);
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

      {marketDataUnavailable && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-[10px] leading-snug text-amber-200/90">
          Momentálne nedostupné dáta (CoinGecko). Prekročený limit požiadaviek. Aplikácia automaticky
          zopakuje pokus o niekoľko minút.
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

      {/* CONFLUENCE OCTAGON SCORE PANEL — dominant driver of MKT/LMT split (sliding scale) */}
      <div className="bg-secondary/40 rounded-lg p-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-primary" />
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
              Confluence Octagon Score
            </p>
          </div>
          {isLoading ? (
            <span className="text-[10px] text-muted-foreground animate-pulse">Načítavam…</span>
          ) : (
            <span className={`text-[10px] tabular-nums font-bold ${
              octagonScore < 30 ? 'text-emerald-300'
              : octagonScore > 75 ? 'text-rose-300'
              : 'text-foreground'
            }`}>
              {octagonScore.toFixed(0)}/100 · base MKT {octagon.marketPct}% / LMT {octagon.limitPct}%
            </span>
          )}

        </div>
        <div className="h-1.5 rounded-full bg-background/50 overflow-hidden flex">
          <div
            className="h-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${octagon.marketPct}%` }}
          />
          <div
            className="h-full bg-amber-500 transition-all duration-500"
            style={{ width: `${octagon.limitPct}%` }}
          />
        </div>
        <p className="text-[10px] text-foreground/80 leading-snug">
          {octagon.narrative}
        </p>
      </div>

      {/* Global Market/Limit split panel removed — split is now computed PER-TOKEN below
          via the Dual-Factor engine (Fear & Greed + per-coin 14D volatility). */}


      {/* PER-COIN ROWS */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-foreground font-bold">{BASKET_LABELS.CORE}</p>
            <p className="text-[9px] uppercase tracking-wide text-muted-foreground font-semibold">BTC</p>
          </div>
          <span className="text-[10px] tabular-nums text-foreground font-semibold">
            Σ ${investableUsd.toFixed(0)}
          </span>
        </div>
        {(satAlloc.cascade?.satellitesToCoreUsd ?? 0) > 0.01 && (
          <div className="rounded border border-amber-400/50 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-200">
            +${satAlloc.cascade.satellitesToCoreUsd.toFixed(2)} presmerované zo Satelitov do CORE (BTC) — záchrana kapitálu do bezpečia
          </div>
        )}
        {(satAlloc.cascade?.proxyToCoreUsd ?? 0) > 0.01 && (
          <div className="rounded border border-amber-400/50 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-200">
            +${satAlloc.cascade.proxyToCoreUsd.toFixed(2)} presmerované z Proxy (MSTR) do CORE (BTC) — nákup zamietnutý
          </div>
        )}
        {(satAlloc.cascade?.proxyReduceToCoreUsd ?? 0) > 0.01 && (
          <div className="rounded border border-amber-400/50 bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-200">
            +${satAlloc.cascade.proxyReduceToCoreUsd.toFixed(2)} z MSTR (mNAV REDUCE 50 %) do globálneho bonus_poolu → CORE (BTC)
          </div>
        )}
        {(satAlloc.cascade?.proxyBoostReserveUsd ?? 0) > 0.01 && (
          <div className="rounded border border-primary/50 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
            MSTR DEEP BOOST 150 %: +${satAlloc.cascade.proxyBoostReserveUsd.toFixed(2)} z globálneho bonus_poolu (deficit z Hotovostnej rezervy)
          </div>
        )}
        {/* Safety Active Brake & Boost — bonus_pool: REDUCE uvoľní → dotuje BOOST, prebytok do BTC, deficit z Hotovostnej rezervy. */}
        {(['btc'] as CoinKey[]).map(c => {
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

          // Univerzálne satelitné karty sa vykresľujú nižšie podľa registra košov.
          const isSatCoin = c === 'eth' || c === 'sol';
          // BTC-ONLY override: BTC (CORE) dostáva plných 100 % týždenného kapitálu.
          const baseCoinUsd = isSatCoin
            ? satUsd(c as SatelliteToken)
            : (btcOnly ? investableUsd : investableUsd * tokenWeights[c]);
          const reflowAdd = isSatCoin ? 0 : (reflowPerCoin[c] ?? 0) + (btcOnly ? 0 : (satAlloc.cascade?.satellitesToCoreUsd ?? 0) + (satAlloc.cascade?.proxyToCoreUsd ?? 0) + (satAlloc.cascade?.proxyReduceToCoreUsd ?? 0));
          const coinUsd = baseCoinUsd + reflowAdd;

          // Kontinuálny per-token split (FG+WMA pre BTC, EMA50 pre ETH/SOL).
          const split = perTokenSplit(c);
          const brakeActive = split.brake.active;
          const regimeInfo = regimeMap?.[c];

          // ── LIMIT PRICE · 100 % PLYNULÁ KRIVKA ──
          // base = 1× denný ATR → škálované RSI/50 → hladká interpolácia
          // s najbližšou MA (EMA50 / SMA200) pod cenou. Žiadne snapovanie na EMA.
          const dailyAtr = (() => {
            const m = c === 'btc' ? market?.btc : c === 'eth' ? market?.eth : market?.sol;
            const a14 = typeof m?.atr14d === 'number' ? m.atr14d : 0;
            if (a14 > 0) return a14;
            return regimeInfo?.atr7 && regimeInfo.atr7 > 0 ? regimeInfo.atr7 : 0;
          })();
          const rsiLive = (() => {
            const m = c === 'btc' ? market?.btc : c === 'eth' ? market?.eth : market?.sol;
            return typeof m?.rsi14 === 'number' && Number.isFinite(m.rsi14) ? m.rsi14 : null;
          })();
          const cl = computeContinuousLimit({
            price: price > 0 ? price : (regimeInfo?.price ?? 0),
            atr: dailyAtr,
            rsi14: rsiLive,
            ema50: regimeInfo?.ema50 ?? null,
            sma200: c === 'btc' ? (market?.btc?.ma200d ?? null) : null,
          });

          const regimeFallbackDrop = c === 'btc' ? 3.0 : c === 'eth' ? 4.5 : 5.5;
          const atrDiscountPct = brakeActive
            ? Math.abs(split.brake.distancePct)
            : cl.ok
              ? cl.discountPct
              : (regimeInfo?.discountPct ?? regimeFallbackDrop);
          const regimeLabel = brakeActive
            ? '3.0× ATR pod spot'
            : cl.ok
              ? `${cl.rsiMultiple.toFixed(2)}× ATR · RSI ${cl.rsi.toFixed(0)}`
              : 'fallback';
          const regimeReason = brakeActive
            ? split.brake.detail
            : cl.ok
              ? cl.explanation
              : (regimeInfo?.reason
                ?? 'Dáta z Binance momentálne nedostupné — používame bezpečný fallback limit.');

          // ── PLYNULÝ MKT/LMT SPLIT ── hlbšia zľava ⇒ viac kapitálu do LMT (max 70 %)
          const dynamicPct = brakeActive || emergencyPaused || !cl.ok
            ? split.limitPct
            : continuousLimitAllocPct(split.limitPct, cl.lucrativeness);
          const marketPct = 100 - dynamicPct;
          const splitReason  = perTokenReason(e.symbol, c, { ...split, marketPct, limitPct: dynamicPct }, atrDiscountPct);
          // ── SAFETY ACTIVE BRAKE & BOOST ── multiplier IBA na MKT sumu.
          const bbState = brakeStates[c];
          const bbMultiplier = bbState?.multiplier ?? 1;
          let marketUsdRaw = coinUsd * (marketPct / 100) * bbMultiplier;
          if (c === 'btc') marketUsdRaw += redirectedToBtcUsd;
          let dynUsdRaw = coinUsd * (dynamicPct / 100);

          // ── MERGE PROTOCOL (Min Order Rule) — POVOLENÝ IBA PRE SOL ──
          // BTC a ETH sa nezlučujú (dostatočne veľké alokácie).
          // Ak SOL Limit USD < $10:
          //   • Total < $10                → 100 % MARKET (mikro-nákup)
          //   • cena < 50D EMA             → 100 % MARKET (oversold)
          //   • inak                        → 100 % LIMIT (1.5× ATR pod spot)
          const MIN_DYN_USD = 10;
          const totalInsufficient = coinUsd <= 0;
          const mergeAllowed = c === 'sol' && !brakeActive;
          const solPrice = c === 'sol' ? (regimeMap?.sol?.price ?? 0) : 0;
          const solEma50 = c === 'sol' ? (regimeMap?.sol?.ema50 ?? 0) : 0;
          const solBelowEma = c === 'sol' && solPrice > 0 && solEma50 > 0 && solPrice < solEma50;
          let dynMergedIntoMarket = false;
          let marketMergedIntoDyn = false;
          let mergeReason = '';
          if (mergeAllowed && !totalInsufficient && dynUsdRaw > 0 && dynUsdRaw < MIN_DYN_USD) {
            const total = marketUsdRaw + dynUsdRaw;
            if (total < MIN_DYN_USD) {
              marketUsdRaw = total; dynUsdRaw = 0;
              dynMergedIntoMarket = true;
              mergeReason = `Total $${total.toFixed(2)} < $${MIN_DYN_USD} → 100 % Market (mikro-nákup)`;
            } else if (solBelowEma) {
              marketUsdRaw = total; dynUsdRaw = 0;
              dynMergedIntoMarket = true;
              mergeReason = `SOL pod 50D EMA → 100 % Market`;
            } else {
              dynUsdRaw = total; marketUsdRaw = 0;
              marketMergedIntoDyn = true;
              mergeReason = `SOL nad 50D EMA → 100 % Limit (1.5× ATR pod spot)`;
            }
          }

          // Market price = spot
          // Limit price: Safety brake override > plynulá ATR/RSI/MA krivka > fallback.
          const marketOracle = price;
          const dynOracle    = brakeActive && split.brake.limitPrice > 0
            ? split.brake.limitPrice
            : cl.ok && cl.limitPrice > 0
              ? cl.limitPrice
              : (price > 0 ? price * (1 - atrDiscountPct / 100) : (regimeInfo?.limitPrice ?? 0));
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


          const cancelLBusy = cancelBusy === `${c}-limit`;

          const heldQty = Number((settings?.manual_holdings as any)?.[c] ?? 0);
          const marketQty = marketPriceEffective > 0 ? marketUsd / marketPriceEffective : 0;
          const dynQty = dynPriceEffective > 0 ? dynUsd / dynPriceEffective : 0;
          const mAddedQty = mDone ? Number(st?.market?.quantity ?? 0) : 0;
          const lAddedQty = lFilled ? Number(st?.limit?.quantity ?? 0) : 0;
          const qtyFmt = (n: number) => c === 'btc' ? n.toFixed(4) : n.toFixed(4);

          // ===== BTC: nový side-by-side redesign (ETH/SOL zostávajú v starom layoute) =====
          if (c === 'btc') {
            return (
              <div key={c} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-300">
                    Core · BTC
                  </span>
                  <span className="text-[9px] tabular-nums text-muted-foreground">≥ 50 % kapitálu</span>
                </div>
              <BtcExecutionCard
                key={c}
                weightLabel={tokenLabel.btc}
                coinUsd={coinUsd}
                reflowAdd={reflowAdd}
                baseCoinUsd={baseCoinUsd}
                heldQty={heldQty}
                price={price}
                sma200={market?.btc?.ma200d ?? null}
                smaDistPct={btcSmaDistPct()}
                ema50={regimeMap?.btc?.ema50 ?? null}
                rsi14={typeof market?.btc?.rsi14 === 'number' ? market.btc.rsi14 : null}
                volatility30d={e.volatility30d}
                momentum30d={e.momentum30d}
                brakeState={brakeStates[c]}
                marketPct={marketPct}
                limitPct={dynamicPct}
                marketUsd={marketUsd}
                limitUsd={dynUsd}
                marketPrice={marketPriceEffective}
                limitPrice={dynPriceEffective}
                limitDiscountPct={atrDiscountPct}
                regimeLabel={regimeLabel}
                regimeReason={regimeReason}
                splitReason={splitReason}
                rationale={e.rationale}
                syncLabel={syncLabel}
                emergencyPaused={emergencyPaused}
                marketDone={mDone}
                limitPending={lPending}
                limitFilled={lFilled}
                marketBusy={isMarketActive === c}
                limitBusy={isDynamicActive === c}
                cancelMarketBusy={cancelBusy === `${c}-market`}
                cancelLimitBusy={cancelLBusy}
                marketAddedQty={mAddedQty}
                limitAddedQty={lAddedQty}
                onActivateMarket={() => activateMarket(c, marketUsd, marketPriceEffective)}
                onActivateLimit={() => activateLimitDynamic(c, dynUsd, dynPriceEffective)}
                onCancelMarket={st?.market?.id ? () => handleCancelMarket(
                  st.market.id,
                  symU,
                  Number(st.market.quantity ?? 0),
                  Number(st.market.amount_usd ?? 0),
                ) : undefined}
                onCancelLimit={st?.limit?.id ? () => handleCancelLimit(st.limit.id, symU) : undefined}
                onMarkExpired={st?.limit?.id ? () => handleMarkExpired(st.limit.id, symU) : undefined}
                onCopy={copy}
              />
              </div>
            );
          }

          // ===== ETH: nový side-by-side redesign =====
          if (c === 'eth') {
            return (
              <div key={c} className={`space-y-2 ${satDimCls}`}>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-violet-300">
                    Satellites · 7 tokenov
                  </span>
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    ${satAlloc.satelliteUsd.toFixed(0)} · relatívne skóre
                  </span>
                </div>
              <EthExecutionCard
                key={c}
                weightLabel={`${satPoolPct('eth').toFixed(1).replace('.', ',')}%`}
                coinUsd={coinUsd}
                reflowAdd={reflowAdd}
                baseCoinUsd={baseCoinUsd}
                heldQty={heldQty}
                price={price}
                sma200={null}
                smaDistPct={null}
                ema50={regimeMap?.eth?.ema50 ?? null}
                rsi14={typeof market?.eth?.rsi14 === 'number' ? market.eth.rsi14 : null}
                volatility30d={e.volatility30d}
                momentum30d={e.momentum30d}
                brakeState={brakeStates[c]}
                marketUsd={marketUsd}
                limitUsd={dynUsd}
                marketPrice={marketPriceEffective}
                limitPrice={dynPriceEffective}
                limitDiscountPct={atrDiscountPct}
                regimeLabel={regimeLabel}
                regimeReason={regimeReason}
                splitReason={splitReason}
                rationale={e.rationale}
                syncLabel={syncLabel}
                emergencyPaused={emergencyPaused}
                marketDone={mDone}
                limitPending={lPending}
                limitFilled={lFilled}
                marketBusy={isMarketActive === c}
                limitBusy={isDynamicActive === c}
                cancelMarketBusy={cancelBusy === `${c}-market`}
                cancelLimitBusy={cancelLBusy}
                marketAddedQty={mAddedQty}
                limitAddedQty={lAddedQty}
                onActivateMarket={() => activateMarket(c, marketUsd, marketPriceEffective)}
                onActivateLimit={() => activateLimitDynamic(c, dynUsd, dynPriceEffective)}
                onCancelMarket={st?.market?.id ? () => handleCancelMarket(
                  st.market.id,
                  symU,
                  Number(st.market.quantity ?? 0),
                  Number(st.market.amount_usd ?? 0),
                ) : undefined}
                onCancelLimit={st?.limit?.id ? () => handleCancelLimit(st.limit.id, symU) : undefined}
                onMarkExpired={st?.limit?.id ? () => handleMarkExpired(st.limit.id, symU) : undefined}
                onCopy={copy}
              />
              </div>
            );
          }

          // ===== SOL: nový side-by-side redesign =====
          if (c === 'sol') {
            return (
              <div key={c} className={satDimCls}>
              <SolExecutionCard
                key={c}
                weightLabel={`${satPoolPct('sol').toFixed(1).replace('.', ',')}%`}
                coinUsd={coinUsd}
                reflowAdd={reflowAdd}
                baseCoinUsd={baseCoinUsd}
                heldQty={heldQty}
                price={price}
                sma200={null}
                smaDistPct={null}
                ema50={regimeMap?.sol?.ema50 ?? null}
                rsi14={typeof market?.sol?.rsi14 === 'number' ? market.sol.rsi14 : null}
                volatility30d={e.volatility30d}
                momentum30d={e.momentum30d}
                brakeState={brakeStates[c]}
                marketUsd={marketUsd}
                limitUsd={dynUsd}
                marketPrice={marketPriceEffective}
                limitPrice={dynPriceEffective}
                limitDiscountPct={atrDiscountPct}
                regimeLabel={regimeLabel}
                regimeReason={regimeReason}
                splitReason={splitReason}
                rationale={e.rationale}
                syncLabel={syncLabel}
                emergencyPaused={emergencyPaused}
                marketDone={mDone}
                limitPending={lPending}
                limitFilled={lFilled}
                marketBusy={isMarketActive === c}
                limitBusy={isDynamicActive === c}
                cancelMarketBusy={cancelBusy === `${c}-market`}
                cancelLimitBusy={cancelLBusy}
                marketAddedQty={mAddedQty}
                limitAddedQty={lAddedQty}
                onActivateMarket={() => activateMarket(c, marketUsd, marketPriceEffective)}
                onActivateLimit={() => activateLimitDynamic(c, dynUsd, dynPriceEffective)}
                onCancelMarket={st?.market?.id ? () => handleCancelMarket(
                  st.market.id,
                  symU,
                  Number(st.market.quantity ?? 0),
                  Number(st.market.amount_usd ?? 0),
                ) : undefined}
                onCancelLimit={st?.limit?.id ? () => handleCancelLimit(st.limit.id, symU) : undefined}
                onMarkExpired={st?.limit?.id ? () => handleMarkExpired(st.limit.id, symU) : undefined}
                onCopy={copy}
              />
              </div>
            );
          }

          return (


            <div key={c} className="bg-secondary/40 rounded-lg p-2.5 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-foreground">{e.symbol}</span>
                  <span className="text-[9px] text-muted-foreground">váha {tokenLabel[c]} <span className="text-primary/80">· engine</span></span>
                  <span className="text-[9px] text-muted-foreground flex items-center gap-1">
                    <Clock className="w-2.5 h-2.5" /> Binance · {syncLabel}
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

              {/* SAFETY BRAKE badge — orange, priorita A override */}
              {brakeActive && (
                <div className="rounded-lg border border-orange-500/60 bg-orange-500/15 px-2 py-1.5 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-orange-300 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold text-orange-200 leading-tight">
                      {split.brake.reason}
                    </p>
                    <p className="text-[9px] text-orange-200/80 leading-snug mt-0.5">
                      {split.brake.detail}
                    </p>
                  </div>
                </div>
              )}


              {/* STATUS ROW — bubbles/badges like yield tokens.
                  BTC: distance from 200D SMA (%). ETH/SOL: 14D RSI.
                  + Green "V norme" / Orange "EXTRÉMNE PREHRIATÝ (Safety Brake Active)" badge. */}
              {(() => {
                let leftLabel = '';
                let leftValue = '';
                let secondaryLabel = '';
                let secondaryValue = '';
                let toneCls = 'bg-amber-500/10 text-amber-300 border-amber-500/40';
                if ((c as CoinKey) === 'btc') {
                  const d = btcSmaDistPct();
                  leftLabel = 'Δ 200D SMA';
                  leftValue = d === null ? (isLoading ? 'Načítavam...' : 'Dáta nedostupné') : `${d >= 0 ? '+' : ''}${d.toFixed(2)}%`;
                  secondaryLabel = 'Prah brzdy';
                  secondaryValue = '+40.0%';
                  if (d !== null) {
                    if (d > 40) toneCls = 'bg-orange-500/15 text-orange-300 border-orange-500/40';
                    else if (d > 30) toneCls = 'bg-amber-500/15 text-amber-300 border-amber-500/40';
                    else toneCls = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40';
                  }
                } else {
                  const rsi = (c as CoinKey) === 'eth' ? market?.eth?.rsi14 : market?.sol?.rsi14;
                  const hasRsi = typeof rsi === 'number' && Number.isFinite(rsi);
                  leftLabel = '14D RSI';
                  leftValue = hasRsi ? (rsi as number).toFixed(1) : (isLoading ? 'Načítavam...' : 'Dáta nedostupné');
                  const toOversold = hasRsi ? Math.max(0, (rsi as number) - 30) : null;
                  secondaryLabel = 'To Oversold (30)';
                  secondaryValue = toOversold !== null ? `${toOversold.toFixed(1)} pts` : (isLoading ? 'Načítavam...' : 'Dáta nedostupné');
                  if (hasRsi) {
                    const v = rsi as number;
                    if (v > 75) toneCls = 'bg-orange-500/15 text-orange-300 border-orange-500/40';
                    else if (v < 35) toneCls = 'bg-sky-500/15 text-sky-300 border-sky-500/40';
                    else if (v > 65) toneCls = 'bg-amber-500/15 text-amber-300 border-amber-500/40';
                    else toneCls = 'bg-emerald-500/10 text-emerald-300 border-emerald-500/40';
                  }
                }
                const statusBadge = brakeActive
                  ? { cls: 'bg-orange-500/20 text-orange-200 ring-orange-500/50', text: 'EXTRÉMNE PREHRIATÝ (Safety Brake Active)' }
                  : { cls: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40', text: 'V norme' };
                return (
                  <div className="space-y-1">
                    <div className={`rounded border ${toneCls} px-2 py-1 flex items-center justify-between gap-2 text-[10px] tabular-nums`}>
                      <span className="font-semibold">
                        {leftLabel}: <span className="font-bold">{leftValue}</span>
                      </span>
                      <span className="font-semibold">
                        {secondaryLabel}: <span className="font-bold">{secondaryValue}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <span className={`inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ring-1 ${statusBadge.cls}`}>
                        {statusBadge.text}
                      </span>
                    </div>
                  </div>
                );
              })()}


              {/* PER-TOKEN MKT / LMT SLIDER BAR — continuous gearbox (BTC: F&G+200WMA · ETH/SOL: 50D EMA) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[9px] tabular-nums">
                  <span className="font-bold text-emerald-300">MKT {marketPct}%</span>
                  <span className="text-muted-foreground uppercase tracking-wide">
                    {(c as CoinKey) === 'btc'
                      ? `F&G ${split.fgContrib >= 0 ? '+' : ''}${split.fgContrib.toFixed(1)} · WMA ${split.wmaContrib >= 0 ? '+' : ''}${split.wmaContrib.toFixed(1)}`
                      : `EMA Δ ${split.emaDiffPct >= 0 ? '+' : ''}${split.emaDiffPct.toFixed(2)}%`}
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
                  {reflowAdd > 0.01 && (
                    <p className="text-[9px] text-emerald-300">
                      +${reflowAdd.toFixed(2)} yield reflow (base ${baseCoinUsd.toFixed(2)})
                    </p>
                  )}
                  <p className="text-[9px] text-muted-foreground">
                    vlastním: <span className="text-foreground tabular-nums font-semibold">{qtyFmt(heldQty)} {e.symbol}</span>
                  </p>
                </div>
                <p className="text-sm font-bold text-foreground tabular-nums">
                  ${coinUsd.toFixed(2)}
                </p>
              </div>

              {/* Funding source UI removed — single source of truth is Weekly Investment */}


              {totalInsufficient && (
                <div className="rounded-lg border border-rose-500/50 bg-rose-500/10 px-2.5 py-2 flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-300 mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] font-semibold text-rose-200 leading-snug">
                    Nedostatočný týždenný rozpočet (alokácia tokenu je 0 USD)
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
                      : `LIMIT DYNAMIC · ${dynamicPct}% · ${regimeLabel} −${atrDiscountPct.toFixed(1)}%`,
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
                  const brakeBlocked = card.mode === 'market' && brakeActive;
                  const cardDisabled = isMerged || card.usd <= 0 || brakeBlocked;
                  // Per-card busy reads from its OWN independent state hook.
                  const cardBusy = card.mode === 'market'
                    ? isMarketActive === c
                    : isDynamicActive === c;
                  const cardBg = isMerged
                    ? 'bg-sky-500/5 ring-1 ring-sky-500/40 opacity-80'
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
                        <div className="mt-0.5">
                          <span className="inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40">
                            Merged: Min Order Rule
                          </span>
                          <p className="text-[10px] text-sky-200/90 leading-snug mt-1">
                            Smer: <span className="font-bold">{card.mode === 'dynamic' ? 'MARKET' : 'LIMIT DYNAMIC'}</span> · {mergeReason}
                          </p>
                        </div>
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
                                  onClick={() => copy(card.effPrice.toFixed((c as CoinKey) === 'btc' ? 2 : 4))}
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
                                  current.toFixed((c as CoinKey) === 'btc' ? 0 : 2),
                                );
                                if (input === null) return;
                                const v = Number(input);
                                if (!Number.isFinite(v) || v <= 0) { toast.error('Neplatná cena'); return; }
                                setEditedPrices(prev => ({
                                  ...prev,
                                  [c]: { ...(prev[c as CoinKey] ?? {}), [card.mode]: v },
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
                              if (card.mode === 'market') {
                                activateMarket(c, card.usd, card.effPrice);
                              } else {
                                activateLimitDynamic(c, card.usd, card.effPrice);
                              }

                            }}
                            disabled={emergencyPaused || card.isFilled || card.isPending || cardBusy || cardDisabled || card.effPrice <= 0}
                            className={`mt-1.5 w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 disabled:opacity-70 ${
                              brakeBlocked ? 'bg-muted text-muted-foreground cursor-not-allowed'
                              : card.isFilled ? 'bg-emerald-500 text-background'
                              : card.isPending ? (triggered ? 'bg-emerald-500 text-background' : 'bg-amber-500 text-background')
                              : cardBusy ? (card.mode === 'market' ? 'bg-emerald-600 text-background' : 'bg-primary/80 text-background')
                              : (card.mode === 'market'
                                ? 'bg-emerald-500 text-background'
                                : (triggered ? 'bg-emerald-500 text-background' : 'bg-primary text-primary-foreground'))
                            }`}
                          >
                            {card.isFilled ? <><Check className="w-3 h-3" /> Aktivované</>
                              : card.isPending ? <><Check className="w-3 h-3" /> Aktivované {card.mode === 'dynamic' ? '(7d)' : ''}</>
                              : cardBusy ? 'Aktivujem…'
                              : (card.mode === 'market'
                                ? <><ShoppingCart className="w-3 h-3" /> Aktivovať Market</>
                                : 'Aktivovať Limit Dynamic')}
                          </button>
                          {brakeBlocked && (
                            <p className="mt-1 text-[9px] font-semibold leading-tight text-orange-300">
                              Market nákupy sú zablokované kvôli Safety Brake
                            </p>
                          )}
                          {card.mode === 'market' && card.isFilled && st?.market?.id && (
                            <div className="mt-1">
                              <button
                                onClick={() => handleCancelMarket(
                                  st.market.id,
                                  symU,
                                  Number(st.market.quantity ?? 0),
                                  Number(st.market.amount_usd ?? 0),
                                )}
                                disabled={cancelBusy === `${c}-market`}
                                className="w-full px-2 py-1 rounded text-[10px] font-bold flex items-center justify-center gap-1 bg-rose-500/20 text-rose-400 hover:bg-rose-500/30 active:scale-95 disabled:opacity-70"
                                title="Zrušiť Market a vrátiť hodnoty z portfólia"
                              >
                                <X className="w-3 h-3" /> Zrušiť
                              </button>
                            </div>
                          )}
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

              <div className="space-y-1">
                <p className="text-[10px] text-foreground/90 leading-snug bg-background/40 rounded px-2 py-1.5 border-l-2 border-primary/60">
                  <span className="font-bold text-primary">Prečo limit? </span>
                  {regimeReason}
                </p>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  <span className="font-semibold text-foreground/80">Split: </span>
                  {splitReason} {e.rationale}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* SATELLITE EXECUTION SECTION — dimmed + overlay pri BTC-ONLY override */}
      <div className={`relative space-y-3 ${satDimCls}`}>
      {btcOnly && (
        <div className="sticky top-2 z-10 flex justify-center pointer-events-none">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/50 bg-amber-500/15 backdrop-blur px-3 py-1 text-[10px] font-bold text-amber-200 shadow-lg">
            <PauseCircle className="w-3.5 h-3.5" />
            ⏸️ Satellites Paused — 100 % Capital routed to BTC Override
          </span>
        </div>
      )}

      {/* YIELD TOKENS · Execution — rovnaká matematika ako BTC/ETH/SOL, read-only (bez DB) */}
      {/* AUTO-GENEROVANÉ SATELITY — pre každý token pridaný v Portfóliu.
          Duplikáty vylučuje useDynamicSatellites (built-in tickery + dedup). */}
      {(['SATELLITES', 'HIGH_BETA', 'PROXY'] as const).map((b) => {
        const metric = (key: string) => satAlloc.bySatellite?.[key];
        // Automatické radenie podľa kompozitnej Value Weight (najlepšia hodnota prvé).
        const list = dynamicSats.filter((ds) => ds.basket === b).sort((a, z) =>
          (metric(z.key)?.weight ?? 0) - (metric(a.key)?.weight ?? 0));
        if (list.length === 0) return null;
        return (
          <section key={b} className="space-y-3 border-t border-border pt-3">
            <div className="space-y-2 px-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-foreground">{BASKET_LABELS[b]} · {effectiveBasketPct[b].toFixed(1)}%</h3>
                <span className="text-[9px] text-muted-foreground">{list.map((x) => x.symbol).join(' · ')}</span>
              </div>
              <div className="flex items-center justify-between rounded border border-border bg-secondary/30 px-2 py-1 text-[9px]">
                <span className="uppercase tracking-wide text-muted-foreground">Rozpočet koša</span>
                <span className="font-bold tabular-nums text-foreground">{effectiveBasketPct[b].toFixed(1)}% · ${satAlloc.basketUsd[b].toFixed(2)}</span>
              </div>
            </div>
            {b === 'SATELLITES' && (satAlloc.cascade?.highBetaToSatellitesUsd ?? 0) > 0.01 && (
              <div className="rounded border border-primary/40 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">
                +${satAlloc.cascade.highBetaToSatellitesUsd.toFixed(2)} presmerované z High-Beta (všetky tokeny zamietnuté)
              </div>
            )}
            {list.map((ds) => (
              <GenericSatelliteExecutionCard
                key={ds.key}
                symbol={ds.symbol}
                name={ds.name}
                cgId={ds.cgId}
                imageUrl={ds.imageUrl}
                weightPct={basketLocalPct[ds.key] ?? 0}
                allocUsd={satUsd(ds.key)}
                weeklyBudgetUsd={investableUsd}
                satelliteScore={satAlloc.bySatellite?.[ds.key]?.score}
                emergencyPaused={emergencyPaused}
                filterStatus={satAlloc.bySatellite?.[ds.key]?.status}
                redirectedUsd={satAlloc.bySatellite?.[ds.key]?.redirectedUsd ?? 0}
                sieve={satAlloc.bySatellite?.[ds.key]?.sieve}
                baselineUsd={satAlloc.bySatellite?.[ds.key]?.baselineUsd ?? 0}
                recipients={satAlloc.satelliteList
                  .filter((r) => r.basket === b && r.status === 'approved' && r.redirectedUsd > 0.005)
                  .map((r) => ({ symbol: r.label, usd: r.redirectedUsd }))}
                onCopy={copy}
              />
            ))}
          </section>
        );
      })}

      </div>
    </div>
  );
}

// ============================================================================
// YIELD TOKENS EXECUTION (LINK, HYPE, AAVE)
// Homogénny model: rovnaké vzorce ako calcUnifiedExecution, len bez DB/edge fn.
// ============================================================================

function YieldTokensExecution({
  score,
  weeklyBudgetUsd,
  onCopy,
  precomputedAllocations,
  yieldBucketUsd: bucketUsdProp,
  yieldWeightPct,
  reflowUsd: reflowUsdProp,
  tokenWeightsPct,
  satShares,
  hiddenSymbols,
}: {

  score: number;
  weeklyBudgetUsd: number;
  onCopy: (t: string) => void;
  precomputedAllocations?: ReturnType<typeof computeYieldAllocations>;
  yieldBucketUsd?: number;
  yieldWeightPct?: number;
  reflowUsd?: number;
  tokenWeightsPct?: { btc: number; eth: number; sol: number };
  /** Presné podiely/fiat zo satelitného koša (jediný zdroj pravdy). */
  satShares?: Partial<Record<'link' | 'aave' | 'hype', { sharePct: number; usd: number } | undefined>>;
  /** Tokeny odstránené v Portfóliu — ich karty sa nevykreslia. */
  hiddenSymbols?: readonly string[];

}) {

  const { engine } = useMarketEngine();
  const { data: yieldMetrics, isLoading } = useYieldTokenMetrics();
  const { states: brakeStates } = useSafetyBrakeBoost();
  const addTx = useAddTokenTransaction();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const yieldWeight = yieldWeightPct ?? engine.yieldWeight ?? 0;
  const yieldBucketUsd = bucketUsdProp ?? (weeklyBudgetUsd * yieldWeight) / 100;
  const localAllocations = useMemo(
    () => computeYieldAllocations(yieldBucketUsd, yieldMetrics),
    [yieldBucketUsd, yieldMetrics],
  );
  const allocations = precomputedAllocations ?? localAllocations;

  const activateYield = async (
    mode: 'market' | 'limit',
    a: { coingeckoId: string; symbol: string },
    qty: number,
    price: number,
  ) => {
    if (a.symbol === '' /* placeholder guard */) return;
    const key = `${a.coingeckoId}-${mode}`;
    if (busyKey) return;
    if (qty <= 0 || price <= 0) { toast.error('Neplatná cena/množstvo'); return; }
    setBusyKey(key);
    try {
      await addTx.mutateAsync({
        coingecko_id: a.coingeckoId,
        symbol: a.symbol,
        side: 'buy',
        quantity: qty,
        price_usd: price,
        note: mode === 'market' ? 'DCA Market (yield)' : 'DCA Limit Dynamic (yield)',
      });
      toast.success(
        mode === 'market'
          ? `✅ ${a.symbol} MARKET zapísaný do portfólia`
          : `✅ ${a.symbol} LIMIT DYNAMIC zapísaný do portfólia`,
      );
    } catch (e) {
      toast.error('Chyba: ' + (e as Error).message);
    } finally {
      setBusyKey(null);
    }
  };


  if (yieldWeight === 0) {
    return (
      <div className="mt-3 rounded-lg border border-dashed border-emerald-500/30 bg-emerald-500/5 p-2.5">
        <p className="text-[10px] text-emerald-300/80 flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          Satelitný kôš 0 % — 5 faktorov (defensive / distribution) blokujú altcoin nákupy.
        </p>
      </div>
    );
  }

  const removed = new Set((hiddenSymbols ?? []).map((x) => String(x).toUpperCase()));
  const active = allocations.filter(a => a.active && !removed.has(String(a.symbol).toUpperCase()));
  const usedUsd = active.reduce((s, a) => s + a.usd, 0);
  const reflowUsd = reflowUsdProp ?? Math.max(0, yieldBucketUsd - usedUsd);
  const tw = tokenWeightsPct ?? { btc: 0, eth: 0, sol: 0 };
  const totalYieldTokens = allocations.length;

  const coreWeight = tw.btc;
  const satWeight = tw.eth + tw.sol;
  const coreSatSum = coreWeight + satWeight;
  const reflowCorePct = coreSatSum > 0 ? (coreWeight / coreSatSum) * 100 : 0;
  const reflowSatPct = coreSatSum > 0 ? (satWeight / coreSatSum) * 100 : 0;



  return (
    <div className="space-y-2">
      {isLoading && (
        <p className="text-[10px] text-muted-foreground">Načítavam RSI/momentum/vol pre yield tokeny…</p>
      )}

      {active.length === 0 && !isLoading && reflowUsd > 0 && (
        <div className="rounded-lg border border-border/60 bg-secondary/30 px-3 py-2.5 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 text-primary flex-shrink-0 mt-0.5" />
          <p className="text-[10px] leading-snug text-foreground/90">
            Žiadny satelit nevyhovuje filtru. Presúvam kapitál:{' '}
            <span className="font-bold tabular-nums">{reflowCorePct.toFixed(0)}%</span> do CORE a{' '}
            <span className="font-bold tabular-nums">{reflowSatPct.toFixed(0)}%</span> do SATELITOV.
          </p>
        </div>
      )}

      {active.length === 0 && !isLoading && reflowUsd <= 0 && (
        <div className="rounded-lg border border-dashed border-border/40 bg-secondary/20 px-3 py-2 text-[10px] text-muted-foreground">
          Žiadny satelit nevyhovuje filtru. Žiadny kapitál na presun.
        </div>
      )}






      {reflowUsd > 0 && active.length > 0 && (
        <p className="text-[9px] text-muted-foreground/80 italic">
          Reflow ${reflowUsd.toFixed(0)} → CORE/SATELLITES (zvyšok pod prahom konvikcie).
        </p>
      )}

      <div className="grid gap-2">
        {active.map((a0) => {
          // ── JEDINÝ ZDROJ PRAVDY ──
          // Fiat aj % podiel prichádzajú z satelitného koša (satShares).
          // Lokálna S^2 matematika sa už nepoužíva na alokáciu.
          const ov = satShares?.[a0.symbol.toLowerCase() as 'link' | 'aave' | 'hype'];
          const allocUsd = ov ? ov.usd : a0.usd;
          const poolSharePct = ov ? ov.sharePct : a0.weight * 100;
          const a = { ...a0, usd: allocUsd, weight: poolSharePct / 100 };
          const exec = computeYieldExecution(a, score);
          const bb = brakeStates[a.symbol.toLowerCase() as 'hype' | 'link' | 'aave'];
          // Brake & Boost: multiplier IBA na MKT sumu, LMT zostáva nedotknutý.
          const bbMarketUsd = Math.round(exec.marketUsd * (bb?.multiplier ?? 1) * 100) / 100;
          const ns = NETWORK_STYLE[a.network];


          // ===== HYPE: nový redesign karty =====
          if (a.symbol.toUpperCase() === 'HYPE') {
            return (
              <HypeExecutionCard
                key={a.id}
                bucketSharePct={poolSharePct}
                allocationUsd={allocUsd}
                weightRaw={Math.pow(Math.max(a.score, 0) / 10, 2.5) / 10}
                weeklySharePct={poolSharePct}
                score={a.score}
                rsi14Fallback={a.rsi14}
                priceVsSmaPct={a.priceVsSmaPct}
                fundamentalYield={a.fundamentalYield}
                fundamentalNote={a.fundamentalNote}
                priceFallback={a.price}
                entryReason={a.entryReason}
                hitCount={a.hitCount}
                merged={exec.merged}
                mergeReason={exec.mergeReason}
                brakeState={brakeStates[a.symbol.toLowerCase() as 'hype' | 'link' | 'aave']}
                marketBusy={busyKey === `${a.coingeckoId}-market`}
                limitBusy={busyKey === `${a.coingeckoId}-limit`}
                onActivateMarket={(_usd, qty, price) => activateYield('market', a, qty, price)}
                onActivateLimit={(_usd, qty, price) => activateYield('limit', a, qty, price)}
                onCopy={onCopy}
              />
            );
          }

          // ===== LINK / AAVE: Bloomberg-style redesign =====
          if (['LINK', 'AAVE'].includes(a.symbol.toUpperCase())) {
            return (
              <YieldTokenExecutionCard
                key={a.id}
                symbol={a.symbol}
                networkLabel={ns.label}
                bucketSharePct={poolSharePct}
                allocationUsd={allocUsd}
                weightRaw={Math.pow(Math.max(a.score, 0) / 10, 2.5) / 10}
                weeklySharePct={poolSharePct}
                score={a.score}
                rsi14Fallback={a.rsi14}
                priceVsSmaPct={a.priceVsSmaPct}
                fundamentalYield={a.fundamentalYield}
                priceFallback={a.price}
                entryReason={a.entryReason}
                hitCount={a.hitCount}
                marketPct={exec.marketPct}
                limitPct={exec.limitPct}
                marketUsd={bbMarketUsd}
                limitUsd={exec.limitUsd}
                limitPrice={exec.limitPrice}
                limitDistancePct={exec.limitDistancePct}
                merged={exec.merged}
                mergeReason={exec.mergeReason}
                brakeState={brakeStates[a.symbol.toLowerCase() as 'hype' | 'link' | 'aave']}
                marketBusy={busyKey === `${a.coingeckoId}-market`}
                limitBusy={busyKey === `${a.coingeckoId}-limit`}
                onActivateMarket={(_usd, qty, price) => activateYield('market', a, qty, price)}
                onActivateLimit={(_usd, qty, price) => activateYield('limit', a, qty, price)}
                onCopy={onCopy}
              />
            );
          }



          return (
            <div key={a.id} className="rounded-lg bg-background/40 ring-1 ring-emerald-500/20 p-2 space-y-1.5">

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-bold text-emerald-200">{a.symbol}</span>
                  <span className={`px-1.5 py-0.5 rounded border text-[9px] font-semibold ${ns.chip}`}>
                    {ns.label}
                  </span>
                  <span className="text-[9px] text-muted-foreground tabular-nums truncate">
                    S {a.score.toFixed(0)} · RSI {a.rsi14.toFixed(0)} · MA {a.priceVsSmaPct >= 0 ? '+' : ''}{a.priceVsSmaPct.toFixed(1)}% · vol {a.volatility14d.toFixed(1)}%
                  </span>
                </div>
                <span className="text-[10px] tabular-nums font-bold text-foreground shrink-0">
                  ${a.usd.toFixed(0)} <span className="font-normal text-muted-foreground">({(a.weight * 100).toFixed(1)}%)</span>
                </span>
              </div>
              <p className="text-[9px] text-emerald-300/90 leading-snug">
                <span className="font-bold uppercase tracking-wide">Entry Signal:</span> {a.entryReason} · <span className="text-muted-foreground">{a.hitCount}/3 podmienok</span>
              </p>
              {exec.safetyBrake && (
                <div className="rounded border border-orange-500/60 bg-orange-500/15 px-2 py-1 flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-orange-300 flex-shrink-0 mt-0.5" />
                  <p className="text-[9px] font-bold text-orange-200 leading-snug">
                    EXTRÉMNE PREHRIATY (Safety Brake Active) · {exec.safetyBrakeReason}
                  </p>
                </div>
              )}
              {exec.merged && (
                <span className="inline-block text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40">
                  Merged: Min Order Rule — {exec.mergeReason}
                </span>
              )}
              {exec.merged && exec.mergedInto === 'market' ? (
                <div className="w-full rounded bg-emerald-500/20 p-1.5">
                  <p className="text-[9px] text-emerald-300 font-bold uppercase">Market · 100% (merged) <span className="text-emerald-300/70 font-normal normal-case">(RSI {a.rsi14.toFixed(0)})</span></p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-foreground tabular-nums">${exec.marketUsd.toFixed(2)}</p>
                    <button onClick={() => onCopy(exec.marketUsd.toFixed(2))} title="Kopíruj USD sumu" className="p-0.5 rounded hover:bg-emerald-500/30 active:scale-90"><Copy className="w-3 h-3 text-emerald-200" /></button>
                  </div>
                  {a.price > 0 && (
                    <div className="flex items-center gap-1.5">
                      <p className="text-[9px] text-muted-foreground tabular-nums">@ spot ${a.price >= 1 ? a.price.toFixed(2) : a.price.toFixed(4)}</p>
                      <button onClick={() => onCopy(a.price.toFixed(a.price >= 1 ? 2 : 4))} title="Kopíruj spot cenu" className="p-0.5 rounded hover:bg-emerald-500/30 active:scale-90"><Copy className="w-3 h-3 text-emerald-200/80" /></button>
                    </div>
                  )}
                </div>
              ) : exec.merged && exec.mergedInto === 'limit' ? (
                <div className="w-full rounded bg-primary/20 p-1.5">
                  <p className="text-[9px] text-primary font-bold uppercase">Limit · 100% (merged) · {exec.limitDistancePct.toFixed(1)}%</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-foreground tabular-nums">${exec.limitUsd.toFixed(2)}</p>
                    <button onClick={() => onCopy(exec.limitUsd.toFixed(2))} title="Kopíruj USD sumu" className="p-0.5 rounded hover:bg-primary/30 active:scale-90"><Copy className="w-3 h-3 text-primary" /></button>
                  </div>
                  {exec.limitPrice > 0 && (
                    <div className="flex items-center gap-1.5">
                      <p className="text-[9px] text-muted-foreground tabular-nums">@ ${exec.limitPrice >= 1 ? exec.limitPrice.toFixed(2) : exec.limitPrice.toFixed(4)}</p>
                      <button onClick={() => onCopy(exec.limitPrice.toFixed(exec.limitPrice >= 1 ? 2 : 4))} title="Kopíruj cieľovú cenu" className="p-0.5 rounded hover:bg-primary/30 active:scale-90"><Copy className="w-3 h-3 text-primary" /></button>
                    </div>
                  )}
                  <p className="text-[9px] text-primary/80 font-semibold mt-0.5">2.0× ATR pod spot</p>
                </div>
              ) : (
              <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="rounded bg-emerald-500/15 p-1.5">
                  <p className="text-[9px] text-emerald-300 font-bold uppercase">Market · {exec.marketPct}% <span className="text-emerald-300/70 font-normal normal-case">(RSI {a.rsi14.toFixed(0)})</span></p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-foreground tabular-nums">${exec.marketUsd.toFixed(2)}</p>
                    <button onClick={() => onCopy(exec.marketUsd.toFixed(2))} title="Kopíruj USD sumu" className="p-0.5 rounded hover:bg-emerald-500/30 active:scale-90"><Copy className="w-3 h-3 text-emerald-200" /></button>
                  </div>
                  {a.price > 0 && (
                    <div className="flex items-center gap-1.5">
                      <p className="text-[9px] text-muted-foreground tabular-nums">@ spot ${a.price >= 1 ? a.price.toFixed(2) : a.price.toFixed(4)}</p>
                      <button onClick={() => onCopy(a.price.toFixed(a.price >= 1 ? 2 : 4))} title="Kopíruj spot cenu" className="p-0.5 rounded hover:bg-emerald-500/30 active:scale-90"><Copy className="w-3 h-3 text-emerald-200/80" /></button>
                    </div>
                  )}
                </div>
                <div className="rounded bg-primary/15 p-1.5">
                  <p className="text-[9px] text-primary font-bold uppercase">Limit · {exec.limitPct}% · {exec.limitDistancePct.toFixed(1)}%</p>
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-bold text-foreground tabular-nums">${exec.limitUsd.toFixed(2)}</p>
                    <button onClick={() => onCopy(exec.limitUsd.toFixed(2))} title="Kopíruj USD sumu" className="p-0.5 rounded hover:bg-primary/30 active:scale-90"><Copy className="w-3 h-3 text-primary" /></button>
                  </div>
                  {exec.limitPrice > 0 && (
                    <div className="flex items-center gap-1.5">
                      <p className="text-[9px] text-muted-foreground tabular-nums">@ ${exec.limitPrice >= 1 ? exec.limitPrice.toFixed(2) : exec.limitPrice.toFixed(4)}</p>
                      <button onClick={() => onCopy(exec.limitPrice.toFixed(exec.limitPrice >= 1 ? 2 : 4))} title="Kopíruj cieľovú cenu" className="p-0.5 rounded hover:bg-primary/30 active:scale-90"><Copy className="w-3 h-3 text-primary" /></button>
                    </div>
                  )}
                  <p className="text-[9px] text-primary/80 font-semibold mt-0.5">2.0× ATR pod spot</p>
                </div>
              </div>
              )}

              {/* ACTIVATION BUTTONS — parity s BTC/ETH/SOL */}
              {(() => {
                const marketKey = `${a.coingeckoId}-market`;
                const limitKey = `${a.coingeckoId}-limit`;
                const marketQty = a.price > 0 ? exec.marketUsd / a.price : 0;
                const limitQty = exec.limitPrice > 0 ? exec.limitUsd / exec.limitPrice : 0;
                const canMarket = exec.marketUsd > 0 && a.price > 0;
                const canLimit = exec.limitUsd > 0 && exec.limitPrice > 0;
                return (
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      disabled={!canMarket || busyKey === marketKey || addTx.isPending}
                      onClick={() => activateYield('market', a, marketQty, a.price)}
                      className="rounded bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold text-[10px] uppercase tracking-wide px-2 py-1.5 flex items-center justify-center gap-1 active:scale-95"
                      title={`Aktivovať MARKET · ${marketQty.toFixed(4)} ${a.symbol}`}
                    >
                      <ShoppingCart className="w-3 h-3" />
                      {busyKey === marketKey ? '…' : 'Aktivovať Market'}
                    </button>
                    <button
                      disabled={!canLimit || busyKey === limitKey || addTx.isPending}
                      onClick={() => activateYield('limit', a, limitQty, exec.limitPrice)}
                      className="rounded bg-primary hover:bg-primary/80 disabled:opacity-40 disabled:cursor-not-allowed text-primary-foreground font-bold text-[10px] uppercase tracking-wide px-2 py-1.5 flex items-center justify-center gap-1 active:scale-95"
                      title={`Aktivovať LIMIT DYNAMIC · ${limitQty.toFixed(4)} ${a.symbol} @ $${exec.limitPrice.toFixed(exec.limitPrice >= 1 ? 2 : 4)}`}
                    >
                      <Clock className="w-3 h-3" />
                      {busyKey === limitKey ? '…' : 'Aktivovať Limit Dynamic'}
                    </button>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {active.length > 0 && (
        <p className="text-[9px] text-muted-foreground italic leading-snug">
          Žiadny vylučovací filter — všetky yield tokeny sú trvalo v alokačnom poole.
          Váha = skóre^2.5 (dynamicky podľa RSI · MA · fundamentu).
        </p>
      )}



    </div>
  );
}

