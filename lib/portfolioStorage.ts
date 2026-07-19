import type { AssetAccent } from "@/lib/data";
import { getAccentForIndex, resolveAssetCategory } from "@/lib/assetStyles";

export const HOLDINGS_STORAGE_KEY = "edge-trader-holdings";
export const PORTFOLIO_STORAGE_KEY = "edge-trader-portfolio";

export type AssetCategory = "core" | "yield" | "satellite";
export type TransactionType = "DCA" | "ADD" | "REMOVE";

/** @deprecated Legacy fixed trio — kept for DCA engine compatibility */
export type LegacyCryptoSymbol = "BTC" | "ETH" | "SOL";
export type HoldingsMap = Record<LegacyCryptoSymbol, number>;

export interface TrackedAsset {
  id: string;
  symbol: string;
  name: string;
  coingeckoId: string;
  logoUrl: string;
  category: AssetCategory;
  accent?: AssetAccent;
}

export interface Transaction {
  id: string;
  date: string;
  assetId: string;
  symbol: string;
  amount: number;
  priceUsd: number;
  spentUsd: number;
  type: TransactionType;
}

export interface PortfolioData {
  version: 3;
  assets: TrackedAsset[];
  transactions: Transaction[];
}

export interface AssetDefinition {
  symbol: string;
  name: string;
  coingeckoId: string;
  logoUrl: string;
  accent: AssetAccent;
  category: AssetCategory;
}

export const DEFAULT_CORE_ASSETS: AssetDefinition[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    coingeckoId: "bitcoin",
    logoUrl:
      "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
    accent: "orange",
    category: "core",
  },
];

export const DEFAULT_SATELLITE_ASSETS: AssetDefinition[] = [
  {
    symbol: "ETH",
    name: "Ethereum",
    coingeckoId: "ethereum",
    logoUrl:
      "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
    accent: "purple",
    category: "satellite",
  },
  {
    symbol: "SOL",
    name: "Solana",
    coingeckoId: "solana",
    logoUrl:
      "https://assets.coingecko.com/coins/images/4128/small/solana.png",
    accent: "cyan",
    category: "satellite",
  },
];

export const DEFAULT_YIELD_ASSETS: AssetDefinition[] = [
  {
    symbol: "LINK",
    name: "Chainlink",
    coingeckoId: "chainlink",
    logoUrl:
      "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png",
    accent: "cyan",
    category: "yield",
  },
  {
    symbol: "GMX",
    name: "GMX",
    coingeckoId: "gmx",
    logoUrl:
      "https://assets.coingecko.com/coins/images/18323/small/arbit.png",
    accent: "cyan",
    category: "yield",
  },
  {
    symbol: "HYPE",
    name: "Hyperliquid",
    coingeckoId: "hyperliquid",
    logoUrl:
      "https://assets.coingecko.com/coins/images/50882/small/hyperliquid.jpg",
    accent: "cyan",
    category: "yield",
  },
  {
    symbol: "JUP",
    name: "Jupiter",
    coingeckoId: "jupiter-exchange-solana",
    logoUrl:
      "https://assets.coingecko.com/coins/images/34188/small/jup.png",
    accent: "cyan",
    category: "yield",
  },
  {
    symbol: "PENDLE",
    name: "Pendle",
    coingeckoId: "pendle",
    logoUrl:
      "https://assets.coingecko.com/coins/images/15069/small/Pendle_Logo_Normal-03.png",
    accent: "cyan",
    category: "yield",
  },
  {
    symbol: "AAVE",
    name: "Aave",
    coingeckoId: "aave",
    logoUrl:
      "https://assets.coingecko.com/coins/images/12645/small/aave-token-round.png",
    accent: "cyan",
    category: "yield",
  },
  {
    symbol: "MORPHO",
    name: "Morpho",
    coingeckoId: "morpho",
    logoUrl:
      "https://assets.coingecko.com/coins/images/29837/small/morpho.png",
    accent: "cyan",
    category: "yield",
  },
];

export const ASSET_DEFINITIONS = [
  ...DEFAULT_CORE_ASSETS,
  ...DEFAULT_SATELLITE_ASSETS,
];

const LEGACY_DEFAULT_HOLDINGS: HoldingsMap = {
  BTC: 0,
  ETH: 0,
  SOL: 0,
};

export function createAssetId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createTransactionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createTrackedAsset(
  input: Omit<TrackedAsset, "id"> & { id?: string },
): TrackedAsset {
  return {
    id: input.id ?? createAssetId(),
    symbol: input.symbol.toUpperCase(),
    name: input.name,
    coingeckoId: input.coingeckoId,
    logoUrl: input.logoUrl,
    category: input.category,
    accent: input.accent,
  };
}

