import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { ALL_DCA_TOKENS } from "@/lib/dcaMarketData";
import type { PortfolioBucketingResult } from "@/lib/dcaPortfolioBucketing";
import type { ConfidenceLevel, MasterTokenPlan } from "@/lib/masterDcaEngine";
import type { AssetCategory } from "@/lib/portfolioStorage";

const YIELD_RSI_MERGE_THRESHOLD = 38;

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function matrixSplit(fearGreed: number): { market: number; limit: number } {
  if (fearGreed <= 30) return { market: 70, limit: 30 };
  if (fearGreed >= 75) return { market: 20, limit: 80 };
  const t = (fearGreed - 30) / 45;
  const market = Math.round(70 - t * 50);
  return { market, limit: 100 - market };
}

interface AmountRow {
  symbol: string;
  name: string;
  category: AssetCategory;
  amountUsd: number;
  rsi14: number | null;
}

function collectAmountRows(bucketing: PortfolioBucketingResult): AmountRow[] {
  const rows: AmountRow[] = [
    {
      symbol: bucketing.coreToken.symbol,
      name: bucketing.coreToken.name,
      category: "core",
      amountUsd: bucketing.coreToken.amountUsd,
      rsi14: null,
    },
    ...bucketing.satelliteTokens.map((sat) => ({
      symbol: sat.symbol,
      name: sat.name,
      category: "satellite" as const,
      amountUsd: sat.amountUsd,
      rsi14: null,
    })),
  ];

  for (const conviction of bucketing.yieldAltcoins.conviction) {
    if (!conviction.passed || conviction.amountUsd <= 0) continue;
    rows.push({
      symbol: conviction.symbol,
      name: conviction.name,
      category: "yield",
      amountUsd: conviction.amountUsd,
      rsi14: conviction.rsi,
    });
  }

  return rows;
}

/** Nudge the largest row (prefer BTC) so orders sum exactly to deployed capital. */
function reconcileToTarget(rows: AmountRow[], targetTotal: number): AmountRow[] {
  if (rows.length === 0) return rows;

  const adjusted = rows.map((row) => ({ ...row }));
  const sum = roundUsd(adjusted.reduce((acc, row) => acc + row.amountUsd, 0));
  const diff = roundUsd(targetTotal - sum);

  if (Math.abs(diff) < 0.005) return adjusted;

  const btcIndex = adjusted.findIndex((row) => row.symbol === "BTC");
  const adjustIndex = btcIndex >= 0 ? btcIndex : 0;
  adjusted[adjustIndex] = {
    ...adjusted[adjustIndex],
    amountUsd: roundUsd(adjusted[adjustIndex].amountUsd + diff),
  };

  return adjusted;
}

function resolveMarketLimitShares(input: {
  category: AssetCategory;
  rsi14: number | null;
  brakeActive: boolean;
  fearGreedValue: number;
  existingPlan?: MasterTokenPlan;
}): { marketShare: number; limitShare: number; yieldMergeActive: boolean } {
  if (input.existingPlan) {
    return {
      marketShare: input.existingPlan.marketShare,
      limitShare: input.existingPlan.limitShare,
      yieldMergeActive: input.existingPlan.yieldMergeActive,
    };
  }

  const base = matrixSplit(input.fearGreedValue);
  let marketShare = base.market;
  let limitShare = base.limit;

  const yieldMerge =
    input.category === "yield" &&
    input.rsi14 != null &&
    input.rsi14 < YIELD_RSI_MERGE_THRESHOLD;

  if (yieldMerge) {
    marketShare = 100;
    limitShare = 0;
  } else if (input.brakeActive) {
    marketShare = Math.round(marketShare * 0.5);
    limitShare = 100 - marketShare;
  }

  return { marketShare, limitShare, yieldMergeActive: yieldMerge };
}

export interface BuildFinalExecutionOrdersInput {
  bucketing: PortfolioBucketingResult;
  deployedCapital: number;
  fearGreedValue: number;
  brakeActive: boolean;
  confidence: ConfidenceLevel;
  tokenPlans: MasterTokenPlan[];
}

/**
 * Derived execution payload: CORE (BTC) + SATELLITES (ETH, SOL) + YIELD conviction only.
 * Excluded yield tokens never appear. Spillover-inflated core/sat amounts are respected.
 */
export function buildFinalExecutionOrders(
  input: BuildFinalExecutionOrdersInput,
): TokenExecutionPlan[] {
  const { bucketing, deployedCapital } = input;
  if (deployedCapital <= 0) return [];

  const planBySymbol = new Map(input.tokenPlans.map((plan) => [plan.symbol, plan]));
  const defBySymbol = new Map(ALL_DCA_TOKENS.map((token) => [token.symbol, token]));

  const reconciled = reconcileToTarget(
    collectAmountRows(bucketing),
    deployedCapital,
  );

  return reconciled
    .filter((row) => row.amountUsd > 0)
    .map((row) => {
      const existing = planBySymbol.get(row.symbol);
      const def = defBySymbol.get(row.symbol);
      const category = row.category;
      const rsi14 = row.rsi14 ?? existing?.rsi14 ?? null;

      const { marketShare, limitShare, yieldMergeActive } =
        resolveMarketLimitShares({
          category,
          rsi14,
          brakeActive: input.brakeActive,
          fearGreedValue: input.fearGreedValue,
          existingPlan: existing,
        });

      const totalUsd = row.amountUsd;
      const marketUsd = roundUsd(totalUsd * (marketShare / 100));
      const limitUsd = roundUsd(totalUsd - marketUsd);
      const weightPercent =
        deployedCapital > 0
          ? Math.round((totalUsd / deployedCapital) * 1000) / 10
          : 0;

      const spotPrice = existing?.spotPrice ?? 0;

      return {
        symbol: row.symbol,
        name: row.name || existing?.name || def?.name || row.symbol,
        category,
        logoUrl: existing?.logoUrl || def?.logoUrl || "",
        weightPercent,
        totalUsd,
        marketUsd,
        limitUsd,
        marketShare,
        limitShare,
        limitPrice: existing?.limitPrice ?? 0,
        whyLimit: existing?.whyLimit ?? "",
        spotPrice,
        change24h: existing?.change24h ?? 0,
        yieldMergeActive,
        brakeActive: input.brakeActive,
        hasLiveData: existing?.hasLiveData ?? false,
        marketStatusFallback: existing?.marketStatusFallback ?? spotPrice <= 0,
        confidence: input.confidence,
      };
    });
}

export function sumExecutionOrders(orders: TokenExecutionPlan[]): number {
  return roundUsd(orders.reduce((sum, order) => sum + order.totalUsd, 0));
}
