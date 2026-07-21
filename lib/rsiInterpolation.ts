/** RSI ≥ this value → limit stays at S1 (no S2 blend). */
export const RSI_S1_HOLD_LEVEL = 50;

/** RSI blend corridor: from 45 down toward 15 maps 0 → 100 % toward S2. */
export const RSI_BLEND_START = 45;
export const RSI_BLEND_END = 15;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Smooth 0–1 factor: how far limit shifts from S1 toward S2 based on RSI.
 * 0 = full S1, 1 = full S2.
 */
export function computeRsiS2BlendFactor(rsi: number): number {
  const value = clamp(rsi, 0, 100);
  if (value >= RSI_BLEND_START) return 0;
  if (value <= RSI_BLEND_END) return 1;
  return (RSI_BLEND_START - value) / (RSI_BLEND_START - RSI_BLEND_END);
}

export function describeRsiZone(rsi: number): string {
  if (rsi >= 70) return "Prekúpené";
  if (rsi >= 55) return "Mierne prekúpené";
  if (rsi >= 45) return "Neutrálne";
  if (rsi >= 30) return "Mierne prepredané";
  if (rsi >= 15) return "Silne prepredané";
  return "Extrémne prepredané";
}

export function resolveFluidLimitBadge(blendFactor: number): {
  mode: "standard" | "deep_wick";
  badge: string;
} {
  if (blendFactor >= 0.65) {
    return { mode: "deep_wick", badge: "DEEP WICK (LOV KNOTOV)" };
  }
  if (blendFactor > 0) {
    const pct = Math.round(blendFactor * 100);
    return { mode: "standard", badge: `DYNAMICKÝ S1→S2 (${pct}%)` };
  }
  return { mode: "standard", badge: "ŠTANDARD (S1)" };
}

export function buildRsiInterpolationNarrative(input: {
  rsi14: number;
  blendFactor: number;
  atrGuardrailApplied: boolean;
  limitPrice: number;
}): string {
  const blendPct = Math.round(input.blendFactor * 100);
  const zone = describeRsiZone(input.rsi14);

  let text =
    `RSI indikátor aktuálne ukazuje hodnotu ${input.rsi14.toFixed(1)} (${zone}). `;

  if (input.blendFactor <= 0) {
    text +=
      "Limitná cena prichytená na Support S1 — RSI drží neutrálny až obnovujúci rozsah (≥45).";
  } else {
    text += `Limitná cena bola dynamicky stiahnutá o ${blendPct} % vzdialenosti medzi S1 a S2`;
    text += input.atrGuardrailApplied
      ? ", s korekciou 7-dňovým ATR mantinelom pre reálnu šancu vyplnenia."
      : ", s ohľadom na reálnu šancu 7-dňového vyplnenia.";
  }

  return text;
}
