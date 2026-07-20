import type { AssetCategory } from "@/lib/portfolioStorage";
import type { MasterTokenPlan } from "@/lib/masterDcaEngine";

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

export interface YieldAltcoinRow {
  symbol: string;
  tag: string;
  rsi: number;
  passed: boolean;
  amountUsd: number;
  shareOfYieldPercent: number;
}

export interface PortfolioBucketingResult {
  badgeTitle: string;
  badgeSubtitle: string;
  buckets: PortfolioBucket[];
  coreToken: TokenAllocationRow;
  satelliteTokens: TokenAllocationRow[];
  yieldAltcoins: {
    conviction: YieldAltcoinRow[];
    excluded: YieldAltcoinRow[];
  };
  yieldBucketAmount: number;
  yieldAltcoinCount: number;
  narrativeBullets: string[];
}

/** Test yield universe — RSI mocked until live feeds are wired. */
const YIELD_ALTCOIN_UNIVERSE: { symbol: string; name: string; tag: string }[] =
  [
    { symbol: "HYPE", name: "Hyperliquid", tag: "ARB" },
    { symbol: "JUP", name: "Jupiter", tag: "SOL" },
    { symbol: "AAVE", name: "Aave", tag: "ETH" },
    { symbol: "MORPHO", name: "Morpho", tag: "ETH" },
    { symbol: "LINK", name: "Chainlink", tag: "ETH" },
    { symbol: "GMX", name: "GMX", tag: "ARB" },
    { symbol: "PENDLE", name: "Pendle", tag: "ETH" },
  ];

const RSI_OVERSOLD_THRESHOLD = 50;
const ETH_SATELLITE_SHARE = 0.7;
const SOL_SATELLITE_SHARE = 0.3;

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

/** Deterministic mock RSI (20–90) per symbol until live RSI is connected. */
export function mockYieldRsi(symbol: string): number {
  const seed = symbol
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return 20 + ((seed * 7) % 71);
}

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
  plans: MasterTokenPlan[],
): PortfolioBucket[] {
  const coreUsd = sumCategory(plans, "core");
  const satUsd = sumCategory(plans, "satellite");
  const yieldUsd = sumCategory(plans, "yield");

  const subtitles: Record<AssetCategory, string> = {
    core: "BTC",
    satellite: "ETH+SOL",
    yield: `${YIELD_ALTCOIN_UNIVERSE.length} ALT`,
  };

  return (["core", "satellite", "yield"] as AssetCategory[]).map(
    (category) => {
      const amountUsd =
        category === "core"
          ? coreUsd
          : category === "satellite"
            ? satUsd
            : yieldUsd;
      const meta = BUCKET_META[category];

      return {
        category,
        label: meta.label,
        subtitle: subtitles[category],
        percent: pctOf(amountUsd, deployedCapital),
        amountUsd: roundUsd(amountUsd),
        barClass: meta.barClass,
        textClass: meta.textClass,
      };
    },
  );
}

function buildYieldAllocations(yieldBucketUsd: number): {
  conviction: YieldAltcoinRow[];
  excluded: YieldAltcoinRow[];
} {
  const rows: YieldAltcoinRow[] = YIELD_ALTCOIN_UNIVERSE.map((coin) => {
    const rsi = mockYieldRsi(coin.symbol);
    const passed = rsi < RSI_OVERSOLD_THRESHOLD;
    return {
      symbol: coin.symbol,
      tag: coin.tag,
      rsi,
      passed,
      amountUsd: 0,
      shareOfYieldPercent: 0,
    };
  });

  const conviction = rows.filter((r) => r.passed);
  const excluded = rows.filter((r) => !r.passed);
  const perCoin =
    conviction.length > 0
      ? roundUsd(yieldBucketUsd / conviction.length)
      : 0;

  conviction.forEach((row) => {
    row.amountUsd = perCoin;
    row.shareOfYieldPercent =
      yieldBucketUsd > 0
        ? Math.round((perCoin / yieldBucketUsd) * 1000) / 10
        : 0;
  });

  return { conviction, excluded };
}

function buildNarrative(
  buckets: PortfolioBucket[],
  corePercent: number,
  satPercent: number,
  yieldPercent: number,
): string[] {
  const core = buckets.find((b) => b.category === "core");
  const sat = buckets.find((b) => b.category === "satellite");
  const yld = buckets.find((b) => b.category === "yield");

  return [
    `Alokácia BTC nastavená na ${corePercent}% vďaka 200WMA a F&G.`,
    `Vyvážený režim — ${Math.round(corePercent)}/${Math.round(satPercent)} split medzi Core a satelitmi.`,
    "Quality Bias: ETH CBBC > SOL → ETH +10 pp v satellite buckete.",
    `Yield kôš ${yieldPercent}% — plynulá derivácia z 5 faktorov (${formatUsdShort(yld?.amountUsd ?? 0)}).`,
  ];
}

function formatUsdShort(value: number): string {
  return `$${Math.round(value)}`;
}

export function computePortfolioBucketing(input: {
  deployedCapital: number;
  tokenPlans: MasterTokenPlan[];
}): PortfolioBucketingResult {
  const { deployedCapital, tokenPlans } = input;
  const buckets = buildBuckets(deployedCapital, tokenPlans);

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

  const yieldAltcoins = buildYieldAllocations(yieldBucket.amountUsd);

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
    narrativeBullets: buildNarrative(
      buckets,
      coreBucket.percent,
      satBucket.percent,
      yieldBucket.percent,
    ),
  };
}
