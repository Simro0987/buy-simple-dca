import { LIMIT_VALIDITY_DAYS } from "@/lib/dca/executionMath";
import { roundUsd } from "@/lib/dca/math";
import type { DcaSymbol, LimitLeg } from "@/lib/dca/types";

export const EXECUTION_STORAGE_KEY = "edge-trader-execution-ledger";

export type PortfolioAssetStatus = "Zrealizované";
export type PendingOrderStatus = "Čakajúca";
export type ExecutionSide = "market" | "limit";

export function normalizeLimitLeg(leg?: string | null): LimitLeg {
  return leg === "lmt2" ? "lmt2" : "lmt1";
}

export interface PortfolioAssetRecord {
  id: string;
  symbol: DcaSymbol;
  status: PortfolioAssetStatus;
  side: ExecutionSide;
  spentUsd: number;
  priceUsd: number;
  tokenVolume: number;
  createdAt: string;
  filledAt: string;
  limitLeg?: LimitLeg;
}

export interface PendingOrder {
  id: string;
  symbol: DcaSymbol;
  status: PendingOrderStatus;
  spentUsd: number;
  lockedLimitPrice: number;
  tokenVolume: number;
  activatedAt: string;
  expiresAt: string;
  leg?: LimitLeg;
}

export interface ExecutionLedger {
  portfolio_assets: PortfolioAssetRecord[];
  pending_orders: PendingOrder[];
}

export const EMPTY_LEDGER: ExecutionLedger = {
  portfolio_assets: [],
  pending_orders: [],
};

export function createLedgerId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function limitExpiresAt(from = new Date()): string {
  const expires = new Date(from.getTime() + LIMIT_VALIDITY_DAYS * 24 * 60 * 60 * 1000);
  return expires.toISOString();
}

/** Limit vs live: negative means the limit sits below spot. */
export function spotDistancePercent(targetPrice: number, livePrice: number): number {
  if (!(livePrice > 0) || !(targetPrice > 0)) return 0;
  return ((targetPrice - livePrice) / livePrice) * 100;
}

export function formatSpotDistance(targetPrice: number, livePrice: number): string {
  if (!(livePrice > 0) || !(targetPrice > 0)) return "—";
  const pct = spotDistancePercent(targetPrice, livePrice);
  const abs = Math.abs(pct).toFixed(1);
  if (pct < 0) return `−${abs}% pod spotom`;
  if (pct > 0) return `+${abs}% nad spotom`;
  return "0.0% vs spot";
}

export function formatLockedDistance(lockedPrice: number, livePrice: number): string {
  if (!(livePrice > 0) || !(lockedPrice > 0)) return "—";
  const pct = spotDistancePercent(lockedPrice, livePrice);
  const abs = Math.abs(pct).toFixed(1);
  if (pct < 0) return `Live ${abs}% nad lockom`;
  if (pct > 0) return `Live ${abs}% pod lockom`;
  return "Live = lock";
}

export function formatCountdown(expiresAt: string, nowMs = Date.now()): string {
  const remaining = new Date(expiresAt).getTime() - nowMs;
  if (!Number.isFinite(remaining) || remaining <= 0) return "Expiruje za: 0d 0h 0m";
  const totalMin = Math.floor(remaining / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const minutes = totalMin % 60;
  return `Expiruje za: ${days}d ${hours}h ${minutes}m`;
}

export function copyUsd(value: number): string {
  return roundUsd(value).toFixed(2);
}

export function copyPrice(value: number): string {
  if (!(value > 0)) return "";
  if (value >= 1000) return value.toFixed(2);
  if (value >= 1) return value.toFixed(4);
  return value.toFixed(6);
}

export function copyQty(value: number, symbol: DcaSymbol | string): string {
  if (!(value > 0)) return "";
  const decimals = symbol === "BTC" ? 6 : symbol === "ETH" || symbol === "ZEC" ? 5 : 4;
  return value.toFixed(decimals);
}

export function ledgerReserveImpact(ledger: ExecutionLedger): number {
  const realized = ledger.portfolio_assets.reduce((sum, row) => sum + row.spentUsd, 0);
  const locked = ledger.pending_orders.reduce((sum, row) => sum + row.spentUsd, 0);
  return roundUsd(-(realized + locked));
}

export function expirePendingOrders(
  pending: PendingOrder[],
  nowMs = Date.now(),
): { kept: PendingOrder[]; expired: PendingOrder[] } {
  const kept: PendingOrder[] = [];
  const expired: PendingOrder[] = [];
  for (const order of pending) {
    if (new Date(order.expiresAt).getTime() <= nowMs) expired.push(order);
    else kept.push(order);
  }
  return { kept, expired };
}
