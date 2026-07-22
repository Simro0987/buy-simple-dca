import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";

export const EXECUTION_PERFORMANCE_STORAGE_KEY = "bsdca-execution-performance";
export const EXECUTION_PERFORMANCE_UPDATED_EVENT =
  "bsdca-execution-performance-updated";

export interface ExecutionPerformanceEntry {
  id: string;
  symbol: string;
  leg: "market" | "limit";
  amountUsd: number;
  priceUsd: number;
  quantity: number;
  executedAt: string;
  weekKey: string;
  minOrderMergeActive: boolean;
  mergedExecutionRoute: "market" | "limit" | null;
  routerReasoning: string | null;
  octagonScore: number;
  marketAvg7d: number;
  rewardScore: number;
}

function notifyUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EXECUTION_PERFORMANCE_UPDATED_EVENT));
}

function weekKeyFromDate(date = new Date()): string {
  const utc = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function readExecutionPerformanceLog(): ExecutionPerformanceEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EXECUTION_PERFORMANCE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ExecutionPerformanceEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeExecutionPerformanceLog(
  entries: ExecutionPerformanceEntry[],
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    EXECUTION_PERFORMANCE_STORAGE_KEY,
    JSON.stringify(entries.slice(0, 200)),
  );
}

function computeEntryRewardScore(input: {
  leg: "market" | "limit";
  priceUsd: number;
  marketAvg7d: number;
  minOrderMergeActive: boolean;
  mergedExecutionRoute: "market" | "limit" | null;
}): number {
  if (input.marketAvg7d <= 0 || input.priceUsd <= 0) return 0;
  const vs7dPct =
    ((input.marketAvg7d - input.priceUsd) / input.marketAvg7d) * 100;

  if (input.leg === "market") {
    return Math.round(clamp(vs7dPct * 8, -100, 100));
  }

  const limitEdge = vs7dPct > 0 ? vs7dPct * 6 : vs7dPct * 3;
  const mergeBonus = input.minOrderMergeActive ? 8 : 0;
  return Math.round(clamp(limitEdge + mergeBonus, -100, 100));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function appendExecutionPerformanceEntries(
  plans: TokenExecutionPlan[],
  octagonScores: Record<string, number>,
  marketAvg7dBySymbol: Record<string, number>,
): ExecutionPerformanceEntry[] {
  const now = new Date();
  const weekKey = weekKeyFromDate(now);
  const existing = readExecutionPerformanceLog();
  const nextEntries: ExecutionPerformanceEntry[] = [];

  for (const plan of plans) {
    const marketAvg7d = marketAvg7dBySymbol[plan.symbol] ?? plan.spotPrice;
    const octagonScore = octagonScores[plan.symbol] ?? 0;

    if (plan.marketUsd > 0 && plan.spotPrice > 0) {
      const priceUsd = plan.spotPrice;
      const quantity = plan.marketUsd / priceUsd;
      nextEntries.push({
        id: `exec-${plan.symbol}-market-${Date.now()}`,
        symbol: plan.symbol,
        leg: "market",
        amountUsd: plan.marketUsd,
        priceUsd,
        quantity,
        executedAt: now.toISOString(),
        weekKey,
        minOrderMergeActive: plan.minOrderMergeActive,
        mergedExecutionRoute: plan.mergedExecutionRoute,
        routerReasoning: plan.routerReasoning,
        octagonScore,
        marketAvg7d,
        rewardScore: computeEntryRewardScore({
          leg: "market",
          priceUsd,
          marketAvg7d,
          minOrderMergeActive: plan.minOrderMergeActive,
          mergedExecutionRoute: plan.mergedExecutionRoute,
        }),
      });
    }

    if (plan.limitUsd > 0 && plan.limitPrice > 0) {
      const priceUsd = plan.limitPrice;
      const quantity = plan.limitUsd / priceUsd;
      nextEntries.push({
        id: `exec-${plan.symbol}-limit-${Date.now()}`,
        symbol: plan.symbol,
        leg: "limit",
        amountUsd: plan.limitUsd,
        priceUsd,
        quantity,
        executedAt: now.toISOString(),
        weekKey,
        minOrderMergeActive: plan.minOrderMergeActive,
        mergedExecutionRoute: plan.mergedExecutionRoute,
        routerReasoning: plan.routerReasoning,
        octagonScore,
        marketAvg7d,
        rewardScore: computeEntryRewardScore({
          leg: "limit",
          priceUsd,
          marketAvg7d,
          minOrderMergeActive: plan.minOrderMergeActive,
          mergedExecutionRoute: plan.mergedExecutionRoute,
        }),
      });
    }
  }

  const merged = [...nextEntries, ...existing].slice(0, 200);
  writeExecutionPerformanceLog(merged);
  notifyUpdated();
  return merged;
}

export function appendSingleExecutionPerformanceEntry(input: {
  plan: TokenExecutionPlan;
  leg: "market" | "limit";
  octagonScore: number;
  marketAvg7d: number;
}): ExecutionPerformanceEntry[] {
  const { plan, leg } = input;
  const amountUsd = leg === "market" ? plan.marketUsd : plan.limitUsd;
  const priceUsd = leg === "market" ? plan.spotPrice : plan.limitPrice;
  if (amountUsd <= 0 || priceUsd <= 0) return readExecutionPerformanceLog();

  const now = new Date();
  const entry: ExecutionPerformanceEntry = {
    id: `exec-${plan.symbol}-${leg}-${Date.now()}`,
    symbol: plan.symbol,
    leg,
    amountUsd,
    priceUsd,
    quantity: amountUsd / priceUsd,
    executedAt: now.toISOString(),
    weekKey: weekKeyFromDate(now),
    minOrderMergeActive: plan.minOrderMergeActive,
    mergedExecutionRoute: plan.mergedExecutionRoute,
    routerReasoning: plan.routerReasoning,
    octagonScore: input.octagonScore,
    marketAvg7d: input.marketAvg7d,
    rewardScore: computeEntryRewardScore({
      leg,
      priceUsd,
      marketAvg7d: input.marketAvg7d,
      minOrderMergeActive: plan.minOrderMergeActive,
      mergedExecutionRoute: plan.mergedExecutionRoute,
    }),
  };

  const merged = [entry, ...readExecutionPerformanceLog()].slice(0, 200);
  writeExecutionPerformanceLog(merged);
  notifyUpdated();
  return merged;
}
