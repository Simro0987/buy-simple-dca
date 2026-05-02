// Self-learning DCA engine tick.
// Beží v pondelok 06:00 (cron). Vyhodnotí posledný DCA týždeň, vypočíta odmenu
// (kombinácia avg price delta 7D + fill-rate v cieľovom pásme 60-80%) a posunie
// adaptívne parametre o max ±10% týmto smerom.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface CoinPrice { current: number; weekAgo: number | null }

async function fetchCoinPriceHistory(coinId: string): Promise<CoinPrice> {
  // CoinGecko market_chart for 8 days, take current and ~7 days back
  const url = `https://api.coingecko.com/api/v3/coins/${coinId}/market_chart?vs_currency=usd&days=8&interval=daily`;
  const res = await fetch(url);
  if (!res.ok) return { current: 0, weekAgo: null };
  const json = await res.json();
  const prices: [number, number][] = json.prices ?? [];
  if (prices.length < 2) return { current: 0, weekAgo: null };
  const current = prices[prices.length - 1][1];
  const weekAgo = prices[0][1];
  return { current, weekAgo };
}

const COIN_IDS = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana' } as const;
type Coin = keyof typeof COIN_IDS;

/**
 * Reward function: kombinácia
 *   1) priceDelta7d: ak je cena po 7d vyššia, market bol dobrý → reward záleží od ratio market/limit
 *   2) fillRate v pásme 60-80 % je optimum → bonus +20, mimo pásma penalizácia
 * Vracia hodnotu -100..+100.
 */
function computeReward(avgDelta: number, avgFill: number): number {
  // delta v % — clamp
  const d = Math.max(-30, Math.min(30, avgDelta));
  const deltaPart = (d / 30) * 60; // -60..+60
  // fill rate sweet spot 70 %
  const distFromTarget = Math.abs(avgFill - 70);
  const fillPart = 40 - distFromTarget * 1.0; // max +40, klesá lineárne
  return Math.max(-100, Math.min(100, Math.round(deltaPart + fillPart)));
}

interface ChangeEntry { param: string; from: number; to: number; reason: string }

