import {
  BEAR_MIN_CORE_PERCENT,
  computeDynamicBucketRatios,
  getBucketBadgeTitle,
} from "@/lib/dcaBucketRatios";
import type { AssetCategory } from "@/lib/portfolioStorage";
import type { MasterTokenPlan } from "@/lib/masterDcaEngine";
import {
  applyYieldSpillover,
  buildYieldFilterAllocations,
  YIELD_ALTCOIN_UNIVERSE,
  YIELD_FILTER_THRESHOLDS,
  type YieldAllocationRow,
  type YieldFilterEvaluation,
  type YieldTokenMetrics,
} from "@/lib/dcaYieldFilter";
import { formatUsd } from "@/lib/numberFormat";
import type { MacroRegime } from "@/lib/ultimateDcaEngine";

export interface PortfolioBucket {
  category: AssetCategory;
  label: string;
  subtitle: string;
  percent: number;
  amountUsd: number;
  barClass: string;
  textClass: string;
}

export interface TokenAllocationRow {
  symbol: string;
  name: string;
  amountUsd: number;
  percentOfTotal: number;
  barClass: string;
  textClass: string;
}

export type YieldAltcoinRow = YieldAllocationRow;
export type YieldExcludedRow = YieldFilterEvaluation;

export interface PortfolioBucketingResult {
  badgeTitle: string;
  badgeSubtitle: string;
  buckets: PortfolioBucket[];
  coreToken: TokenAllocationRow;
  satelliteTokens: TokenAllocationRow[];
  yieldAltcoins: {
    conviction: YieldAllocationRow[];
    excluded: YieldFilterEvaluation[];
  };
  yieldBucketAmount: number;
  yieldAltcoinCount: number;
  spilloverActive: boolean;
  spilloverAmount: number;
  narrativeBullets: string[];
  bucketRatios: { core: number; satellite: number; yield: number };
  liveDataReady: boolean;
}

const BUCKET_META: Record<
  AssetCategory,
  { label: string; barClass: string; textClass: string }
> = {
  core: {
    label: "CORE",
    barClass: "bg-blue-500",
    textClass: "text-blue-400",
  },
  satellite: {
    label: "SATELLITES",
    barClass: "bg-violet-500",
    textClass: "text-violet-400",
  },
  yield: {
    label: "YIELD",
    barClass: "bg-teal-400",
    textClass: "text-teal-400",
  },
};

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function enforceBearCoreAmountFloor(
  regime: MacroRegime,
  deployedCapital: number,
  amounts: { coreUsd: number; satelliteUsd: number; yieldUsd: number },
): {
  coreUsd: number;
  satelliteUsd: number;
  yieldUsd: number;
  floorApplied: boolean;
} {
  if (regime !== "BEAR" || deployedCapital <= 0) {
    return { ...amounts, floorApplied: false };
  }

  const minCoreUsd = roundUsd((deployedCapital * BEAR_MIN_CORE_PERCENT) / 100);
  if (amounts.coreUsd >= minCoreUsd) {
    return { ...amounts, floorApplied: false };
  }

  const deficit = roundUsd(minCoreUsd - amounts.coreUsd);
  const nonCoreTotal = amounts.satelliteUsd + amounts.yieldUsd;

  if (nonCoreTotal <= 0) {
    return {
      coreUsd: minCoreUsd,
      satelliteUsd: 0,
      yieldUsd: 0,
      floorApplied: true,
    };
  }

  const satelliteShare = amounts.satelliteUsd / nonCoreTotal;
  const yieldShare = amounts.yieldUsd / nonCoreTotal;

  return {
    coreUsd: minCoreUsd,
    satelliteUsd: roundUsd(
      Math.max(0, amounts.satelliteUsd - deficit * satelliteShare),
    ),
    yieldUsd: roundUsd(Math.max(0, amounts.yieldUsd - deficit * yieldShare)),
    floorApplied: true,
  };
}

function pctOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function resolveSatelliteSplit(tokenPlans: MasterTokenPlan[]): {
  ethShare: number;
  solShare: number;
} {
  const ethPlan = tokenPlans.find((plan) => plan.symbol === "ETH");
  const solPlan = tokenPlans.find((plan) => plan.symbol === "SOL");
  const ethWeight = ethPlan?.weightPercent ?? 25;
  const solWeight = solPlan?.weightPercent ?? 10;
  const total = ethWeight + solWeight;

  if (total <= 0) {
    return { ethShare: 0.7, solShare: 0.3 };
  }

  return {
    ethShare: ethWeight / total,
    solShare: solWeight / total,
  };
}

