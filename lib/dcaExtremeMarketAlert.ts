export type ExtremeMarketAlertKind = "panic" | "euphoria";

export const EXTREME_PANIC_SCORE_MAX = 20;
export const EXTREME_PANIC_FEAR_GREED_MAX = 15;
export const EXTREME_EUPHORIA_SCORE_MIN = 85;
export const EXTREME_EUPHORIA_FEAR_GREED_MIN = 85;

export function resolveExtremeMarketAlert(
  finalScore: number,
  fearGreed: number,
): ExtremeMarketAlertKind | null {
  if (
    finalScore < EXTREME_PANIC_SCORE_MAX ||
    fearGreed < EXTREME_PANIC_FEAR_GREED_MAX
  ) {
    return "panic";
  }

  if (
    finalScore > EXTREME_EUPHORIA_SCORE_MIN ||
    fearGreed > EXTREME_EUPHORIA_FEAR_GREED_MIN
  ) {
    return "euphoria";
  }

  return null;
}

export const EXTREME_MARKET_ALERT_COPY: Record<ExtremeMarketAlertKind, string> =
  {
    panic:
      "🚨 EXTRÉMNA KAPITULÁCIA: Engine automaticky presunul váhu do hlbokých limitov a chytá likvidačné knôty.",
    euphoria:
      "🔥 TRHOVÁ EUFÓRIA: Agresívne navyšujeme Market príkazy, aby nám trh neušiel.",
  };
