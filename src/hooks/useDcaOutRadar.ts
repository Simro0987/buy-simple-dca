/**
 * useDcaOutRadar — Algoritmický DCA-Out Radar
 *
 * Data sources (100% free-tier, no API key):
 *  • Binance daily klines  → RSI(14) + live price
 *  • alternative.me/fng    → Fear & Greed Index
 *
 * Logic:
 *  • 4 trigger scenarios (A/B/C/D) based on F&G + RSI
 *  • PnL Guard: sell only if position ≥ +20% above DCA price
 *  • Moon-Bag Guard: never sell last 15% of holdings
 *  • Cascade Cooldown: next signal only after +5% price recovery
 */
import { useQuery } from '@tanstack/react-query';
import { loadHoldingsRecord } from '@/lib/portfolioRealHoldings';

export type DcaToken = 'BTC' | 'ETH' | 'SOL';

// ─── token routing config ─────────────────────────────────────────────────────

interface TokenRoute {
  symbol:        DcaToken;
  binancePair:   string;
  holdingsKey:   string;
  moonBagPct:    number;
  sources:       string[];
}

const ROUTES: TokenRoute[] = [
  {
    symbol: 'BTC', binancePair: 'BTCUSDT', holdingsKey: 'btc',
    moonBagPct: 0.15,
    sources: ['Hardware Wallet (Native BTC)'],
  },
  {
    symbol: 'ETH', binancePair: 'ETHUSDT', holdingsKey: 'eth',
    moonBagPct: 0.15,
    sources: ['Natívne ETH', 'rETH (Rocket Pool)', 'wstETH / weETH (ether.fi – Arbitrum)'],
  },
  {
    symbol: 'SOL', binancePair: 'SOLUSDT', holdingsKey: 'sol',
    moonBagPct: 0.15,
    sources: ['Natívne SOL', 'Marinade Native', 'INF (Sanctum)'],
  },
];

// ─── localStorage keys ────────────────────────────────────────────────────────

export const DCA_PRICES_KEY  = 'dca-out-avg-prices-v1';
export const COOLDOWN_KEY    = 'dca-out-cooldown-v1';

// ─── persistence helpers ──────────────────────────────────────────────────────

export function loadDcaPrices(): Record<DcaToken, number> {
  try {
    const s = JSON.parse(localStorage.getItem(DCA_PRICES_KEY) || '{}');
    return { BTC: 0, ETH: 0, SOL: 0, ...s };
  } catch { return { BTC: 0, ETH: 0, SOL: 0 }; }
}

export function saveDcaPrices(p: Record<DcaToken, number>) {
  try { localStorage.setItem(DCA_PRICES_KEY, JSON.stringify(p)); } catch { /* quota */ }
}

export function loadCooldown(): Record<DcaToken, number> {
  try { return JSON.parse(localStorage.getItem(COOLDOWN_KEY) || '{}'); } catch { return {} as Record<DcaToken, number>; }
}

export function saveCooldown(c: Record<DcaToken, number>) {
  try { localStorage.setItem(COOLDOWN_KEY, JSON.stringify(c)); } catch { /* quota */ }
}

export function triggerCooldown(symbol: DcaToken, priceAtSell: number) {
  const c = loadCooldown();
  (c as Record<string, number>)[symbol] = priceAtSell;
  saveCooldown(c);
}

export function resetCooldown(symbol: DcaToken) {
  const c = loadCooldown();
  delete (c as Record<string, number>)[symbol];
  saveCooldown(c);
}

function loadHoldings(): Record<string, number> {
  return loadHoldingsRecord() as Record<string, number>;
}

// ─── RSI(14) from daily closes ────────────────────────────────────────────────

