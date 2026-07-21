import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { ALL_DCA_TOKENS } from "@/lib/dcaMarketData";
import {
  buildExecutionTokenInput,
  resolveCategoryExecutionSplit,
  toExecutionMarketContext,
  type ExecutionMarketContext,
} from "@/lib/dcaExecutionLogic";
import { buildTokenIndicatorSnapshot } from "@/lib/dcaTokenIndicators";
import type { PortfolioBucketingResult } from "@/lib/dcaPortfolioBucketing";
import type { ConfidenceLevel, MasterTokenPlan } from "@/lib/masterDcaEngine";
import type { AssetCategory } from "@/lib/portfolioStorage";
import type { MarketDataServicePayload } from "@/lib/dcaMarketData";
import type { YieldFilterCondition } from "@/lib/dcaYieldFilter";

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

interface AmountRow {
  symbol: string;
  name: string;
  category: AssetCategory;
  amountUsd: number;
  spotPrice: number;
  rsi14: number | null;
  atr14dPct: number | null;
  filtersPassedCount?: number;
  fundamentalScore?: number;
  filterConditions?: YieldFilterCondition[];
  convictionScore?: number;
  tag?: string;
  priceVsSma14Pct?: number;
}

function ema50DeviationPct(spot: number, ema50: number | null | undefined): number | null {
  if (!spot || !ema50 || ema50 <= 0) return null;
  return Math.round(((spot - ema50) / ema50) * 1000) / 10;
}