function nudge(value: number, direction: number, maxStepPct: number, min?: number, max?: number): number {
  // direction: -1..+1
  const step = (Math.abs(value) || 1) * (maxStepPct / 100) * direction;
  let next = value + step;
  if (typeof min === 'number') next = Math.max(min, next);
  if (typeof max === 'number') next = Math.min(max, next);
  return Math.round(next * 100) / 100;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1) Load engine params
    const { data: params, error: pErr } = await supabase
      .from('engine_params').select('*').eq('id', 1).maybeSingle();
    if (pErr) throw pErr;
    if (!params) throw new Error('engine_params row missing');
    if (!params.enabled) {
      return new Response(JSON.stringify({ skipped: 'engine disabled' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Load posledný DCA nákup (referenčný týždeň)
    const { data: lastPurchase } = await supabase
      .from('dca_purchases').select('*').order('week_number', { ascending: false }).limit(1).maybeSingle();
    if (!lastPurchase) {
      return new Response(JSON.stringify({ skipped: 'no DCA history yet' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // skip ak sme už tento týždeň vyhodnotili
    const { data: existingOutcome } = await supabase
      .from('learning_outcomes').select('id').eq('week_number', lastPurchase.week_number).maybeSingle();
    if (existingOutcome) {
      return new Response(JSON.stringify({ skipped: 'already evaluated this week', week: lastPurchase.week_number }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3) Aktuálne ceny + ceny pred týždňom z CoinGecko
    const [btcP, ethP, solP] = await Promise.all([
      fetchCoinPriceHistory(COIN_IDS.btc),
      fetchCoinPriceHistory(COIN_IDS.eth),
      fetchCoinPriceHistory(COIN_IDS.sol),
    ]);

    const buyPrices: Record<Coin, number> = {
      btc: Number(lastPurchase.btc_price) || 0,
      eth: Number(lastPurchase.eth_price) || 0,
      sol: Number(lastPurchase.sol_price) || 0,
    };
    const currentPrices: Record<Coin, number> = {
      btc: btcP.current, eth: ethP.current, sol: solP.current,
    };

    // 4) Fill-rate per coin: % limit orderov ktoré sa vyplnili pre tento week
    const { data: limitOrders } = await supabase
      .from('limit_orders').select('coin, status').eq('week_number', lastPurchase.week_number);

    const fillRate: Record<Coin, number> = { btc: 70, eth: 70, sol: 70 };
    for (const c of ['btc', 'eth', 'sol'] as Coin[]) {
      const coinOrders = (limitOrders ?? []).filter((o: { coin: string }) => o.coin?.toLowerCase() === c);
      if (coinOrders.length > 0) {
        const filled = coinOrders.filter((o: { status: string }) => o.status === 'FILLED').length;
        fillRate[c] = Math.round((filled / coinOrders.length) * 100);
      }
    }

    // 5) per coin výsledky + agregát
    const perCoin: Record<string, { avg_buy: number; price_after_7d: number; fill_rate: number; price_delta_pct: number }> = {};
    let deltaSum = 0, deltaCount = 0, fillSum = 0;
    for (const c of ['btc', 'eth', 'sol'] as Coin[]) {
      const buy = buyPrices[c];
      const now = currentPrices[c];
      const delta = buy > 0 && now > 0 ? ((now / buy) - 1) * 100 : 0;
      perCoin[c] = {
        avg_buy: buy,
        price_after_7d: now,
        fill_rate: fillRate[c],
        price_delta_pct: Math.round(delta * 100) / 100,
      };
      if (buy > 0 && now > 0) { deltaSum += delta; deltaCount++; }
      fillSum += fillRate[c];
    }
    const avgDelta = deltaCount > 0 ? deltaSum / deltaCount : 0;
    const avgFill = fillSum / 3;
    const reward = computeReward(avgDelta, avgFill);

    // 6) Posun parametrov pod\u013ea reward
    // - reward > 0 → tento smer bol dobr\u00fd, mierne posilni
    // - reward < 0 → opa\u010dn\u00fd smer
    // Heuristika: ak avgDelta > 0 (kupovali sme lacno), zv\u00fd\u0161 limit% (v\u010di\u0161\u00ed distance bol dobr\u00fd)
    //             ak avgDelta < 0 (cena klesla po n\u00e1kupe), zv\u00fd\u0161 market% v base (rýchlej\u0161ie zachytenie poklesu)
    // Fill rate: < 60 → posun distance bli\u017e\u0161ie (m\u00e9nej negat\u00edvne); > 80 → posun \u010falej (viac negat\u00edvne)
    const changes: ChangeEntry[] = [];
    const maxStep = Number(params.max_step_pct) || 10;
    const updates: Record<string, number> = {};

    // Distance fix according to fill-rate
    if (avgFill < 60) {
      // Limity sa nepln\u00ed → posu\u0148 distance bli\u017e\u0161ie k 0 (m\u00e9nej negat\u00edvne)
      const v = Number(params.base_distance_high);
      const next = nudge(v, -1, maxStep / 2, -10, -2); // -1 nudge: -6.5 → -5.85
      // pozor: v je negat\u00edvne, "bli\u017e\u0161ie k 0" = + smer
      const next2 = Math.round(Math.max(-10, Math.min(-2, v + Math.abs(v) * (maxStep / 100))) * 100) / 100;
      if (next2 !== v) {
        updates.base_distance_high = next2;
        changes.push({ param: 'base_distance_high', from: v, to: next2, reason: `Fill rate ${avgFill.toFixed(0)}% < 60% → distance bli\u017e\u0161ie` });
      }
    } else if (avgFill > 80) {
      const v = Number(params.base_distance_high);
      const next2 = Math.round(Math.max(-10, Math.min(-2, v - Math.abs(v) * (maxStep / 100))) * 100) / 100;
      if (next2 !== v) {
        updates.base_distance_high = next2;
        changes.push({ param: 'base_distance_high', from: v, to: next2, reason: `Fill rate ${avgFill.toFixed(0)}% > 80% → distance \u0161ir\u0161\u00ed` });
      }
    }

    // Market split tuning according to delta
    if (avgDelta < -2) {
      // Cena klesla po n\u00e1kupe — chceli sme menej market, viac limit
      const v = Number(params.base_market_low);
      const next = nudge(v, -1, maxStep, 15, 50);
      if (next !== v) {
        updates.base_market_low = next;
        changes.push({ param: 'base_market_low', from: v, to: next, reason: `Cena -${Math.abs(avgDelta).toFixed(1)}% po 7d → menej market pri vysokom score` });
      }
    } else if (avgDelta > 2) {
      // Cena vzrástla — market bol dobrý, mierne posilni
      const v = Number(params.base_market_high);
      const next = nudge(v, +0.5, maxStep, 60, 95);
      if (next !== v) {
        updates.base_market_high = next;
        changes.push({ param: 'base_market_high', from: v, to: next, reason: `Cena +${avgDelta.toFixed(1)}% po 7d → viac market pri n\u00edzkom score` });
      }
    }

    // Sensitivity tuning podľa overall reward
    if (reward < -30) {
      const v = Number(params.momentum_sensitivity);
      const next = nudge(v, -1, maxStep, 0.2, 1.5);
      if (next !== v) {
        updates.momentum_sensitivity = next;
        changes.push({ param: 'momentum_sensitivity', from: v, to: next, reason: `Reward ${reward} → znížená citlivosť na momentum` });
      }
    } else if (reward > 30) {
      const v = Number(params.momentum_sensitivity);
      const next = nudge(v, +0.5, maxStep, 0.2, 1.5);
      if (next !== v) {
        updates.momentum_sensitivity = next;
        changes.push({ param: 'momentum_sensitivity', from: v, to: next, reason: `Reward ${reward} → posilnená citlivosť na momentum` });
      }
    }

    // 7) Insert outcome
    await supabase.from('learning_outcomes').insert({
      week_number: lastPurchase.week_number,
      params_snapshot: params,
      per_coin_results: perCoin,
      avg_price_delta_7d: Math.round(avgDelta * 100) / 100,
      avg_fill_rate: Math.round(avgFill * 100) / 100,
      reward_score: reward,
      notes: changes.length === 0 ? 'V parametroch nedošlo k zmene.' : `${changes.length} úprav.`,
    });

    // 8) Update params (ak nejaké zmeny)
    if (Object.keys(updates).length > 0 || true) {
      await supabase.from('engine_params').update({
        ...updates,
        iteration: (params.iteration ?? 0) + 1,
        last_reward: reward,
        last_change_log: changes,
      }).eq('id', 1);
    }

    return new Response(JSON.stringify({
      ok: true,
      week: lastPurchase.week_number,
      avgDelta: Math.round(avgDelta * 100) / 100,
      avgFill: Math.round(avgFill * 100) / 100,
      reward,
      changes,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('learning-engine-tick error:', e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