function computeRSI(closes: number[]): number {
  const period = 14;
  if (closes.length < period + 1) return 50;
  const slice = closes.slice(-(period + 1));
  let gains = 0, losses = 0;
  for (let i = 1; i < slice.length; i++) {
    const d = slice[i] - slice[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 99;
  return Math.round(Math.max(0, Math.min(100, 100 - 100 / (1 + avgGain / avgLoss))));
}

// ─── fetch helpers ────────────────────────────────────────────────────────────

async function withTimeout(url: string, ms = 10_000): Promise<Response> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try   { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

async function fetchTokenData(pair: string): Promise<{ price: number; rsi: number }> {
  const url = `https://api.binance.com/api/v3/klines?symbol=${pair}&interval=1d&limit=30`;
  const res = await withTimeout(url);
  if (!res.ok) throw new Error(`Binance ${pair}: ${res.status}`);
  const raw = await res.json() as Array<[number, string, string, string, string, string, ...unknown[]]>;
  const closes = raw.map(k => parseFloat(k[4]));
  return { price: closes[closes.length - 1], rsi: computeRSI(closes) };
}

async function fetchFearGreed(): Promise<number> {
  try {
    const res  = await withTimeout('https://api.alternative.me/fng/?limit=1', 8_000);
    const json = await res.json() as { data: Array<{ value: string }> };
    return parseInt(json.data[0].value, 10);
  } catch { return 50; }
}

// ─── trigger matrix ───────────────────────────────────────────────────────────

type Scenario = 'A' | 'B' | 'C' | 'D';

function evaluate(rsi: number, fg: number): { scenario: Scenario | null; sellPct: number; label: string } {
  if (fg > 85)          return { scenario: 'D', sellPct: 15, label: `Scenár D · Extrémne FOMO (F&G ${fg})` };
  if (fg >= 70)         return { scenario: 'C', sellPct: 10, label: `Scenár C · Vysoká eufória (F&G ${fg})` };
  if (fg >= 55)         return { scenario: 'B', sellPct: 5,  label: `Scenár B · Mierna eufória (F&G ${fg})` };
  if (fg < 55 && rsi > 75) return { scenario: 'A', sellPct: rsi > 82 ? 10 : 5, label: `Scenár A · Lokálna pumpa (RSI ${rsi})` };
  return { scenario: null, sellPct: 0, label: '' };
}

// ─── signal type ──────────────────────────────────────────────────────────────

export interface DcaOutSignal {
  symbol:              DcaToken;
  currentPrice:        number;
  dcaPrice:            number;
  holdings:            number;
  rsi:                 number;
  fearGreed:           number;
  pnlPct:              number;
  pnlUsd:              number;
  pnlGuardPassed:      boolean;   // pnlPct >= +20%
  moonBagGuardPassed:  boolean;   // sell qty ≤ 85% of holdings
  cooldownActive:      boolean;   // waiting for +5% recovery
  cooldownPrice:       number;    // price at which sell was triggered
  scenario:            Scenario | null;
  sellPct:             number;    // 0 = HOLD
  sellQty:             number;    // exact quantity to sell
  status:              'ACCUMULATE' | 'HOLD' | 'SELL';
  triggerLabel:        string;
  sources:             string[];
}

// ─── raw fetch bundle ─────────────────────────────────────────────────────────

async function fetchAll(): Promise<{ tokens: Array<{ symbol: DcaToken; price: number; rsi: number }>; fg: number }> {
  const [btc, eth, sol, fg] = await Promise.allSettled([
    fetchTokenData('BTCUSDT'),
    fetchTokenData('ETHUSDT'),
    fetchTokenData('SOLUSDT'),
    fetchFearGreed(),
  ]);
  return {
    tokens: [
      { symbol: 'BTC', price: btc.status === 'fulfilled' ? btc.value.price : 0, rsi: btc.status === 'fulfilled' ? btc.value.rsi : 50 },
      { symbol: 'ETH', price: eth.status === 'fulfilled' ? eth.value.price : 0, rsi: eth.status === 'fulfilled' ? eth.value.rsi : 50 },
      { symbol: 'SOL', price: sol.status === 'fulfilled' ? sol.value.price : 0, rsi: sol.status === 'fulfilled' ? sol.value.rsi : 50 },
    ],
    fg: fg.status === 'fulfilled' ? fg.value : 50,
  };
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useDcaOutRadar(dcaPrices: Record<DcaToken, number>) {
  const { data, isLoading, refetch } = useQuery({
    queryKey:        ['dca-out-radar'],
    queryFn:         fetchAll,
    staleTime:       5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    retry: 2,
    retryDelay: (a) => Math.min(2000 * 2 ** a, 15_000),
  });

  const holdings = loadHoldings();
  const cooldown = loadCooldown();

  const signals: DcaOutSignal[] = ROUTES.map(route => {
    const td   = data?.tokens.find(t => t.symbol === route.symbol);
    const fg   = data?.fg ?? 50;
    const price = td?.price ?? 0;
    const rsi   = td?.rsi  ?? 50;
    const dcaP  = dcaPrices[route.symbol] ?? 0;
    const hold  = Number(holdings[route.holdingsKey] ?? 0) || 0;

    const pnlPct = dcaP > 0 && price > 0 ? ((price - dcaP) / dcaP) * 100 : 0;
    const pnlUsd = hold * (price - dcaP);

    const pnlGuardPassed = dcaP > 0 && pnlPct >= 20;

    const { scenario, sellPct, label: triggerLabel } = evaluate(rsi, fg);
    const rawSellQty = hold * (sellPct / 100);
    const maxSellQty = hold * (1 - route.moonBagPct);
    const sellQty    = Math.min(rawSellQty, maxSellQty);
    const moonBagGuardPassed = sellQty > 0 && rawSellQty <= maxSellQty;

    const cdPrice      = (cooldown as Record<string, number>)[route.symbol] ?? 0;
    const cooldownActive = cdPrice > 0 && price < cdPrice * 1.05;

    const status: DcaOutSignal['status'] =
      !pnlGuardPassed                                  ? 'ACCUMULATE' :
      !scenario || cooldownActive || sellPct === 0     ? 'HOLD' :
      !moonBagGuardPassed                              ? 'HOLD' :
                                                         'SELL';

    return {
      symbol: route.symbol,
      currentPrice: price, dcaPrice: dcaP,
      holdings: hold, rsi, fearGreed: fg,
      pnlPct, pnlUsd, pnlGuardPassed,
      moonBagGuardPassed, cooldownActive, cooldownPrice: cdPrice,
      scenario, sellPct, sellQty,
      status,
      triggerLabel: status === 'SELL' ? triggerLabel : '',
      sources: route.sources,
    };
  });

  return { signals, fearGreed: data?.fg ?? 50, isLoading, refetch: () => { void refetch(); } };
}