function collectAmountRows(bucketing: PortfolioBucketingResult): AmountRow[] {
  const rows: AmountRow[] = [
    {
      symbol: bucketing.coreToken.symbol,
      name: bucketing.coreToken.name,
      category: "core",
      amountUsd: bucketing.coreToken.amountUsd,
      spotPrice: 0,
      rsi14: null,
      atr14dPct: null,
    },
    ...bucketing.satelliteTokens.map((sat) => ({
      symbol: sat.symbol,
      name: sat.name,
      category: "satellite" as const,
      amountUsd: sat.amountUsd,
      spotPrice: 0,
      rsi14: null,
      atr14dPct: null,
    })),
  ];

  for (const conviction of bucketing.yieldAltcoins.conviction) {
    if (!conviction.passed || conviction.amountUsd <= 0) continue;
    rows.push({
      symbol: conviction.symbol,
      name: conviction.name,
      category: "yield",
      amountUsd: conviction.amountUsd,
      spotPrice: conviction.price,
      rsi14: conviction.rsi,
      atr14dPct: conviction.atr14Pct ?? null,
      filtersPassedCount: conviction.filtersPassedCount,
      fundamentalScore: conviction.fundamentalScore,
      filterConditions: conviction.conditions,
      convictionScore: conviction.convictionScore,
      tag: conviction.tag,
      priceVsSma14Pct: conviction.priceVsSma14Pct,
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

function splitUsdAmounts(
  totalUsd: number,
  marketShare: number,
  limitShare: number,
): { marketUsd: number; limitUsd: number } {
  if (totalUsd <= 0) return { marketUsd: 0, limitUsd: 0 };

  const marketUsd = roundUsd(totalUsd * (marketShare / 100));
  const limitUsd = roundUsd(totalUsd - marketUsd);
  return { marketUsd, limitUsd };
}

export interface BuildFinalExecutionOrdersInput {
  bucketing: PortfolioBucketingResult;
  deployedCapital: number;
  finalScore: number;
  fearGreedValue: number;
  brakeActive: boolean;
  confidence: ConfidenceLevel;
  tokenPlans: MasterTokenPlan[];
  marketData?: MarketDataServicePayload | null;
}

/**
 * Derived execution payload: CORE (BTC) + SATELLITES (ETH, SOL) + YIELD conviction only.
 * Category-specific logic trees drive MKT/LMT split, limit targets, and entry signals.
 */
export function buildFinalExecutionOrders(
  input: BuildFinalExecutionOrdersInput,
): TokenExecutionPlan[] {
  const { bucketing, deployedCapital } = input;
  if (deployedCapital <= 0) return [];

  const planBySymbol = new Map(input.tokenPlans.map((plan) => [plan.symbol, plan]));
  const defBySymbol = new Map(ALL_DCA_TOKENS.map((token) => [token.symbol, token]));
  const marketContext: ExecutionMarketContext | null =
    toExecutionMarketContext(input.marketData ?? null);

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
      const spotPrice =
        existing?.spotPrice ||
        row.spotPrice ||
        (row.symbol === "BTC" ? marketContext?.btc.price ?? 0 : 0);

      const tokenInput = buildExecutionTokenInput({
        symbol: row.symbol,
        category,
        finalScore: input.finalScore,
        fearGreedValue: input.fearGreedValue,
        brakeActive: input.brakeActive,
        spotPrice,
        rsi14: row.rsi14 ?? existing?.rsi14 ?? null,
        atr14dPct: row.atr14dPct ?? existing?.atr14d ?? null,
        marketContext,
        filtersPassedCount: row.filtersPassedCount,
        fundamentalScore: row.fundamentalScore,
        filterConditions: row.filterConditions,
      });

      const split = resolveCategoryExecutionSplit(tokenInput);
      const distSma200Pct =
        category === "core" ? (tokenInput.distSma200Pct ?? null) : null;
      const ema50 =
        category === "core"
          ? (tokenInput.ema50 ?? marketContext?.btc.ema50 ?? null)
          : null;
      const indicatorSnapshot = buildTokenIndicatorSnapshot({
        category,
        symbol: row.symbol,
        rsi14: tokenInput.rsi14,
        atr14dPct: tokenInput.atr14dPct,
        distSma200Pct,
        ema50DeviationPct: ema50DeviationPct(spotPrice, ema50),
        priceVsSma14Pct: row.priceVsSma14Pct ?? null,
        fundamentalScore: row.fundamentalScore ?? null,
        convictionScore: row.convictionScore ?? null,
        safetyBrakeActive: split.safetyBrakeActive,
      });
      const totalUsd = row.amountUsd;
      const { marketUsd, limitUsd } = splitUsdAmounts(
        totalUsd,
        split.marketShare,
        split.limitShare,
      );

      const weightPercent =
        deployedCapital > 0
          ? Math.round((totalUsd / deployedCapital) * 1000) / 10
          : 0;

      return {
        symbol: row.symbol,
        name: row.name || existing?.name || def?.name || row.symbol,
        category,
        logoUrl: existing?.logoUrl || def?.logoUrl || "",
        weightPercent,
        totalUsd,
        marketUsd,
        limitUsd,
        marketShare: split.marketShare,
        limitShare: split.limitShare,
        limitPrice: split.limitPrice,
        whyLimit: split.whyLimit,
        spotPrice: spotPrice || existing?.spotPrice || 0,
        change24h: existing?.change24h ?? 0,
        yieldMergeActive: split.yieldMergeActive,
        brakeActive: split.safetyBrakeActive || input.brakeActive,
        hasLiveData: existing?.hasLiveData ?? spotPrice > 0,
        marketStatusFallback:
          existing?.marketStatusFallback ?? (existing?.spotPrice ?? spotPrice) <= 0,
        confidence: input.confidence,
        entrySignal: split.entrySignal,
        splitExplanation: split.splitExplanation,
        minOrderRuleActive: split.minOrderRuleActive,
        safetyBrakeActive: split.safetyBrakeActive,
        limitPullbackPct: split.limitPullbackPct,
        indicatorChips: indicatorSnapshot.chips,
        regimeStatusLabel: indicatorSnapshot.regimeStatusLabel,
        regimeStatusTone: indicatorSnapshot.regimeStatusTone,
        fearGreedValue: input.fearGreedValue,
        rsi14: tokenInput.rsi14,
        atr14dPct: tokenInput.atr14dPct,
        distSma200Pct,
        ema50DeviationPct: ema50DeviationPct(spotPrice, ema50),
        fundamentalScore: row.fundamentalScore ?? null,
        filtersPassedCount: row.filtersPassedCount ?? null,
        filterConditions: row.filterConditions ?? [],
        convictionScore: row.convictionScore ?? null,
        tag: row.tag ?? null,
        priceVsSma14Pct: row.priceVsSma14Pct ?? null,
      };
    });
}

export function sumExecutionOrders(orders: TokenExecutionPlan[]): number {
  return roundUsd(orders.reduce((sum, order) => sum + order.totalUsd, 0));
}
