import type { DcaSymbol } from "@/lib/dca/types";

export const FALLING_KNIFE_RSI_ENTER = 15;
export const FALLING_KNIFE_RSI_RESUME = 25;
/** Deeply below 200D SMA — continuous “knife” zone, not a jump table. */
export const FALLING_KNIFE_SMA_DEV = -18;

export const FALLING_KNIFE_BADGE = "Zastavené: Padajúca dýka (Čaká sa na dno)";

export function isDeeplyBelowSma200(sma200DevPct: number): boolean {
  return Number.isFinite(sma200DevPct) && sma200DevPct <= FALLING_KNIFE_SMA_DEV;
}

export function evaluateFallingKnife(options: {
  rsi: number;
  sma200DevPct: number;
  latched: boolean;
}): { active: boolean; shouldLatch: boolean; shouldClear: boolean } {
  const rsi = Number.isFinite(options.rsi) ? options.rsi : 50;
  const deep = isDeeplyBelowSma200(options.sma200DevPct);
  const enter = rsi < FALLING_KNIFE_RSI_ENTER && deep;
  const resume = rsi > FALLING_KNIFE_RSI_RESUME;
  if (enter) {
    return { active: true, shouldLatch: true, shouldClear: false };
  }
  if (options.latched && !resume) {
    return { active: true, shouldLatch: true, shouldClear: false };
  }
  return { active: false, shouldLatch: false, shouldClear: options.latched && resume };
}

export function nextKnifeLatches(
  current: Partial<Record<DcaSymbol, boolean>>,
  updates: Array<{ symbol: DcaSymbol; shouldLatch: boolean; shouldClear: boolean }>,
): Partial<Record<DcaSymbol, boolean>> {
  const next = { ...current };
  for (const row of updates) {
    if (row.shouldClear) delete next[row.symbol];
    else if (row.shouldLatch) next[row.symbol] = true;
  }
  return next;
}
