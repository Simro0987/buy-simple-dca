export type MacroTrend = "bull" | "bear";

/** Minimum S1→S2 blend in bear market — prioritizes deeper support even on mild dips. */
export const BEAR_MARKET_BLEND_FLOOR = 0.5;

export function detectMacroTrend(
  spotPrice: number,
  sma200: number | null | undefined,
): MacroTrend | null {
  if (!spotPrice || !sma200 || sma200 <= 0) return null;
  return spotPrice > sma200 ? "bull" : "bear";
}

export function applyBearMarketBlendFactor(
  rsiBlend: number,
  macroTrend: MacroTrend | null,
): number {
  if (macroTrend !== "bear") return rsiBlend;
  return Math.max(rsiBlend, BEAR_MARKET_BLEND_FLOOR);
}

export function buildMacroTrendNarrative(
  macroTrend: MacroTrend | null,
): string | null {
  if (macroTrend === "bull") {
    return (
      "Token sa nachádza v Bull markete (nad SMA 200). " +
      "Systém povoľuje štandardné S1 limity a normálne RSI škálovanie sumy."
    );
  }
  if (macroTrend === "bear") {
    return (
      "Token sa nachádza v Bear markete (pod SMA 200). " +
      "Systém zvolil prísne defenzívny prístup, cieli na hlbší Support a chráni kapitál pred agresívnymi nákupmi."
    );
  }
  return null;
}

export const MACRO_TREND_BADGES: Record<
  MacroTrend,
  { label: string; tone: "bull" | "bear" }
> = {
  bull: {
    label: "BULL MARKET (Cena > SMA 200) 🐂",
    tone: "bull",
  },
  bear: {
    label: "BEAR MARKET (Cena < SMA 200) 🐻",
    tone: "bear",
  },
};
