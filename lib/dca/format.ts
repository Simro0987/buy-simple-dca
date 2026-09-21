import type { DcaSymbol } from "@/lib/dca/types";

export function formatEstimatedQty(amount: number, symbol: DcaSymbol | string): string {
  const decimals = symbol === "BTC" ? 6 : symbol === "ETH" || symbol === "ZEC" ? 5 : 4;
  if (!Number.isFinite(amount) || amount <= 0) return `— ${symbol}`;
  return `${amount.toFixed(decimals)} ${symbol}`;
}

export function formatPercent(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatApy(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "n/a";
  return `${value.toFixed(2)}%`;
}

export function formatWeekStart(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + mondayOffset);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const dayNum = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${dayNum}`;
}
