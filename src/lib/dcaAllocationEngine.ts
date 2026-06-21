/**
 * DCA Allocation Engine — plynulé krivky (žiadne skokové pásma).
 * Budget: skóre 0 → 100 % deploy, skóre 100 → 20 % deploy.
 * Tokeny: BTC ≥ 50 %, bonus podľa strachu; ETH > SOL v satelite.
 */

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

/** Plynulá alokácia rozpočtu z kompozitného skóre (0 = extrémny strach … 100 = vrchol). */
export function continuousBudgetPct(score: number): number {
  const s = clamp(score, 0, 100);
  // Lineárna krivka: 100 % pri 0, 20 % pri 100
  return clamp(100 - s * 0.8, 20, 100);
}

export function budgetWhyText(score: number, deployPct: number, capital: number): string {
  const reserved = capital * (1 - deployPct / 100);
  return [
    `Prečo? Komozitné skóre ${Math.round(score)}/100 riadi plynulú krivku 100 % − skóre×0,8.`,
    `Týždenný strop $${capital.toFixed(0)} → deploy ${deployPct.toFixed(1)} % (${(capital * deployPct / 100).toFixed(0)} $),`,
    `Cash Reserve ${(100 - deployPct).toFixed(1)} % (${reserved.toFixed(0)} $).`,
  ].join(' ');
}

export interface TokenSplit {
  btc: number;
  eth: number;
  sol: number;
}

/** BTC: 50 % + až 30 % bonus pri strachu. ETH vždy > SOL v zvyšku. */
export function continuousTokenSplit(marketScore: number): TokenSplit & { why: string } {
  const t = clamp(marketScore, 0, 100) / 100;
  const btc = 50 + (1 - t) * 30;
  const remainder = 100 - btc;
  const ethShare = clamp(0.55 + (1 - t) * 0.25, 0.55, 0.85);
  const eth = remainder * ethShare;
  const sol = remainder - eth;

  const btcR = Math.round(btc * 10) / 10;
  const ethR = Math.round(eth * 10) / 10;
  const solR = Math.round((100 - btcR - ethR) * 10) / 10;

  const fear = marketScore <= 25;
  const greed = marketScore >= 75;
  const why = fear
    ? `Prečo? Vysoký strach na trhu (skóre ${Math.round(marketScore)}) aktivoval defenzívny režim. BTC štít zvýšený na ${btcR.toFixed(0)} %, altcoiny utlmené na ${(ethR + solR).toFixed(0)} % (ETH ${ethR.toFixed(0)} % > SOL ${solR.toFixed(0)} %).`
    : greed
      ? `Prečo? Trh pri vrchole (skóre ${Math.round(marketScore)}) — BTC kotva na minime ${btcR.toFixed(0)} %, satelity ${(ethR + solR).toFixed(0)} % (ETH ${ethR.toFixed(0)} % > SOL ${solR.toFixed(0)} %).`
      : `Prečo? Neutrálne skóre ${Math.round(marketScore)} — plynulý split BTC ${btcR.toFixed(0)} % / ETH ${ethR.toFixed(0)} % / SOL ${solR.toFixed(0)} % (ETH dominuje v satelite).`;

  return { btc: btcR, eth: ethR, sol: solR, why };
}

export function tokenWeightFraction(symbol: string, split: TokenSplit): number {
  if (symbol === 'BTC') return split.btc / 100;
  if (symbol === 'ETH') return split.eth / 100;
  if (symbol === 'SOL') return split.sol / 100;
  return 0;
}
