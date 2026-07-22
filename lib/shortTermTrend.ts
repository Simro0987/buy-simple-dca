import type { MacroTrend } from "@/lib/macroTrend";

export type ShortTermTrend = "bull" | "bear" | "sideways";

/** Half-width of the neutral EMA21 band in ATR units. */
export const ATR_NEUTRAL_BAND_MULTIPLIER = 0.5;

/** Minimum S1→S2 blend when short-term trend is bearish. */
export const SHORT_TERM_BEAR_BLEND_FLOOR = 0.55;

/** Deeper S2 priority when bearish trend meets oversold RSI. */
export const SHORT_TERM_BEAR_OVERSOLD_BLEND_FLOOR = 0.75;

/** Maximum blend in short-term bull — limit stays tight near S1/spot. */
export const SHORT_TERM_BULL_BLEND_CAP = 0.1;

export function computeAtrAbsolute(price: number, atr14dPct: number): number {
  if (price <= 0 || atr14dPct <= 0) return 0;
  return price * (atr14dPct / 100);
}

export interface ShortTermTrendBands {
  ema21: number;
  upperBand: number;
  lowerBand: number;
  halfAtr: number;
}

export function computeShortTermTrendBands(
  ema21: number,
  atr14dPct: number,
  referencePrice: number,
): ShortTermTrendBands | null {
  if (ema21 <= 0 || atr14dPct <= 0 || referencePrice <= 0) return null;

  const halfAtr = ATR_NEUTRAL_BAND_MULTIPLIER * computeAtrAbsolute(referencePrice, atr14dPct);
  return {
    ema21,
    upperBand: ema21 + halfAtr,
    lowerBand: ema21 - halfAtr,
    halfAtr,
  };
}

export function detectShortTermTrend(
  price: number,
  ema21: number,
  atr14dPct: number,
): ShortTermTrend | null {
  const bands = computeShortTermTrendBands(ema21, atr14dPct, price);
  if (!bands || price <= 0) return null;

  if (price > bands.upperBand) return "bull";
  if (price < bands.lowerBand) return "bear";
  return "sideways";
}

export function applyShortTermTrendBlendFactor(
  blendFactor: number,
  shortTermTrend: ShortTermTrend | null,
  rsi14: number,
): number {
  if (!shortTermTrend) return blendFactor;

  switch (shortTermTrend) {
    case "sideways":
      return 0;
    case "bear": {
      const floor =
        rsi14 < 40
          ? SHORT_TERM_BEAR_OVERSOLD_BLEND_FLOOR
          : SHORT_TERM_BEAR_BLEND_FLOOR;
      return Math.max(blendFactor, floor);
    }
    case "bull":
      return Math.min(blendFactor, SHORT_TERM_BULL_BLEND_CAP);
    default:
      return blendFactor;
  }
}

export function buildCombinedTrendNarrative(
  macroTrend: MacroTrend | null,
  shortTermTrend: ShortTermTrend | null,
): string | null {
  if (!macroTrend && !shortTermTrend) return null;

  if (macroTrend === "bull" && shortTermTrend === "bear") {
    return (
      "Makro trend je Bull, ale krátkodobo sme v Bear korekcii. " +
      "Ideálna príležitosť na hlbší limitný nákup na úrovni S2."
    );
  }

  if (shortTermTrend === "sideways") {
    const macroPrefix =
      macroTrend === "bull"
        ? "Makro trend zostáva Bull, no "
        : macroTrend === "bear"
          ? "Makro trend je Bear a "
          : "";
    return (
      `${macroPrefix}týždenný trend je SIDEWAYS. ` +
      "Cena sa konsoliduje, limit je nastavený defenzívne na blízky S1 support."
    );
  }

  if (shortTermTrend === "bear") {
    if (macroTrend === "bear") {
      return (
        "Makro aj týždenný trend sú Bear. " +
        "Systém cieli na hlboký S2 support a chráni kapitál pred agresívnym sizingom."
      );
    }
    return (
      "Krátkodobý Bear trend — trh klesá, ideálny čas na nákup v zľave. " +
      "Priorita pre Deep Wick a hlbšie S2 úrovne."
    );
  }

  if (shortTermTrend === "bull") {
    if (macroTrend === "bear") {
      return (
        "Makro trend je Bear, no krátkodobo trh rastie. " +
        "Limit prichytený tesne pod spotom — hlboký pokles v tomto momente nie je pravdepodobný."
      );
    }
    return (
      "Krátkodobý Bull trend — trh silno rastie. " +
      "Limit prichytený tesne pod spotom na najbližší lokálny support."
    );
  }

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

export const SHORT_TERM_TREND_BADGES: Record<
  ShortTermTrend,
  { label: string; tone: "bull" | "bear" | "sideways" }
> = {
  bull: {
    label: "Krátkodobý Bull ↗",
    tone: "bull",
  },
  bear: {
    label: "Krátkodobý Bear ↘",
    tone: "bear",
  },
  sideways: {
    label: "Sideways ↔️",
    tone: "sideways",
  },
};
