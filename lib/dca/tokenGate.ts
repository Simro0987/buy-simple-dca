import { FALLING_KNIFE_BADGE } from "@/lib/dca/fallingKnife";
import type { HighBetaEvaluation, SatelliteEvaluation, TokenGate } from "@/lib/dca/types";

export function buildTokenGate(options: {
  fallingKnife: boolean;
  highBeta: HighBetaEvaluation | null;
  satellite: SatelliteEvaluation | null;
  price: number;
  ema50: number;
  sma200: number;
}): TokenGate {
  if (options.fallingKnife) {
    return { passed: false, kind: "knife", badge: FALLING_KNIFE_BADGE };
  }

  const satellite = options.satellite;
  if (satellite && !satellite.approved) {
    const reason = satellite.reason || "Protokol zastavil nákup";
    const badge = /200W/i.test(reason)
      ? "Zastavené: Cena pod 200WMA"
      : `Zastavené: ${reason.replace(/\.$/, "")}`;
    return { passed: false, kind: "fail", badge };
  }

  const highBeta = options.highBeta;
  if (highBeta && !highBeta.approved) {
    const reason = highBeta.reason || "Protokol zamietol nákup";
    return { passed: false, kind: "fail", badge: `Zastavené: ${reason.replace(/\.$/, "")}` };
  }

  if (options.price > 0 && options.ema50 > 0 && options.price < options.ema50) {
    return { passed: true, kind: "pass", badge: "Schválené: Zľava na 50D EMA" };
  }
  if (options.price > 0 && options.sma200 > 0 && options.price > options.sma200) {
    return { passed: true, kind: "pass", badge: "Schválené: Zdravý trend" };
  }
  return { passed: true, kind: "pass", badge: "Schválené: Zdravý trend" };
}
