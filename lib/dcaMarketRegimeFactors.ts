import type { DcaMarketSnapshot } from "@/lib/dcaMarketData";
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
}

export interface MarketRegimeFactorData {
  btcPrice: number;
  wma200: number;
  distWmaPct: number;
  factors: MarketRegimeFactor[];
}

function scoreCbbc(mayer: number): number {
  if (mayer < 0.9) return 88;
  if (mayer < 1.1) return 74;
  if (mayer < 1.5) return 55;
  if (mayer < 2.4) return 35;
  return 15;
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

function estimateLiquidityUsd(snapshot: DcaMarketSnapshot): number {
  const btcCap = snapshot.tokens.BTC?.marketCap ?? 0;
  if (btcCap > 0) {
    return btcCap * 0.0035;
  }

  const price = snapshot.marketData.btc.price;
  return price > 0 ? price * 21_000 : 0;
}

export function buildMarketRegimeFactors(
  snapshot: DcaMarketSnapshot,
): MarketRegimeFactorData {
  const btc = snapshot.marketData.btc;
  const { mayerMultiple } = btc;
  const price = snapshot.tokens.BTC?.price ?? btc.price;
  const wma200 = btc.ma200w;
  const distWmaPct =
    wma200 > 0 ? ((price - wma200) / wma200) * 100 : 0;
  const fearGreed = snapshot.fearGreed.value;
  const cbbcScore = scoreCbbc(mayerMultiple);
  const liquidityUsd = estimateLiquidityUsd(snapshot);
  const volatilityPct = btc.atr14d;

  const wmaColorScore = Math.round(
    lerpScore(distWmaPct, -30, 30, 12, 88),
  );
  const fgColorScore = fearGreed;
  const cbbcColorScore = 100 - cbbcScore;
  const liquidityColorScore = Math.round(
    clamp(72 - Math.log10(Math.max(liquidityUsd, 1_000_000)) * 8, 20, 75),
  );
  const volatilityColorScore = Math.round(
    lerpScore(volatilityPct, 0.5, 8, 25, 85),
  );

  return {
    btcPrice: price,
    wma200,
    distWmaPct: Math.round(distWmaPct * 100) / 100,
    factors: [
      {
        id: "wma200",
        label: "200WMA",
        displayValue: `${distWmaPct >= 0 ? "+" : ""}${distWmaPct.toFixed(2)}%`,
        colorScore: wmaColorScore,
        icon: TrendingUp,
      },
      {
        id: "fear-greed",
        label: "Fear & Greed",
        displayValue: String(Math.round(fearGreed)),
        colorScore: fgColorScore,
        icon: Gauge,
      },
      {
        id: "cbbc",
        label: "CBBC",
        displayValue: String(cbbcScore),
        colorScore: cbbcColorScore,
        icon: Shield,
      },
      {
        id: "liquidity",
        label: "Likvidita",
        displayValue: formatCompactUsd(liquidityUsd),
        colorScore: liquidityColorScore,
        icon: Droplets,
      },
      {
        id: "volatility",
        label: "Volatilita",
        displayValue: `${volatilityPct.toFixed(1)}%`,
        colorScore: volatilityColorScore,
        icon: Activity,
      },
    ],
  };
}
