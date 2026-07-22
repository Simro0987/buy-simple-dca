/** Institutional DeFi Mozog — shared constants & contract addresses. */

export const STAKE_FOCUS_SYMBOL = "ETH";

export const GAS_RESERVE_PCT = 20;

/** 0.50 % APY penalizácia pre Lido pred WMA alokáciou. */
export const RISK_PENALTY_BPS = 50;

export const WMA_CLAMP_MIN_PCT = 30;
export const WMA_CLAMP_MAX_PCT = 70;

export const WSTETH_ADDRESS =
  "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0" as const;
export const RETH_ADDRESS =
  "0xae78736Cd615f374D3085123A210448E74Fc6393" as const;
export const EARNETH_VAULT_ADDRESS =
  "0xEEF0f605245b4c364b209C947daBD8f83047a991" as const;

export const ETH_PUBLIC_RPC = "https://cloudflare-eth.com";

export const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";
export const COINGECKO_ETH_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd";

export const FETCH_TIMEOUT_MS = 3_000;

/** Hardcodované gas limity (Module 2). */
export const GAS_LIMITS = {
  nativeMint: 85_000,
  dexSwap: 180_000,
  earnEthDeposit: 120_000,
} as const;

export type GasLimitKey = keyof typeof GAS_LIMITS;

export const DEX_WHITELIST = [
  { id: "cowswap", label: "CowSwap", quoteUrl: "https://api.cow.fi/mainnet/api/v1/quote" },
  { id: "oneinch", label: "1inch", quoteUrl: "https://api.1inch.dev/swap/v6.0/1/quote" },
  { id: "jumper", label: "Jumper", quoteUrl: "https://li.quest/v1/quote" },
  { id: "uniswap", label: "Uniswap", quoteUrl: null },
] as const;

export type DexId = (typeof DEX_WHITELIST)[number]["id"];

export const STETH_TOKEN = "ETH → stETH";
export const WSTETH_TOKEN = "ETH → wstETH";
export const RETH_TOKEN = "ETH → rETH";

export const FALLBACK_ETH_USD = 3500;
export const FALLBACK_LIDO_APY = 2.2;
export const FALLBACK_ROCKET_APY = 2.2;
export const FALLBACK_BASE_FEE_GWEI = 18.5;
