/**
 * Core utility for dynamic profit skimming in the Portfolio section.
 * Calculates the exact token amount to sell based on accumulated profit.
 *
 * Rules:
 * 1. profitUSD = currentFiatValue - investedCapital
 * 2. If profitUSD <= 0: return 0
 * 3. If realPnL < 15%: return 0 (TP locked)
 * 4. If overheatScore >= 75: return profitUSD / tokenPrice (100% skim)
 * 5. If realPnL >= 50% (and overheat < 75): return (profitUSD * 0.50) / tokenPrice
 * 6. If realPnL >= 30% (and overheat < 75): return (profitUSD * 0.40) / tokenPrice
 * 7. If realPnL >= 15% (and overheat < 75): return (profitUSD * 0.25) / tokenPrice
 */

export function calculateDynamicProfitSkim(
  investedCapital: number,
  currentFiatValue: number,
  tokenPrice: number,
  realPnL: number,
  overheatScore: number,
): number {
  const invested = Number(investedCapital);
  const current = Number(currentFiatValue);
  const price = Number(tokenPrice);
  const pnl = Number(realPnL);
  const overheat = Number(overheatScore);

  if (!Number.isFinite(invested) || !Number.isFinite(current) || !Number.isFinite(price) || price <= 0) {
    return 0;
  }

  const profitUSD = current - invested;
  if (profitUSD <= 0) return 0;

  if (!Number.isFinite(pnl) || pnl < 15) return 0;

  if (Number.isFinite(overheat) && overheat >= 75) {
    return profitUSD / price;
  }

  if (pnl >= 50) return (profitUSD * 0.50) / price;
  if (pnl >= 30) return (profitUSD * 0.40) / price;
  if (pnl >= 15) return (profitUSD * 0.25) / price;

  return 0;
}

export interface SkimInputs {
  investedCapital: number;
  currentFiatValue: number;
  tokenPrice: number;
  realPnL: number;
  overheatScore: number;
}

export function calculateDynamicProfitSkimFromObject(inputs: SkimInputs): number {
  return calculateDynamicProfitSkim(
    inputs.investedCapital,
    inputs.currentFiatValue,
    inputs.tokenPrice,
    inputs.realPnL,
    inputs.overheatScore,
  );
}
