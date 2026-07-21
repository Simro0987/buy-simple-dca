import { clamp, lerpScore } from "@/lib/dcaTechnicalIndicators";
import type { MacroRegime } from "@/lib/ultimateDcaEngine";

export const BEAR_MIN_CORE_PERCENT = 50;

export interface BucketRatioSet {
  core: number;
  satellite: number;
  yield: number;
}

const REGIME_BASE: Record<MacroRegime, BucketRatioSet> = {
  CAPITULATION: { core: 68, satellite: 27, yield: 5 },
  BEAR: { core: 62, satellite: 30, yield: 8 },
  SIDEWAYS: { core: 57, satellite: 33, yield: 10 },
  BULL: { core: 52, satellite: 35, yield: 13 },
  EUPHORIA: { core: 48, satellite: 38, yield: 14 },
};

const REGIME_BADGE: Record<MacroRegime, string> = {
  CAPITULATION: "CAPITULATION • Defenzívny Core bias",
  BEAR: "BEAR • Akumulačný Core bias",
  SIDEWAYS: "BALANCED • Vyvážená alokácia",
  BULL: "BULL • Rastový satellite bias",
  EUPHORIA: "EUPHORIA • Yield & satellite tilt",
};

function normalizeRatios(ratios: BucketRatioSet): BucketRatioSet {
  const total = ratios.core + ratios.satellite + ratios.yield;
  if (total <= 0) {
    return { core: 57, satellite: 33, yield: 10 };
  }

  return {
    core: Math.round((ratios.core / total) * 1000) / 10,
    satellite: Math.round((ratios.satellite / total) * 1000) / 10,
    yield: Math.round((ratios.yield / total) * 1000) / 10,
  };
}

/**
 * BEAR accumulation bias: Core (BTC) never falls below 50%.
 * Deficit is taken proportionally from Satellites and Yield.
 */
export function enforceBearCoreFloor(
  regime: MacroRegime,
  ratios: BucketRatioSet,
): BucketRatioSet {
  if (regime !== "BEAR" || ratios.core >= BEAR_MIN_CORE_PERCENT) {
    return ratios;
  }

  const deficit = BEAR_MIN_CORE_PERCENT - ratios.core;
  const nonCoreTotal = ratios.satellite + ratios.yield;

  if (nonCoreTotal <= 0) {
    return { core: BEAR_MIN_CORE_PERCENT, satellite: 0, yield: 0 };
  }

  const satelliteShare = ratios.satellite / nonCoreTotal;
  const yieldShare = ratios.yield / nonCoreTotal;

  return normalizeRatios({
    core: BEAR_MIN_CORE_PERCENT,
    satellite: Math.max(0, ratios.satellite - deficit * satelliteShare),
    yield: Math.max(0, ratios.yield - deficit * yieldShare),
  });
}

/**
 * Dynamic Core / Satellites / Yield split from macro regime + final score.
 * Low score (cheap market) shifts weight toward Core; high score toward Yield/Sat.
 */
export function computeDynamicBucketRatios(
  regime: MacroRegime,
  finalScore: number,
): BucketRatioSet {
  const base = REGIME_BASE[regime];
  const score = clamp(finalScore, 0, 100);

  const coreAdj = lerpScore(score, 0, 100, 6, -9);
  const satAdj = lerpScore(score, 0, 100, -2, 4);
  const yieldAdj = lerpScore(score, 0, 100, -4, 5);

  return enforceBearCoreFloor(
    regime,
    normalizeRatios({
      core: base.core + coreAdj,
      satellite: base.satellite + satAdj,
      yield: base.yield + yieldAdj,
    }),
  );
}

export function getBucketBadgeTitle(regime: MacroRegime): string {
  return REGIME_BADGE[regime];
}
