/**
 * Strategies decide only HOW MUCH to buy and WHEN. They never touch keys or addresses;
 * execution limits are enforced again by the runner and, finally, on-chain by AgentSwapModule.
 *
 * Reuses the web app's existing, pure logic so the server agent and the UI agree:
 *  - src/lib/rsi.ts               (Wilder RSI(14) - single source of truth)
 *  - src/lib/safetyBrakeBoost.ts  (STOP / REDUCE / NORMAL / BOOST / DEEP_BOOST multiplier)
 */
import { wilderRsi } from '../../src/lib/rsi';
import { evaluateBrakeBoost, type BrakeBoostState } from '../../src/lib/safetyBrakeBoost';
import type { AgentSpec } from './config';

export interface StrategyDecision {
  amountUsd: number;
  reason: string;
  signal?: Pick<BrakeBoostState, 'mode' | 'multiplier' | 'rsi14' | 'ma200DistPct' | 'evaluated'>;
}

export interface DailyIndicators {
  price: number;
  rsi14: number;
  ma200: number;
}

export type IndicatorSource = (symbol: string) => Promise<DailyIndicators | null>;

export function indicatorsFromCloses(closes: number[]): DailyIndicators | null {
  const v = closes.filter((n) => Number.isFinite(n) && n > 0);
  if (v.length < 200) return null;
  const last200 = v.slice(-200);
  return {
    price: v[v.length - 1],
    rsi14: wilderRsi(v.slice(-120)),
    ma200: last200.reduce((a, b) => a + b, 0) / 200,
  };
}

/** Public market data (Binance daily candles). Used ONLY as a signal; never for execution pricing. */
export function binanceIndicatorSource(fetchImpl: typeof fetch = fetch): IndicatorSource {
  const cache = new Map<string, { at: number; value: DailyIndicators | null }>();
  return async (symbol) => {
    const hit = cache.get(symbol);
    if (hit && Date.now() - hit.at < 60 * 60 * 1000) return hit.value;
    try {
      const res = await fetchImpl(
        `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=260`,
        { signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as unknown[][];
      const value = indicatorsFromCloses(rows.map((r) => Number(r[4])));
      cache.set(symbol, { at: Date.now(), value });
      return value;
    } catch {
      return null;
    }
  };
}

export async function decide(spec: AgentSpec, indicators: IndicatorSource): Promise<StrategyDecision> {
  if (spec.strategy === 'dca') {
    return { amountUsd: spec.amountUsd, reason: `DCA ${spec.amountUsd} USD` };
  }
  // dca-brake-boost
  const ind = spec.indicatorSymbol ? await indicators(spec.indicatorSymbol) : null;
  const token = spec.indicatorToken || (spec.indicatorSymbol ?? '').replace(/USDT?$/, '').toLowerCase();
  const bb = evaluateBrakeBoost(token, ind);
  // Missing data -> the shared engine returns NORMAL (x1). Server side we are more conservative:
  // never BOOST without data.
  const multiplier = bb.evaluated ? bb.multiplier : 1;
  return {
    amountUsd: spec.amountUsd * multiplier,
    reason: `${bb.mode} x${multiplier}: ${bb.reason}`,
    signal: { mode: bb.mode, multiplier, rsi14: bb.rsi14, ma200DistPct: bb.ma200DistPct, evaluated: bb.evaluated },
  };
}
