import type { CryptoSymbol } from "@/lib/cryptoApi";
import type { AssetAccent } from "@/lib/data";
import { isDcaSymbol } from "@/lib/dca/universe";

export const HOLDINGS_STORAGE_KEY = "edge-trader-holdings";
export const PORTFOLIO_STORAGE_KEY = "edge-trader-portfolio";

export type HoldingsMap = Record<CryptoSymbol, number>;

export interface Transaction {
  id: string;
  date: string;
  symbol: string;
  amount: number;
  priceUsd: number;
  spentUsd: number;
  type: "DCA";
}

export interface PortfolioData {
  holdings: HoldingsMap;
  transactions: Transaction[];
}

export interface AssetDefinition {
  symbol: CryptoSymbol;
  name: string;
  accent: AssetAccent;
}

export const DEFAULT_HOLDINGS: HoldingsMap = {
  BTC: 0.0482,
  ETH: 0.612,
  SOL: 4.28,
};

export const DEFAULT_PORTFOLIO: PortfolioData = {
  holdings: DEFAULT_HOLDINGS,
  transactions: [],
};

export const ASSET_DEFINITIONS: AssetDefinition[] = [
  { symbol: "BTC", name: "Bitcoin", accent: "orange" },
  { symbol: "ETH", name: "Ethereum", accent: "purple" },
  { symbol: "SOL", name: "Solana", accent: "cyan" },
];

function normalizeHoldings(value: unknown): HoldingsMap {
  const record = (value ?? {}) as Partial<HoldingsMap>;
  return {
    BTC: Math.max(0, Number(record.BTC) || 0),
    ETH: Math.max(0, Number(record.ETH) || 0),
    SOL: Math.max(0, Number(record.SOL) || 0),
  };
}

function normalizeTransactions(value: unknown): Transaction[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item): item is Transaction => {
      if (!item || typeof item !== "object") return false;
      const tx = item as Partial<Transaction>;
      return (
        typeof tx.id === "string" &&
        typeof tx.date === "string" &&
        typeof tx.symbol === "string" &&
        isDcaSymbol(tx.symbol) &&
        typeof tx.amount === "number" &&
        typeof tx.priceUsd === "number" &&
        typeof tx.spentUsd === "number" &&
        tx.type === "DCA"
      );
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function readPortfolioFromStorage(): PortfolioData | null {
  if (typeof window === "undefined") return null;

  try {
    const portfolioRaw = window.localStorage.getItem(PORTFOLIO_STORAGE_KEY);
    if (portfolioRaw) {
      const parsed = JSON.parse(portfolioRaw) as Partial<PortfolioData>;
      return {
        holdings: normalizeHoldings(parsed.holdings),
        transactions: normalizeTransactions(parsed.transactions),
      };
    }

    const legacyRaw = window.localStorage.getItem(HOLDINGS_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as Partial<HoldingsMap>;
      return {
        holdings: normalizeHoldings(parsed),
        transactions: [],
      };
    }

    return null;
  } catch {
    return null;
  }
}

export function writePortfolioToStorage(data: PortfolioData): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PORTFOLIO_STORAGE_KEY, JSON.stringify(data));
  window.localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(data.holdings));
}

export function readHoldingsFromStorage(): HoldingsMap | null {
  return readPortfolioFromStorage()?.holdings ?? null;
}

export function writeHoldingsToStorage(holdings: HoldingsMap): void {
  const existing = readPortfolioFromStorage();
  writePortfolioToStorage({
    holdings,
    transactions: existing?.transactions ?? [],
  });
}

export function createTransactionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `tx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