function buildBuckets(
  deployedCapital: number,
  amounts: { core: number; satellite: number; yield: number },
): PortfolioBucket[] {
  const subtitles: Record<AssetCategory, string> = {
    core: "BTC",
    satellite: "ETH+SOL",
    yield: `${YIELD_ALTCOIN_UNIVERSE.length} ALT`,
  };

  const categoryAmounts: Record<AssetCategory, number> = {
    core: amounts.core,
    satellite: amounts.satellite,
    yield: amounts.yield,
  };

  return (["core", "satellite", "yield"] as AssetCategory[]).map(
    (category) => {
      const amountUsd = roundUsd(categoryAmounts[category]);
      const meta = BUCKET_META[category];

      return {
        category,
        label: meta.label,
        subtitle: subtitles[category],
        percent: pctOf(amountUsd, deployedCapital),
        amountUsd,
        barClass: meta.barClass,
        textClass: meta.textClass,
      };
    },
  );
}

function buildNarrative(input: {
  regimeLabel: string;
  finalScore: number;
  corePercent: number;
  satPercent: number;
  yieldPercent: number;
  yieldAmount: number;
  convictionCount: number;
  spilloverActive: boolean;
  spilloverAmount: number;
  liveDataReady: boolean;
  bearCoreFloorApplied?: boolean;
}): string[] {
  const bullets = [
    `Alokácia BTC ${input.corePercent}% — režim ${input.regimeLabel}, Final Score ${Math.round(input.finalScore)}.`,
    `Dynamický split ${Math.round(input.corePercent)}/${Math.round(input.satPercent)}/${Math.round(input.yieldPercent)} (Core/Sat/Yield) z live režimu a skóre.`,
    "Quality Bias: ETH CBBC > SOL → ETH váha z tokenPlans v satellite buckete.",
    `Yield kôš ${input.yieldPercent}% — live filter 3/3, váha skóre^${YIELD_FILTER_THRESHOLDS.weightExponent} (${formatUsdShort(input.yieldAmount)}).`,
  ];

  if (input.bearCoreFloorApplied) {
    bullets.push(
      `BEAR guardrail: Core (BTC) uzamknutý na minimálne ${BEAR_MIN_CORE_PERCENT}% — deficit pomerne znížený zo Satellites a Yield.`,
    );
  }

  if (input.liveDataReady) {
    bullets.push(
      "Yield metriky: Binance RSI(14), SMA14 odchýlka, fundament (volume trend + RSI + SMA).",
    );
  }

  if (input.spilloverActive) {
    bullets.push(
      `Spillover: ${formatUsdShort(input.spilloverAmount)} z Yield sa vrátilo do CORE/SAT (${input.convictionCount}/${YIELD_ALTCOIN_UNIVERSE.length} prešlo filtrom).`,
    );
  } else if (input.convictionCount > 0) {
    bullets.push(
      `${input.convictionCount} altcoinov prešlo live filtrom 3/3 — vážená distribúcia podľa conviction skóre^${YIELD_FILTER_THRESHOLDS.weightExponent}.`,
    );
  }

  return bullets;
}

function formatUsdShort(value: number): string {
  return formatUsd(value);
}

