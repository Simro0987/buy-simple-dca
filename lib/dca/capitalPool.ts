import { roundUsd } from "@/lib/dca/math";

/** Unified spendable pool — Dostupný Kapitál. */
export function computeAvailableCapital(options: {
  undeployedUsd: number;
  leftoverWaterfallUsd: number;
  brakeBoostReserveDelta: number;
  cashUsd: number;
  executionImpactUsd: number;
}): number {
  return roundUsd(
    Math.max(0, options.undeployedUsd) +
      Math.max(0, options.leftoverWaterfallUsd) +
      options.brakeBoostReserveDelta +
      Math.max(0, options.cashUsd) +
      options.executionImpactUsd,
  );
}
