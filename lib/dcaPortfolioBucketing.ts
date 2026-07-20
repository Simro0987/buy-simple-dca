import type { AssetCategory } from "@/lib/portfolioStorage";
import type { MasterTokenPlan } from "@/lib/masterDcaEngine";
import {
  applyYieldSpillover,
  buildYieldFilterAllocations,
  YIELD_ALTCOIN_UNIVERSE,
  type YieldAllocationRow,
  type YieldFilterEvaluation,
} from "@/lib/dcaYieldFilter";

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
}

const ETH_SATELLITE_SHARE = 0.7;

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

function pctOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function sumCategory(
  plans: MasterTokenPlan[],
  category: AssetCategory,
): number {
  return plans
    .filter((p) => p.category === category)
    .reduce((sum, p) => sum + p.totalUsd, 0);
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
  corePercent: number;
  satPercent: number;
  yieldPercent: number;
  yieldAmount: number;
  convictionCount: number;
  spilloverActive: boolean;
  spilloverAmount: number;
}): string[] {
  const bullets = [
    `Alokácia BTC nastavená na ${input.corePercent}% vďaka 200WMA a F&G.`,
    `Vyvážený režim — ${Math.round(input.corePercent)}/${Math.round(input.satPercent)} split medzi Core a satelitmi.`,
    "Quality Bias: ETH CBBC > SOL → ETH +10 pp v satellite buckete.",
    `Yield kôš ${input.yieldPercent}% — filter 3/3, váha skóre^2.5 (${formatUsdShort(input.yieldAmount)}).`,
  ];

  if (input.spilloverActive) {
    bullets.push(
      `Spillover: ${formatUsdShort(input.spilloverAmount)} z Yield sa vrátilo do CORE/SAT (${input.convictionCount}/7 prešlo filtrom).`,
    );
  } else if (input.convictionCount > 0) {
    bullets.push(
      `${input.convictionCount} altcoinov prešlo filtrom 3/3 — exponenciálna distribúcia podľa fundamentu^2.5.`,
    );
  }

  return bullets;
}

function formatUsdShort(value: number): string {
  return `$${Math.round(value)}`;
}

export function computePortfolioBucketing(input: {
  deployedCapital: number;
  tokenPlans: MasterTokenPlan[];
}): PortfolioBucketingResult {
  const { deployedCapital, tokenPlans } = input;

  const rawCore = sumCategory(tokenPlans, "core");
  const rawSat = sumCategory(tokenPlans, "satellite");
  const rawYield = sumCategory(tokenPlans, "yield");

  const yieldAltcoins = buildYieldFilterAllocations(rawYield);

  const spillover = applyYieldSpillover({
    coreUsd: rawCore,
    satelliteUsd: rawSat,
    yieldUsd: rawYield,
    convictionCount: yieldAltcoins.conviction.length,
  });

  const buckets = buildBuckets(deployedCapital, {
    core: spillover.coreUsd,
    satellite: spillover.satelliteUsd,
    yield: spillover.yieldUsd,
  });

  const coreBucket = buckets.find((b) => b.category === "core")!;
  const satBucket = buckets.find((b) => b.category === "satellite")!;
  const yieldBucket = buckets.find((b) => b.category === "yield")!;

  const ethAmount = roundUsd(satBucket.amountUsd * ETH_SATELLITE_SHARE);
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
    badgeTitle: "BALANCED • Vyvážená alokácia",
    badgeSubtitle,
    buckets,
    coreToken,
    satelliteTokens,
    yieldAltcoins,
    yieldBucketAmount: yieldBucket.amountUsd,
    yieldAltcoinCount: YIELD_ALTCOIN_UNIVERSE.length,
    spilloverActive: spillover.spilloverActive,
    spilloverAmount: spillover.spilloverAmount,
    narrativeBullets: buildNarrative({
      corePercent: coreBucket.percent,
      satPercent: satBucket.percent,
      yieldPercent: yieldBucket.percent,
      yieldAmount: spillover.yieldUsd > 0 ? spillover.yieldUsd : rawYield,
      convictionCount: yieldAltcoins.conviction.length,
      spilloverActive: spillover.spilloverActive,
      spilloverAmount: spillover.spilloverAmount,
    }),
  };
}
