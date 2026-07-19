import type { CryptoSymbol } from "@/lib/cryptoApi";
import type { AssetAccent } from "@/lib/data";

export const HOLDINGS_STORAGE_KEY = "edge-trader-holdings";

export type HoldingsMap = Record<CryptoSymbol, number>;

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

export const ASSET_DEFINITIONS: AssetDefinition[] = [
  { symbol: "BTC", name: "Bitcoin", accent: "orange" },
  { symbol: "ETH", name: "Ethereum", accent: "purple" },
  { symbol: "SOL", name: "Solana", accent: "cyan" },
];

export function readHoldingsFromStorage(): HoldingsMap | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(HOLDINGS_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<HoldingsMap>;
    return {
      BTC: Number(parsed.BTC) || 0,
      ETH: Number(parsed.ETH) || 0,
      SOL: Number(parsed.SOL) || 0,
    };
  } catch {
    return null;
  }
}

export function writeHoldingsToStorage(holdings: HoldingsMap): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(holdings));
}