export function computePortfolioBucketing(input: {
  deployedCapital: number;
  tokenPlans: MasterTokenPlan[];
  regime: MacroRegime;
  regimeLabel: string;
  finalScore: number;
  yieldMetrics: Record<string, YieldTokenMetrics>;
}): PortfolioBucketingResult {
  const {
    deployedCapital,
    tokenPlans,
    regime,
    regimeLabel,
    finalScore,
    yieldMetrics,
  } = input;

  const bucketRatios = computeDynamicBucketRatios(regime, finalScore);
  const liveDataReady = Object.keys(yieldMetrics).length > 0;

  const rawCore = roundUsd((deployedCapital * bucketRatios.core) / 100);
  const rawSat = roundUsd((deployedCapital * bucketRatios.satellite) / 100);
  const rawYield = roundUsd((deployedCapital * bucketRatios.yield) / 100);

  const yieldAltcoinsPreFloor = buildYieldFilterAllocations(
    rawYield,
    yieldMetrics,
  );

  const spillover = applyYieldSpillover({
    coreUsd: rawCore,
    satelliteUsd: rawSat,
    yieldUsd: rawYield,
    convictionCount: yieldAltcoinsPreFloor.conviction.length,
  });

  const flooredAmounts = enforceBearCoreAmountFloor(regime, deployedCapital, {
    coreUsd: spillover.coreUsd,
    satelliteUsd: spillover.satelliteUsd,
    yieldUsd: spillover.yieldUsd,
  });

  const yieldBudgetScale =
    spillover.yieldUsd > 0
      ? flooredAmounts.yieldUsd / spillover.yieldUsd
      : 1;

  const yieldAltcoins =
    yieldBudgetScale < 1
      ? {
          conviction: yieldAltcoinsPreFloor.conviction.map((row) => ({
            ...row,
            amountUsd: roundUsd(row.amountUsd * yieldBudgetScale),
            shareOfYieldPercent:
              flooredAmounts.yieldUsd > 0
                ? pctOf(
                    roundUsd(row.amountUsd * yieldBudgetScale),
                    flooredAmounts.yieldUsd,
                  )
                : 0,
          })),
          excluded: yieldAltcoinsPreFloor.excluded,
        }
      : yieldAltcoinsPreFloor;

  const buckets = buildBuckets(deployedCapital, {
    core: flooredAmounts.coreUsd,
    satellite: flooredAmounts.satelliteUsd,
    yield: flooredAmounts.yieldUsd,
  });

  const coreBucket = buckets.find((b) => b.category === "core")!;
  const satBucket = buckets.find((b) => b.category === "satellite")!;
  const yieldBucket = buckets.find((b) => b.category === "yield")!;

  const { ethShare, solShare } = resolveSatelliteSplit(tokenPlans);
  const ethAmount = roundUsd(satBucket.amountUsd * ethShare);
  const solAmount = roundUsd(satBucket.amountUsd - ethAmount);

  const coreToken: TokenAllocationRow = {
    symbol: "BTC",
    name: "Bitcoin",
    amountUsd: coreBucket.amountUsd,
    percentOfTotal: coreBucket.percent,
    barClass: "bg-amber-400",
    textClass: "text-amber-400",
  };

  const satelliteTokens: TokenAllocationRow[] = [
    {
      symbol: "ETH",
      name: "Ethereum",
      amountUsd: ethAmount,
      percentOfTotal: pctOf(ethAmount, deployedCapital),
      barClass: "bg-violet-500",
      textClass: "text-violet-400",
    },
    {
      symbol: "SOL",
      name: "Solana",
      amountUsd: solAmount,
      percentOfTotal: pctOf(solAmount, deployedCapital),
      barClass: "bg-fuchsia-500",
      textClass: "text-fuchsia-400",
    },
  ];

  const badgeSubtitle = `Core ${Math.round(coreBucket.percent)}% • Sat ${Math.round(satBucket.percent)}% • Yield ${Math.round(yieldBucket.percent)}%`;

  return {
    badgeTitle: getBucketBadgeTitle(regime),
    badgeSubtitle,
    buckets,
    coreToken,
    satelliteTokens,
    yieldAltcoins,
    yieldBucketAmount: yieldBucket.amountUsd,
    yieldAltcoinCount: YIELD_ALTCOIN_UNIVERSE.length,
    spilloverActive: spillover.spilloverActive,
    spilloverAmount: spillover.spilloverAmount,
    bucketRatios,
    liveDataReady,
    narrativeBullets: buildNarrative({
      regimeLabel,
      finalScore,
      corePercent: coreBucket.percent,
      satPercent: satBucket.percent,
      yieldPercent: yieldBucket.percent,
      yieldAmount: flooredAmounts.yieldUsd > 0 ? flooredAmounts.yieldUsd : rawYield,
      convictionCount: yieldAltcoins.conviction.length,
      spilloverActive: spillover.spilloverActive,
      spilloverAmount: spillover.spilloverAmount,
      liveDataReady,
      bearCoreFloorApplied: flooredAmounts.floorApplied,
    }),
  };
}
