"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createLedgerId,
  EMPTY_LEDGER,
  EXECUTION_STORAGE_KEY,
  expirePendingOrders,
  limitExpiresAt,
  type ExecutionLedger,
  type PendingOrder,
  type PortfolioAssetRecord,
} from "@/lib/dca/executionLedger";
import { roundUsd } from "@/lib/dca/math";
import type { DcaSymbol, TokenExecutionPlan } from "@/lib/dca/types";
import { isInCurrentDcaWeek } from "@/lib/dcaEngineConfig";

interface ExecutionStore extends ExecutionLedger {
  activateMarket: (plan: TokenExecutionPlan, livePrice: number) => PortfolioAssetRecord | null;
  activateLimit: (plan: TokenExecutionPlan) => PendingOrder | null;
  fillPending: (id: string) => PortfolioAssetRecord | null;
  cancelPending: (id: string) => PendingOrder | null;
  expireDue: (nowMs?: number) => PendingOrder[];
  pendingFor: (symbol: DcaSymbol) => PendingOrder | undefined;
  marketFillThisWeek: (symbol: DcaSymbol) => PortfolioAssetRecord | undefined;
  limitFillThisWeek: (symbol: DcaSymbol) => PortfolioAssetRecord | undefined;
}

export const useExecutionStore = create<ExecutionStore>()(
  persist(
    (set, get) => ({
      ...EMPTY_LEDGER,
      pendingFor: (symbol) =>
        get().pending_orders.find((order) => order.symbol === symbol),
      marketFillThisWeek: (symbol) =>
        get().portfolio_assets.find(
          (row) =>
            row.symbol === symbol &&
            row.side === "market" &&
            isInCurrentDcaWeek(row.filledAt),
        ),
      limitFillThisWeek: (symbol) =>
        get().portfolio_assets.find(
          (row) =>
            row.symbol === symbol &&
            row.side === "limit" &&
            isInCurrentDcaWeek(row.filledAt),
        ),
      activateMarket: (plan, livePrice) => {
        if (plan.marketUsd <= 0 || !(livePrice > 0)) return null;
        if (get().marketFillThisWeek(plan.symbol)) return null;
        const spentUsd = roundUsd(plan.marketUsd);
        const tokenVolume = spentUsd / livePrice;
        const now = new Date().toISOString();
        const record: PortfolioAssetRecord = {
          id: createLedgerId("mkt"),
          symbol: plan.symbol,
          status: "Zrealizované",
          side: "market",
          spentUsd,
          priceUsd: livePrice,
          tokenVolume,
          createdAt: now,
          filledAt: now,
        };
        set((state) => ({
          portfolio_assets: [record, ...state.portfolio_assets],
        }));
        return record;
      },
      activateLimit: (plan) => {
        if (plan.limitUsd <= 0 || !(plan.limitPrice > 0)) return null;
        if (get().pendingFor(plan.symbol) || get().limitFillThisWeek(plan.symbol)) {
          return null;
        }
        const spentUsd = roundUsd(plan.limitUsd);
        const lockedLimitPrice = plan.limitPrice;
        const now = new Date();
        const order: PendingOrder = {
          id: createLedgerId("lmt"),
          symbol: plan.symbol,
          status: "Čakajúca",
          spentUsd,
          lockedLimitPrice,
          tokenVolume: spentUsd / lockedLimitPrice,
          activatedAt: now.toISOString(),
          expiresAt: limitExpiresAt(now),
        };
        set((state) => ({
          pending_orders: [order, ...state.pending_orders],
        }));
        return order;
      },
      fillPending: (id) => {
        const order = get().pending_orders.find((item) => item.id === id);
        if (!order) return null;
        const now = new Date().toISOString();
        const record: PortfolioAssetRecord = {
          id: createLedgerId("fill"),
          symbol: order.symbol,
          status: "Zrealizované",
          side: "limit",
          spentUsd: order.spentUsd,
          priceUsd: order.lockedLimitPrice,
          tokenVolume: order.tokenVolume,
          createdAt: order.activatedAt,
          filledAt: now,
        };
        set((state) => ({
          pending_orders: state.pending_orders.filter((item) => item.id !== id),
          portfolio_assets: [record, ...state.portfolio_assets],
        }));
        return record;
      },
      cancelPending: (id) => {
        const order = get().pending_orders.find((item) => item.id === id);
        if (!order) return null;
        set((state) => ({
          pending_orders: state.pending_orders.filter((item) => item.id !== id),
        }));
        return order;
      },
      expireDue: (nowMs = Date.now()) => {
        const { kept, expired } = expirePendingOrders(get().pending_orders, nowMs);
        if (expired.length === 0) return [];
        set({ pending_orders: kept });
        return expired;
      },
    }),
    {
      name: EXECUTION_STORAGE_KEY,
      partialize: (state) => ({
        portfolio_assets: state.portfolio_assets,
        pending_orders: state.pending_orders,
      }),
    },
  ),
);
