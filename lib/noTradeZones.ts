export type NoTradeZone = "fomo" | "black_swan";

export const FOMO_RSI_THRESHOLD = 80;
export const BLACK_SWAN_24H_DROP_PCT = 25;
export const ATR_SPIKE_MULTIPLIER = 3;

export interface NoTradeEvaluation {
  active: true;
  zone: NoTradeZone;
  badge: string;
  narrative: string;
}

export interface NoTradeInput {
  rsi14: number | null;
  change24h: number;
  dailyAtrPct?: number | null;
  atr14dPct?: number | null;
}

export function isBlackSwanCondition(input: NoTradeInput): boolean {
  const extremeDrop = input.change24h <= -BLACK_SWAN_24H_DROP_PCT;
  const atrSpike =
    input.dailyAtrPct != null &&
    input.atr14dPct != null &&
    input.atr14dPct > 0 &&
    input.dailyAtrPct >= ATR_SPIKE_MULTIPLIER * input.atr14dPct;

  return extremeDrop || atrSpike;
}

export function isFomoCondition(rsi14: number | null): boolean {
  return rsi14 != null && rsi14 > FOMO_RSI_THRESHOLD;
}

export function evaluateNoTradeZone(input: NoTradeInput): NoTradeEvaluation | null {
  if (isBlackSwanCondition(input)) {
    return {
      active: true,
      zone: "black_swan",
      badge: "NO-TRADE: VOĽNÝ PÁD / BLACK SWAN",
      narrative:
        "Detegovaná extrémna anomália a panický výpredaj. Technické supporty momentálne neplatia " +
        "(efekt padajúceho noža). Extrémne riziko straty. Systém odporúča počkať na stabilizáciu " +
        "volatility (pokles ATR), kým sa obnovia nákupy.",
    };
  }

  if (isFomoCondition(input.rsi14)) {
    return {
      active: true,
      zone: "fomo",
      badge: "NO-TRADE: EXTRÉMNA EUFÓRIA",
      narrative:
        `RSI indikátor je nad hodnotou ${FOMO_RSI_THRESHOLD}. Trh je v stave extrémnej eufórie ` +
        "a riziko okamžitej korekcie je obrovské. Systém odporúča tento týždeň nenakupovať, " +
        "akumulovať hotovosť a počkať na lepšiu zľavu.",
    };
  }

  return null;
}

export const NO_TRADE_BADGE_STYLES: Record<
  NoTradeZone,
  { className: string }
> = {
  fomo: {
    className:
      "border-amber-500/40 bg-amber-500/15 text-amber-200 shadow-[0_0_12px_rgba(245,158,11,0.15)]",
  },
  black_swan: {
    className:
      "border-rose-600/50 bg-rose-950/60 text-rose-200 shadow-[0_0_14px_rgba(225,29,72,0.2)]",
  },
};
