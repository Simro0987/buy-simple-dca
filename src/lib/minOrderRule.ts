/**
 * Univerzálne "$10 Rule" (Order Routing) pre všetky tokeny.
 *
 * Burzy odmietajú príliš malé príkazy, preto pri malých alokáciách nedelíme
 * kapitál na zlomky, ale konsolidujeme ho na 100 % MKT alebo 100 % LMT
 * podľa toho, čo je v danom momente optimálnejšie z pohľadu indikátorov.
 */

export const MIN_ORDER_USD = 10;

/**
 * $10 Rule platí VÝHRADNE pre tieto tokeny. Pre ostatné (BTC, ETH, LINK,
 * AAVE) sa vždy použije dynamický matematický split 0–100 %.
 */
export const MIN_ORDER_TOKENS = ['SOL', 'HYPE'] as const;

export function isMinOrderRuleToken(symbol?: string | null): boolean {
  if (!symbol) return false;
  return (MIN_ORDER_TOKENS as readonly string[]).includes(symbol.toUpperCase());
}

/** RSI hranica: pod ňou je oversold → kúp hneď (Market), nad ňou čakaj na zľavu (Limit). */
const CONSOLIDATION_RSI = 45;

export interface MinOrderInput {
  /** Symbol tokenu — pravidlo sa aplikuje len na SOL / HYPE. */
  symbol?: string;
  totalUsd: number;
  marketPct: number;
  limitPct: number;
  /** RSI(14) — rozhoduje o smere konsolidácie. */
  rsi: number | null;
  /** Voliteľne: cena je nad/pod trendom (napr. price > SMA200) — bull podporuje Market. */
  bullish?: boolean;
}


export interface MinOrderResult {
  marketPct: number;
  limitPct: number;
  marketUsd: number;
  limitUsd: number;
  merged: boolean;
  mergedInto: 'market' | 'limit' | null;
  mergeReason: string | null;
}

export function applyMinOrderRule(input: MinOrderInput): MinOrderResult {
  const { totalUsd, rsi, bullish } = input;
  const mPct = Math.min(100, Math.max(0, input.marketPct));
  const lPct = 100 - mPct;

  const plain: MinOrderResult = {
    marketPct: mPct,
    limitPct: lPct,
    marketUsd: (totalUsd * mPct) / 100,
    limitUsd: totalUsd - (totalUsd * mPct) / 100,
    merged: false,
    mergedInto: null,
    mergeReason: null,
  };

  if (totalUsd <= 0) return plain;
  // Pravidlo je povolené len pre SOL / HYPE.
  if (!isMinOrderRuleToken(input.symbol)) return plain;


  const rsiVal = typeof rsi === 'number' && Number.isFinite(rsi) ? rsi : 50;
  const preferMarket = rsiVal < CONSOLIDATION_RSI || (bullish === true && rsiVal < 60);
  const rsiTxt = rsiVal.toFixed(0);

  const toMarket = (reason: string): MinOrderResult => ({
    marketPct: 100, limitPct: 0, marketUsd: totalUsd, limitUsd: 0,
    merged: true, mergedInto: 'market', mergeReason: reason,
  });
  const toLimit = (reason: string): MinOrderResult => ({
    marketPct: 0, limitPct: 100, marketUsd: 0, limitUsd: totalUsd,
    merged: true, mergedInto: 'limit', mergeReason: reason,
  });

  // 1) Celková alokácia pod $10 → 100 % jedna strana.
  if (totalUsd < MIN_ORDER_USD) {
    return preferMarket
      ? toMarket(`Total $${totalUsd.toFixed(2)} < $${MIN_ORDER_USD} · RSI ${rsiTxt} → 100 % Market (mikro-nákup)`)
      : toLimit(`Total $${totalUsd.toFixed(2)} < $${MIN_ORDER_USD} · RSI ${rsiTxt} → 100 % Limit (mikro-nákup so zľavou)`);
  }

  // 2) Jedna z nôh pod $10 → konsolidujeme do tej väčšej / vhodnejšej.
  if (plain.limitUsd > 0 && plain.limitUsd < MIN_ORDER_USD) {
    return toMarket(`LMT noha $${plain.limitUsd.toFixed(2)} < $${MIN_ORDER_USD} → 100 % Market`);
  }
  if (plain.marketUsd > 0 && plain.marketUsd < MIN_ORDER_USD) {
    return toLimit(`MKT noha $${plain.marketUsd.toFixed(2)} < $${MIN_ORDER_USD} → 100 % Limit`);
  }

  return plain;
}
