import { buildConfluenceRegime, EMPTY_REGIME_METRICS } from "@/lib/dca/confluence";
import type { MarketRegime, TokenMarketSnapshot } from "@/lib/dca/types";

/** @deprecated Use buildConfluenceRegime. Kept for older money-mode panels. */
export function buildMarketRegime(
  btc: TokenMarketSnapshot | undefined,
  moneyMode: boolean,
): MarketRegime {
  return buildConfluenceRegime(btc, EMPTY_REGIME_METRICS, moneyMode);
}
