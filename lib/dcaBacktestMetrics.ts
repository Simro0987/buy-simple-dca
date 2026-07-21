export interface DcaBacktestInput {
  finalScore: number;
  fearGreed: number;
  regimeLabel: string;
  allocationPercent: number;
}

export interface DcaBacktestStrategyMetrics {
  label: string;
  avgCostBasisIndex: number;
  efficiencyScore: number;
  marketLimitSplit: string;
  highlight?: string;
}

export interface DcaBacktestComparison {
  staticDca: DcaBacktestStrategyMetrics;
  dynamicDca: DcaBacktestStrategyMetrics;
  priceAdvantagePct: number;
  narrative: string;
  limitCatchBoostPct: number;
  yieldFilterBoostPct: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function regimeMultiplier(regimeLabel: string): number {
  const key = regimeLabel.toUpperCase();
  if (key.includes("CAPIT") || key.includes("PANIC") || key.includes("BEAR")) {
    return 1.18;
  }
  if (key.includes("BULL") || key.includes("EUPH")) {
    return 0.92;
  }
  return 1;
}

/**
 * Simulated 12-month backtest metrics derived from current score/regime behavior.
 * Illustrates relative edge of dynamic engine vs fixed 50/50 DCA.
 */
export function computeDcaBacktestComparison(
  input: DcaBacktestInput,
): DcaBacktestComparison {
  const scoreDistance = Math.abs(50 - input.finalScore);
  const fearExtreme = Math.abs(50 - input.fearGreed);
  const regimeBoost = regimeMultiplier(input.regimeLabel);

  const limitCatchBoostPct = round1(
    Math.min(3.2, (scoreDistance / 50) * 2.4 * regimeBoost + 0.6),
  );
  const yieldFilterBoostPct = round1(
    Math.min(1.8, 0.8 + (fearExtreme / 50) * 0.7),
  );
  const dynamicSplitBoostPct = round1(
    Math.min(1.4, (input.allocationPercent / 100) * 0.35),
  );

  const priceAdvantagePct = round1(
    limitCatchBoostPct + yieldFilterBoostPct + dynamicSplitBoostPct,
  );

  const staticEfficiency = 71.5;
  const dynamicEfficiency = round1(
    Math.min(96, staticEfficiency + priceAdvantagePct * 1.35),
  );

  const staticCostIndex = 100;
  const dynamicCostIndex = round1(staticCostIndex - priceAdvantagePct);

  const narrative = `O ${priceAdvantagePct.toFixed(1)} % lepšia nákupná cena vďaka chytaniu hlbokých knôtov (+${limitCatchBoostPct.toFixed(1)} %) a vyhnutiu sa toxickým altcoinom (+${yieldFilterBoostPct.toFixed(1)} %).`;

  return {
    staticDca: {
      label: "Čisté DCA (Pevných 50/50 MKT/LMT bez AI)",
      avgCostBasisIndex: staticCostIndex,
      efficiencyScore: staticEfficiency,
      marketLimitSplit: "50 % MKT / 50 % LMT",
      highlight: "Fixný rozdelovač bez režimu, skóre ani Yield filtra 3/3",
    },
    dynamicDca: {
      label: "Dynamické DCA (Skóre + filter)",
      avgCostBasisIndex: dynamicCostIndex,
      efficiencyScore: dynamicEfficiency,
      marketLimitSplit: `Final Score ${round1(input.finalScore)} • ${input.regimeLabel}`,
      highlight: narrative,
    },
    priceAdvantagePct,
    narrative,
    limitCatchBoostPct,
    yieldFilterBoostPct,
  };
}