export function createDefaultPortfolio(): PortfolioData {
  const assets = [
    ...DEFAULT_CORE_ASSETS.map((asset, index) =>
      createTrackedAsset({
        symbol: asset.symbol,
        name: asset.name,
        coingeckoId: asset.coingeckoId,
        logoUrl: asset.logoUrl,
        category: asset.category,
        accent: asset.accent ?? getAccentForIndex(index),
      }),
    ),
    ...DEFAULT_SATELLITE_ASSETS.map((asset, index) =>
      createTrackedAsset({
        symbol: asset.symbol,
        name: asset.name,
        coingeckoId: asset.coingeckoId,
        logoUrl: asset.logoUrl,
        category: asset.category,
        accent: asset.accent ?? getAccentForIndex(index + 1),
      }),
    ),
    ...DEFAULT_YIELD_ASSETS.map((asset) =>
      createTrackedAsset({
        symbol: asset.symbol,
        name: asset.name,
        coingeckoId: asset.coingeckoId,
        logoUrl: asset.logoUrl,
        category: asset.category,
      }),
    ),
  ];

  return { version: 3, assets, transactions: [] };
}

export function resetAllPortfolioData(
  existing?: PortfolioData,
): PortfolioData {
  const base = existing ?? createDefaultPortfolio();
  return {
    version: 3,
    assets: base.assets,
    transactions: [],
  };
}

export function computeBalanceFromTransactions(
  assetId: string,
  transactions: Transaction[],
): number {
  return transactions
    .filter((tx) => tx.assetId === assetId)
    .reduce((sum, tx) => {
      if (tx.type === "REMOVE") return sum - tx.amount;
      return sum + tx.amount;
    }, 0);
}

export function computeHoldingsMap(
  assets: TrackedAsset[],
  transactions: Transaction[],
): HoldingsMap {
  const map: HoldingsMap = { BTC: 0, ETH: 0, SOL: 0 };
  const dcaSymbols: LegacyCryptoSymbol[] = ["BTC", "ETH", "SOL"];

  for (const asset of assets) {
    if (dcaSymbols.includes(asset.symbol as LegacyCryptoSymbol)) {
      map[asset.symbol as LegacyCryptoSymbol] = computeBalanceFromTransactions(
        asset.id,
        transactions,
      );
    }
  }

  return map;
}

function normalizeTransaction(raw: unknown, assets: TrackedAsset[]): Transaction | null {
  if (!raw || typeof raw !== "object") return null;
  const tx = raw as Partial<Transaction> & { symbol?: string };

  if (
    typeof tx.id !== "string" ||
    typeof tx.date !== "string" ||
    typeof tx.amount !== "number" ||
    typeof tx.priceUsd !== "number" ||
    typeof tx.spentUsd !== "number"
  ) {
    return null;
  }

  const type: TransactionType =
    tx.type === "ADD" || tx.type === "REMOVE" || tx.type === "DCA"
      ? tx.type
      : "DCA";

  let assetId = typeof tx.assetId === "string" ? tx.assetId : "";
  let symbol = typeof tx.symbol === "string" ? tx.symbol.toUpperCase() : "";

  if (!assetId && symbol) {
    const match = assets.find(
      (asset) => asset.symbol.toUpperCase() === symbol.toUpperCase(),
    );
    if (match) {
      assetId = match.id;
      symbol = match.symbol;
    }
  }

  if (!assetId || !symbol) return null;

  return {
    id: tx.id,
    date: tx.date,
    assetId,
    symbol,
    amount: Math.max(0, tx.amount),
    priceUsd: Math.max(0, tx.priceUsd),
    spentUsd: Math.max(0, tx.spentUsd),
    type,
  };
}

function normalizeTransactions(
  value: unknown,
  assets: TrackedAsset[],
): Transaction[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => normalizeTransaction(item, assets))
    .filter((item): item is Transaction => item !== null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

function normalizeAssets(value: unknown): TrackedAsset[] {
  if (!Array.isArray(value) || value.length === 0) {
    return createDefaultPortfolio().assets;
  }

  const assets = value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Partial<TrackedAsset>;
      if (
        typeof raw.symbol !== "string" ||
        typeof raw.name !== "string" ||
        typeof raw.coingeckoId !== "string"
      ) {
        return null;
      }

      return createTrackedAsset({
        id: typeof raw.id === "string" ? raw.id : undefined,
        symbol: raw.symbol,
        name: raw.name,
        coingeckoId: raw.coingeckoId,
        logoUrl:
          typeof raw.logoUrl === "string"
            ? raw.logoUrl
            : `https://assets.coingecko.com/coins/images/1/small/bitcoin.png`,
        category: resolveAssetCategory(raw.symbol, raw.category),
        accent: raw.accent,
      });
    })
    .filter((item): item is TrackedAsset => item !== null);

  return assets.length > 0 ? assets : createDefaultPortfolio().assets;
}

