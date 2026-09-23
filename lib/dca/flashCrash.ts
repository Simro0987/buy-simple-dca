import { clamp, roundUsd } from "@/lib/dca/math";
import type { DcaSymbol, FlashCrashPlan, FlashCrashTarget, TokenExecutionPlan } from "@/lib/dca/types";

export const FLASH_CRASH_BTC_DROP = -15;
export const FLASH_CRASH_CONFLUENCE = 25;
export const FLASH_CRASH_POOL_SHARE = 0.3;

export function detectFlashCrash(options: {
  btcChange24h: number;
  confluence: number;
  forced?: boolean;
}): boolean {
  if (options.forced) return true;
  return (
    options.btcChange24h <= FLASH_CRASH_BTC_DROP ||
    options.confluence < FLASH_CRASH_CONFLUENCE
  );
}

export function buildFlashCrashPlan(options: {
  active: boolean;
  availableCapital: number;
  plans: TokenExecutionPlan[];
}): FlashCrashPlan {
  const pool = Math.max(0, options.availableCapital);
  const spendUsd = roundUsd(pool * FLASH_CRASH_POOL_SHARE);
  if (!options.active || spendUsd <= 0) {
    return { active: options.active, spendUsd: 0, poolShare: FLASH_CRASH_POOL_SHARE * 100, targets: [] };
  }

  const candidates = options.plans.filter(
    (plan) =>
      plan.gate.passed &&
      plan.price > 0 &&
      !plan.fallingKnife &&
      (plan.ema50DevPct < 0 || plan.sma200DevPct < 0 || plan.rsi < 45),
  );
  const usable = candidates.length > 0
    ? candidates
    : options.plans.filter((plan) => plan.price > 0 && plan.gate.passed && !plan.fallingKnife);

  const weights = usable.map((plan) => ({
    plan,
    weight: Math.max(1, 100 - plan.rsi),
  }));
  const sum = weights.reduce((acc, row) => acc + row.weight, 0);
  const targets: FlashCrashTarget[] = [];
  let allocated = 0;
  weights.forEach((row, index) => {
    const usd =
      index === weights.length - 1
        ? roundUsd(spendUsd - allocated)
        : roundUsd(spendUsd * (row.weight / Math.max(sum, 1)));
    allocated = roundUsd(allocated + usd);
    targets.push({
      symbol: row.plan.symbol as DcaSymbol,
      usd,
      price: row.plan.price,
      qty: row.plan.price > 0 ? usd / row.plan.price : 0,
    });
  });

  return {
    active: true,
    spendUsd,
    poolShare: clamp(FLASH_CRASH_POOL_SHARE * 100, 0, 100),
    targets,
  };
}
