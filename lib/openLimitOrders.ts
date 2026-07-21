const STORAGE_KEY = "edge-trader-open-limit-orders";

export interface OpenLimitOrder {
  symbol: string;
  limitPrice: number;
  limitUsd: number;
  createdAt: string;
}

function readAll(): OpenLimitOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OpenLimitOrder[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(orders: OpenLimitOrder[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
}

export function registerOpenLimitOrder(order: OpenLimitOrder): void {
  const existing = readAll().filter((item) => item.symbol !== order.symbol);
  writeAll([order, ...existing]);
}

export function cancelOpenLimitOrder(symbol: string): void {
  writeAll(readAll().filter((item) => item.symbol !== symbol));
}

export function isLimitOrderOpen(symbol: string): boolean {
  return readAll().some((item) => item.symbol === symbol);
}