function migrateLegacyHoldingsToTransactions(
  holdings: HoldingsMap,
  assets: TrackedAsset[],
  existingTransactions: Transaction[],
): Transaction[] {
  const txs = [...existingTransactions];
  const dcaAssets = assets.filter((asset) =>
    ["BTC", "ETH", "SOL"].includes(asset.symbol),
  );

  for (const asset of dcaAssets) {
    const symbol = asset.symbol as LegacyCryptoSymbol;
    const legacyBalance = holdings[symbol] ?? 0;
    if (legacyBalance <= 0) continue;

    const computed = computeBalanceFromTransactions(asset.id, txs);
    if (computed > 0) continue;

    txs.push({
      id: createTransactionId(),
      date: new Date().toISOString(),
      assetId: asset.id,
      symbol: asset.symbol,
      amount: legacyBalance,
      priceUsd: 0,
      spentUsd: 0,
      type: "ADD",
    });
  }

  return txs;
}

function migrateLegacyPortfolio(parsed: Record<string, unknown>): PortfolioData {
  const defaultPortfolio = createDefaultPortfolio();
  const assets = defaultPortfolio.assets;

  const legacyHoldings = parsed.holdings as Partial<HoldingsMap> | undefined;
  const holdings: HoldingsMap = {
    BTC: Math.max(0, Number(legacyHoldings?.BTC) || 0),
    ETH: Math.max(0, Number(legacyHoldings?.ETH) || 0),
    SOL: Math.max(0, Number(legacyHoldings?.SOL) || 0),
  };

  let transactions = normalizeTransactions(parsed.transactions, assets);
  transactions = migrateLegacyHoldingsToTransactions(
    holdings,
    assets,
    transactions,
  );

  return { version: 3, assets, transactions };
}

export function normalizePortfolioData(raw: unknown): PortfolioData {
  if (!raw || typeof raw !== "object") {
    return createDefaultPortfolio();
  }

  const parsed = raw as Record<string, unknown>;

  if (parsed.version === 3 && Array.isArray(parsed.assets)) {
    const assets = normalizeAssets(parsed.assets);
    const transactions = normalizeTransactions(parsed.transactions, assets);
    return { version: 3, assets, transactions };
  }

  if (parsed.holdings) {
    return migrateLegacyPortfolio(parsed);
  }

  return createDefaultPortfolio();
}

export function readPortfolioFromStorage(): PortfolioData | null {
  if (typeof window === "undefined") return null;

  try {
    const portfolioRaw = window.localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (portfolioRaw) {
      return normalizePortfolioData(JSON.parse(portfolioRaw));
    }

    const legacyRaw = window.localStorage.getItem(HOLDINGS_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as Partial<HoldingsMap>;
      return migrateLegacyPortfolio({ holdings: parsed, transactions: [] });
    }

    return null;
  } catch {
    return null;
  }
}

export function writePortfolioToStorage(data: PortfolioData): void {
  if (typeof window === "undefined") return;
  const normalized = normalizePortfolioData(data);
  window.localStorage.setItem(
    PORTFOLIO_STORAGE_KEY,
    JSON.stringify(normalized),
  );
  window.localStorage.setItem(
    HOLDINGS_STORAGE_KEY,
    JSON.stringify(computeHoldingsMap(normalized.assets, normalized.transactions)),
  );
}

export function readHoldingsFromStorage(): HoldingsMap | null {
  const portfolio = readPortfolioFromStorage();
  if (!portfolio) return null;
  return computeHoldingsMap(portfolio.assets, portfolio.transactions);
}

export function writeHoldingsToStorage(holdings: HoldingsMap): void {
  const existing = readPortfolioFromStorage() ?? createDefaultPortfolio();
  const transactions = migrateLegacyHoldingsToTransactions(
    holdings,
    existing.assets,
    existing.transactions,
  );
  writePortfolioToStorage({
    version: 3,
    assets: existing.assets,
    transactions,
  });
}

export function findAssetByCoingeckoId(
  assets: TrackedAsset[],
  coingeckoId: string,
): TrackedAsset | undefined {
  return assets.find((asset) => asset.coingeckoId === coingeckoId);
}

export function findAssetBySymbol(
  assets: TrackedAsset[],
  symbol: string,
): TrackedAsset | undefined {
  return assets.find(
    (asset) => asset.symbol.toUpperCase() === symbol.toUpperCase(),
  );
}
