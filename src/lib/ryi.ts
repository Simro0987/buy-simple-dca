// Real Yield Index (RYI) — Staking Booster for Satellite bucket (ETH vs SOL).
//
//   RYI = Gross Staking APY (%) − Token Network Inflation (%)
//
// Konštanty sú manuálne editovateľné (pripravené na neskoršiu API integráciu).
// Aktuálne hodnoty (2025 Q2 aproximácia — uprav podľa aktuálnych dát):
//   • ETH: ~3.2 % APY (Lido/Rocket Pool), inflácia ~0.6 %  → RYI ≈ +2.6 %
//   • SOL: ~7.5 % APY (Jito/Marinade),   inflácia ~4.5 %  → RYI ≈ +3.0 %

export interface RyiInputs {
  apy: number;         // gross staking APY, %
  inflation: number;   // network inflation, %
}

export const RYI_DEFAULTS: { eth: RyiInputs; sol: RyiInputs } = {
  eth: { apy: 3.2, inflation: 0.6 },
  sol: { apy: 7.5, inflation: 4.5 },
};

/** Pure formula — Real Yield = APY − Inflation. */
export function computeRYI(i: RyiInputs): number {
  return (i.apy ?? 0) - (i.inflation ?? 0);
}

export interface RyiBoosterResult {
  ethRyi: number;
  solRyi: number;
  /** solRyi − ethRyi (pozitívne = SOL má vyšší real yield). */
  diff: number;
  /** Posun v percentuálnych bodoch (proporcionálny násobiteľ 2 pp / 1 % rozdielu). */
  shiftPp: number;
  /** True keď SOL RYI > ETH RYI (kapitál sa presúva do SOL a naopak). */
  favorsSol: boolean;
}

/**
 * Vypočíta RYI booster medzi ETH a SOL.
 * Multiplier: 2 % (t.j. 0.02 podielu) alokácie sa presunie za každé 1 % rozdielu v RYI.
 * Cap ±20 pp aby extrémne rozdiely nevyhodili portfólio z rovnováhy.
 */
export function computeRyiBooster(
  eth: RyiInputs = RYI_DEFAULTS.eth,
  sol: RyiInputs = RYI_DEFAULTS.sol,
  multiplierPerPct = 2,
): RyiBoosterResult {
  const ethRyi = computeRYI(eth);
  const solRyi = computeRYI(sol);
  const diff = solRyi - ethRyi;
  const raw = diff * multiplierPerPct;
  const shiftPp = Math.max(-20, Math.min(20, raw));
  return { ethRyi, solRyi, diff, shiftPp, favorsSol: diff > 0 };
}
