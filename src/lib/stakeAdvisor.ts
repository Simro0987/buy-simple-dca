// Network-aware staking advisor.
// Pure, stateless math: maps (liquid balance, price, market cycle score)
// → recommended stake amount, with gas buffers, dust filters and
// continuous interpolation between accumulation (≤25) and distribution (>55).
//
// STRICT POLICY:
//  • BTC never auto-prefills (manual intentional entry only).
//  • Score > 55 hides every quick-action badge and disables planner prefill.
//  • All decisions are advisory — finalize on the hardware wallet.

import { Lang } from '@/lib/i18n';

export type AdvisorSymbol = 'BTC' | 'ETH' | 'SOL';

export interface AdvisorInput {
  symbol: AdvisorSymbol;
  liquidQty: number;       // un-staked native quantity in the wallet
  pricePerUnit: number;    // current USD price per native unit
  marketScore: number;     // 0-100, live cycle score
}

export interface AdvisorBreakdown {
  liquidQty: number;
  liquidUsd: number;
  gasBufferQty: number;
  gasBufferUsd: number;
  tradingReserveQty: number;
  tradingReserveUsd: number;
  recommendedQty: number;
  recommendedUsd: number;
  recommendedPct: number;  // 0-100 of post-gas liquid
}

export interface AdvisorResult {
  symbol: AdvisorSymbol;
  eligible: boolean;       // badge should render
  zone: 'accumulation' | 'transition' | 'overheated';
  manualOnly: boolean;     // BTC → prefill amount is 0
  breakdown: AdvisorBreakdown;
}

// Network constants
const GAS_BUFFER: Record<AdvisorSymbol, number> = { BTC: 0, ETH: 0.02, SOL: 0.1 };
const DUST_USD: Record<AdvisorSymbol, number> = { BTC: 200, ETH: 30, SOL: 5 };
const DECIMALS: Record<AdvisorSymbol, number> = { BTC: 4, ETH: 3, SOL: 2 };

/** Continuous interpolation curve based on the live market cycle score. */
export function curvePct(score: number): number {
  if (score <= 25) return 90;
  if (score >= 55) return 0;
  // Linear ramp 90% (@25) → 0% (@55)
  return 90 * (1 - (score - 25) / 30);
}

export function zoneFromScore(score: number): AdvisorResult['zone'] {
  if (score <= 25) return 'accumulation';
  if (score > 55) return 'overheated';
  return 'transition';
}

export function roundQty(symbol: AdvisorSymbol, qty: number): number {
  const d = DECIMALS[symbol];
  const f = Math.pow(10, d);
  return Math.floor(qty * f) / f;
}

export function computeAdvice(input: AdvisorInput): AdvisorResult {
  const { symbol, liquidQty, pricePerUnit, marketScore } = input;
  const liquidUsd = liquidQty * pricePerUnit;
  const gasBufferQty = GAS_BUFFER[symbol];
  const gasBufferUsd = gasBufferQty * pricePerUnit;

  const postGasQty = Math.max(0, liquidQty - gasBufferQty);
  const postGasUsd = postGasQty * pricePerUnit;

  const zone = zoneFromScore(marketScore);
  const pctRaw = curvePct(marketScore);

  // BTC never auto-prefills.
  const manualOnly = symbol === 'BTC';
  const recommendedPct = manualOnly ? 0 : pctRaw;

  const recommendedQtyRaw = postGasQty * (recommendedPct / 100);
  const recommendedQty = roundQty(symbol, recommendedQtyRaw);
  const recommendedUsd = recommendedQty * pricePerUnit;

  const tradingReserveQty = Math.max(0, postGasQty - recommendedQtyRaw);
  const tradingReserveUsd = tradingReserveQty * pricePerUnit;

  // Eligibility: badge visibility rules.
  let eligible = false;
  if (zone === 'overheated') {
    eligible = false; // hide all badges
  } else if (manualOnly) {
    // BTC: show whenever liquid > dust, even though recommended = 0.
    eligible = liquidUsd >= DUST_USD.BTC;
  } else {
    eligible = recommendedUsd >= DUST_USD[symbol] && recommendedQty > 0;
  }

  return {
    symbol,
    eligible,
    zone,
    manualOnly,
    breakdown: {
      liquidQty,
      liquidUsd,
      gasBufferQty,
      gasBufferUsd,
      tradingReserveQty,
      tradingReserveUsd,
      recommendedQty,
      recommendedUsd,
      recommendedPct,
    },
  };
}

/** Localized strategic commentary for the popover audit trail. */
export function strategyCommentary(score: number, lang: Lang): { icon: string; text: string } {
  const sk = lang === 'sk';
  if (score <= 25) {
    return {
      icon: '🟢',
      text: sk
        ? 'Trh je na dne cyklu (Kapitulácia). Ceny sú nízke, preto maximalizujeme pasívny príjem a odporúčame uzamknúť až 90% voľného objemu. Predaj v dohľadnej dobe nedáva zmysel.'
        : 'Market is at cycle bottom (capitulation). Lock up to 90% of free balance for passive yield — selling soon makes no sense.',
    };
  }
  if (score > 55) {
    return {
      icon: '🔴',
      text: sk
        ? 'Trh je nebezpečne prehriaty a blíži sa k vrcholu. Nový staking je zablokovaný. Musíš držať 100% natívnu likviditu na hardware peňaženke, aby si mohol okamžite vybrať zisky cez Swap, kým trh neklesne.'
        : 'Market is dangerously overheated. New staking is blocked — keep 100% native liquidity on your HW wallet for immediate take-profit swaps.',
    };
  }
  return {
    icon: '🟡',
    text: sk
      ? 'Trh je v stabilnej fáze. Udržujeme vyvážený prístup – väčšinu voľných mincí smerujeme do stakingu, ale plynule si budujeme 25%-30% likvidnú natívnu rezervu pripravenú na peňaženke pre prvé výbery ziskov (Take Profit).'
      : 'Market is stable. Balanced approach — most coins go to staking while building a 25–30% native liquid reserve for first take-profit withdrawals.',
  };
}

export function overheatedWarning(lang: Lang): string {
  return lang === 'sk'
    ? '⚠️ Trh je v prehriatej fáze. Nový staking sa neodporúča. Udržuj 100% natívnu likviditu pre okamžitý Take Profit odpredaj.'
    : '⚠️ Market is overheated. New staking is discouraged — keep 100% native liquidity for immediate take-profit selling.';
}
