import { computeRsiS2BlendFactor } from "@/lib/rsiInterpolation";

export const MAX_POSITION_BOOST_PCT = 15;
export const NEUTRAL_RSI_LOW = 40;
export const NEUTRAL_RSI_HIGH = 60;
export const OVERSOLD_RSI_LEVEL = 30;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Position-size multiplier for the limit leg (1.0 = 100 % base allocation).
 * Neutral RSI 40–60 → 1.0. Oversold + S2 conviction → up to +15 %.
 */
export function computePositionSizeMultiplier(
  rsi: number,
  blendFactor?: number,
): number {
  const value = clamp(rsi, 0, 100);
  const blend = blendFactor ?? computeRsiS2BlendFactor(value);

  if (value >= NEUTRAL_RSI_LOW && value <= NEUTRAL_RSI_HIGH) {
    return 1;
  }

  if (value > NEUTRAL_RSI_HIGH) {
    return 1;
  }

  if (value > OVERSOLD_RSI_LEVEL) {
    const ramp =
      (NEUTRAL_RSI_LOW - value) / (NEUTRAL_RSI_LOW - OVERSOLD_RSI_LEVEL);
    const conviction = ramp * blend;
    if (conviction <= 0) return 1;
    return round2(1 + (MAX_POSITION_BOOST_PCT / 100) * conviction);
  }

  const s2Conviction = Math.max(blend, 0.5);
  return round2(1 + (MAX_POSITION_BOOST_PCT / 100) * s2Conviction);
}

export function computePositionBoostPct(multiplier: number): number {
  if (multiplier <= 1) return 0;
  return Math.round((multiplier - 1) * 1000) / 10;
}

export function buildPositionSizingNarrative(boostPct: number): string | null {
  if (boostPct <= 0) return null;
  const rounded = Math.round(boostPct);
  return (
    `Vzhľadom na silne prepredaný trh bola navrhovaná nákupná suma dynamicky navýšená o ${rounded} % ` +
    "pre maximalizáciu zisku z tohto poklesu."
  );
}

export function applyPositionSizeToLimitUsd(
  baseLimitUsd: number,
  rsi: number | null,
  blendFactor: number,
): {
  limitUsd: number;
  multiplier: number;
  boostPct: number;
} {
  if (baseLimitUsd <= 0 || rsi == null) {
    return { limitUsd: baseLimitUsd, multiplier: 1, boostPct: 0 };
  }

  const multiplier = computePositionSizeMultiplier(rsi, blendFactor);
  const boostPct = computePositionBoostPct(multiplier);

  return {
    limitUsd: round2(baseLimitUsd * multiplier),
    multiplier,
    boostPct,
  };
}
