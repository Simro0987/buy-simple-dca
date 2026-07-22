/** Institutional LINK DeFi Mozog — Arbitrum Morpho Blue, no-looping. */

export const STAKE_FOCUS_SYMBOL = "LINK";

/** Gas na Arbitrum sa platí v ETH — pracovný kapitál je 100 % LINK. */
export const WORKING_CAPITAL_PCT = 100;

export const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";
export const COINGECKO_LINK_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=chainlink&vs_currencies=usd";

export const FETCH_TIMEOUT_MS = 3_000;

export const MORPHO_BLUE_ARBITRUM = {
  label: "Morpho Blue Vaults",
  network: "Arbitrum",
  url: "https://app.morpho.org/arbitrum",
  /** Representative Arbitrum LINK supply market vault. */
  vaultAddress: "0x4f1C2E1d4B8E2b3C5D6E7F8091a2B3c4D5e6F708",
} as const;

export const FALLBACK_LINK_USD = 15;
export const FALLBACK_MORPHO_APY = 4.5;

export const NO_LOOP_WARNING =
  "⚠️ Ochrana kapitálu: LINK nie je LST (Liquid Staking Token). Looping bežných tokenov prináša extrémne riziko cenovej likvidácie. Povolený je len bezpečný vklad (Supply).";

export const PORTFOLIO_MORPHO_SUPPLY_SYMBOL = "LINK-MORPHO";
export const PORTFOLIO_MORPHO_SUPPLY_NAME = "LINK (Morpho Supply)";
