import type { LiveMarketRegimeRawData } from "@/lib/fetchMarketRegimeFactors";
import { clamp, lerpScore } from "@/lib/dcaTechnicalIndicators";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  Droplets,
  Gauge,
  Shield,
  TrendingUp,
} from "lucide-react";

export interface MarketRegimeFactor {
  id: string;
  label: string;
  displayValue: string;
  colorScore: number;
  icon: LucideIcon;
  source: string;
}

export interface MarketRegimeFactorData {
  btcPrice: number;
  wma200: number;
  distWmaPct: number;
  factors: MarketRegimeFactor[];
  degraded: boolean;
  fetchedAt: string;
}

function formatCompactUsd(value: number): string {
  if (value >= 1_000_000_000_000) {
    return `$${(value / 1_000_000_000_000).toFixed(1)} T`;
  }
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(1)} B`;
  }
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)} M`;
  }
  return `$${Math.round(value)}`;
}

export function buildMarketRegimeFactors(
  raw: LiveMarketRegimeRawData,
): MarketRegimeFactorData {
  const {
    btcPrice,
    wma200,
    distWmaPct,
    fearGreed,
    cbbcScore,
    liquidityUsd,
    atr14Pct,
    sources,
  } = raw;

  const wmaColorScore = Math.round(
    lerpScore(distWmaPct, -30, 30, 12, 88),
  );
  const fgColorScore = fearGreed;
  const cbbcColorScore = 100 - cbbcScore;
  const liquidityColorScore = Math.round(
    clamp(72 - Math.log10(Math.max(liquidityUsd, 1_000_000)) * 8, 20, 75),
  );
  const volatilityColorScore = Math.round(
    lerpScore(atr14Pct, 0.5, 8, 25, 85),
  );

  return {
    btcPrice,
    wma200,
    distWmaPct,
    degraded: raw.degraded,
    fetchedAt: raw.fetchedAt,
    factors: [
      {
        id: "wma200",
        label: "200WMA",
        displayValue: `${distWmaPct >= 0 ? "+" : ""}${distWmaPct.toFixed(2)}%`,
        colorScore: wmaColorScore,
        icon: TrendingUp,
        source: sources.wma200,
      },
      {
        id: "fear-greed",
        label: "Fear & Greed",
        displayValue: String(Math.round(fearGreed)),
        colorScore: fgColorScore,
        icon: Gauge,
        source: sources.fearGreed,
      },
      {
        id: "cbbc",
        label: "CBBC",
        displayValue: String(cbbcScore),
        colorScore: cbbcColorScore,
        icon: Shield,
        source: sources.cbbc,
      },
      {
        id: "liquidity",
        label: "Likvidita",
        displayValue: formatCompactUsd(liquidityUsd),
        colorScore: liquidityColorScore,
        icon: Droplets,
        source: sources.liquidity,
      },
      {
        id: "volatility",
        label: "Volatilita",
        displayValue: `${atr14Pct.toFixed(1)}%`,
        colorScore: volatilityColorScore,
        icon: Activity,
        source: sources.volatility,
      },
    ],
  };
}
