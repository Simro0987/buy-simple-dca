/** Institutional Solana DeFi Mozog — shared constants. */

export const STAKE_FOCUS_SYMBOL = "SOL";

export const GAS_RESERVE_PCT = 20;

/** 1.00 % APY penalizácia pre Jito (restaking risk) pred WMA alokáciou. */
export const RISK_PENALTY_BPS = 100;

export const WMA_CLAMP_MIN_PCT = 30;
export const WMA_CLAMP_MAX_PCT = 70;

export const SOLANA_RPC_URL = "https://api.mainnet-beta.solana.com";

export const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";
export const COINGECKO_SOL_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

export const JUPITER_QUOTE_URL = "https://quote-api.jup.ag/v6/quote";

export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const JITOSOL_MINT = "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn";

export const JITO_STAKE_POOL_API =
  "https://kobe.mainnet.jito.network/api/v1/stake_pool_stats";

export const FETCH_TIMEOUT_MS = 3_000;

/** Hardcodované odhady poplatkov v SOL. */
export const SOL_FEE_ESTIMATES = {
  nativeStake: 0.000005,
  dexSwapMin: 0.00005,
  dexSwapMax: 0.0001,
  restakingDeposit: 0.00001,
} as const;

export const LAMPORTS_PER_SOL = 1_000_000_000;

export const FALLBACK_SOL_USD = 150;
export const FALLBACK_MARINADE_APY = 7.0;
export const FALLBACK_JITO_APY = 8.0;
export const FALLBACK_JITOSOL_PER_SOL = 0.98;

export const MARINADE_EARN_URL = "app.marinade.finance/earn";

/** Portfolio asset symbols after execution. */
export const PORTFOLIO_MARINADE_SYMBOL = "MND-NATIVE";
export const PORTFOLIO_JITO_RESTAKED_SYMBOL = "JITO-RS";
