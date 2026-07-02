import { describe, it, expect } from 'vitest';
import {
  evaluateOverbought,
  resolveExecutionSplit,
  octagonMarketPct,
  executionSplitFromOctagon,
  MIN_LIMIT_USD,
  RSI_OVERBOUGHT,
  EMA_OVEREXTENSION_PCT,
  OCTAGON_LOW_MARKET_PCT,
  OCTAGON_HIGH_MARKET_PCT,
  VOL_BASELINE_PCT,
} from './dynamicExecution';

describe('evaluateOverbought', () => {
  it('flags overbought when RSI is strictly above the threshold', () => {
    const r = evaluateOverbought({ rsi: RSI_OVERBOUGHT + 5, priceVsEma50Pct: 2 });
    expect(r.overbought).toBe(true);
    expect(r.hasSignal).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/RSI/);
  });

  it('does NOT flag overbought when RSI equals the threshold (strictly greater)', () => {
    const r = evaluateOverbought({ rsi: RSI_OVERBOUGHT, priceVsEma50Pct: 0 });
    expect(r.overbought).toBe(false);
  });

  it('flags overbought when price is strongly overextended above the 50D EMA', () => {
    const r = evaluateOverbought({ rsi: 55, priceVsEma50Pct: EMA_OVEREXTENSION_PCT + 1 });
    expect(r.overbought).toBe(true);
    expect(r.reasons.join(' ')).toMatch(/EMA/);
  });

  it('treats neutral / oversold readings as NOT overbought', () => {
    expect(evaluateOverbought({ rsi: 45, priceVsEma50Pct: -8 }).overbought).toBe(false);
    expect(evaluateOverbought({ rsi: 28, priceVsEma50Pct: 3 }).overbought).toBe(false);
  });

  it('defaults to NOT overbought (execute) when no indicators are available', () => {
    const r = evaluateOverbought({ rsi: null, priceVsEma50Pct: null });
    expect(r.overbought).toBe(false);
    expect(r.hasSignal).toBe(false);
  });

  it('ignores non-finite indicator values', () => {
    const r = evaluateOverbought({ rsi: Number.NaN, priceVsEma50Pct: Number.POSITIVE_INFINITY });
    expect(r.hasSignal).toBe(false);
    expect(r.overbought).toBe(false);
  });
});

describe('resolveExecutionSplit', () => {
  it('keeps both orders when the Limit slice clears the minimum', () => {
    const r = resolveExecutionSplit(60, 40, false);
    expect(r.merged).toBe(false);
    expect(r.routing).toBeNull();
    expect(r.marketUsd).toBe(60);
    expect(r.dynUsd).toBe(40);
  });

  it('does NOT merge when the Limit slice equals the minimum (strictly less triggers merge)', () => {
    const r = resolveExecutionSplit(90, MIN_LIMIT_USD, false);
    expect(r.merged).toBe(false);
    expect(r.dynUsd).toBe(MIN_LIMIT_USD);
  });

  it('Rule B: merges into a single MARKET order when Limit < $10 and NOT overbought', () => {
    const r = resolveExecutionSplit(20, 5, false);
    expect(r.merged).toBe(true);
    expect(r.routing).toBe('market');
    expect(r.marketUsd).toBe(25);
    expect(r.dynUsd).toBe(0);
  });

  it('Rule A: merges into a single LIMIT order when Limit < $10 and overbought', () => {
    const r = resolveExecutionSplit(20, 5, true);
    expect(r.merged).toBe(true);
    expect(r.routing).toBe('limit');
    expect(r.dynUsd).toBe(25);
    expect(r.marketUsd).toBe(0);
  });

  it('allows a Market order of any (sub-$10) amount — no market minimum', () => {
    const r = resolveExecutionSplit(3, 2, false);
    expect(r.merged).toBe(true);
    expect(r.routing).toBe('market');
    expect(r.marketUsd).toBe(5);
  });

  it('returns an empty split when there is no budget', () => {
    const r = resolveExecutionSplit(0, 0, false);
    expect(r.merged).toBe(false);
    expect(r.marketUsd).toBe(0);
    expect(r.dynUsd).toBe(0);
  });
});

describe('octagonMarketPct (sliding scale)', () => {
  it('hits the low anchor: score 10 → 30% market', () => {
    expect(octagonMarketPct(10)).toBe(OCTAGON_LOW_MARKET_PCT);
  });

  it('hits the high anchor: score 80 → 100% market', () => {
    expect(octagonMarketPct(80)).toBe(OCTAGON_HIGH_MARKET_PCT);
  });

  it('is monotonic and gradual between anchors (no step jumps)', () => {
    const a = octagonMarketPct(30);
    const b = octagonMarketPct(50);
    const c = octagonMarketPct(70);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    // linear midpoint: score 50 → ~70% market
    expect(b).toBeCloseTo(70, 5);
  });

  it('clamps below the low anchor and above the high anchor', () => {
    expect(octagonMarketPct(0)).toBe(OCTAGON_LOW_MARKET_PCT);
    expect(octagonMarketPct(100)).toBe(OCTAGON_HIGH_MARKET_PCT);
  });

  it('defaults to a neutral score when input is not finite', () => {
    expect(octagonMarketPct(Number.NaN)).toBe(octagonMarketPct(50));
  });
});

describe('executionSplitFromOctagon', () => {
  it('uses the octagon base with a neutral volatility (no tilt)', () => {
    const r = executionSplitFromOctagon(50, VOL_BASELINE_PCT);
    expect(r.volTiltPp).toBe(0);
    expect(r.marketPct).toBe(70);
    expect(r.limitPct).toBe(30);
    expect(r.octagonMarketPct).toBe(70);
  });

  it('low octagon favours LIMIT (≈30/70) to catch deep wicks', () => {
    const r = executionSplitFromOctagon(10, VOL_BASELINE_PCT);
    expect(r.marketPct).toBe(30);
    expect(r.limitPct).toBe(70);
  });

  it('high octagon favours MARKET (100/0) so we do not miss the run', () => {
    const r = executionSplitFromOctagon(85, VOL_BASELINE_PCT);
    expect(r.marketPct).toBe(100);
    expect(r.limitPct).toBe(0);
  });

  it('higher volatility tilts toward MARKET (bounded)', () => {
    const neutral = executionSplitFromOctagon(50, VOL_BASELINE_PCT).marketPct;
    const highVol = executionSplitFromOctagon(50, VOL_BASELINE_PCT + 10).marketPct;
    expect(highVol).toBeGreaterThan(neutral);
    // Market always stays within [30, 100]
    expect(highVol).toBeLessThanOrEqual(100);
    expect(executionSplitFromOctagon(10, 0).marketPct).toBeGreaterThanOrEqual(30);
  });
});
