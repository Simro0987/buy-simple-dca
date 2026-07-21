import type {
  DcaTradeRound,
  ExchangeExecuteResultItem,
  TradeHistoryLeg,
  TradingMode,
} from "@/lib/exchange/types";

export const TRADE_HISTORY_STORAGE_KEY = "bsdca-trade-history";
export const TRADING_MODE_STORAGE_KEY = "bsdca-trading-mode";
export const TRADE_HISTORY_UPDATED_EVENT = "bsdca-trade-history-updated";

function notifyTradeHistoryUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TRADE_HISTORY_UPDATED_EVENT));
}

export function readTradeHistory(): DcaTradeRound[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TRADE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DcaTradeRound[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeTradeHistory(rounds: DcaTradeRound[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRADE_HISTORY_STORAGE_KEY, JSON.stringify(rounds));
}

export function appendTradeRound(round: DcaTradeRound): DcaTradeRound[] {
  const next = [round, ...readTradeHistory()].slice(0, 100);
  writeTradeHistory(next);
  notifyTradeHistoryUpdated();
  return next;
}

export function createTradeRound(input: {
  mode: TradingMode;
  totalInvestedUsd: number;
  finalScore: number;
  regimeLabel: string;
  regimeKey?: string;
  results: ExchangeExecuteResultItem[];
}): DcaTradeRound {
  const orders: TradeHistoryLeg[] = input.results.map((result) => ({
    symbol: result.symbol,
    category: result.category ?? "core",
    leg: result.leg,
    amountUsd: result.amountUsd,
    price: result.price,
    quantity: result.quantity,
    status: result.status,
    exchangeOrderId: result.exchangeOrderId,
  }));

  return {
    id: `round-${Date.now()}`,
    executedAt: new Date().toISOString(),
    mode: input.mode,
    totalInvestedUsd: input.totalInvestedUsd,
    finalScore: input.finalScore,
    regimeLabel: input.regimeLabel,
    regimeKey: input.regimeKey,
    orders,
  };
}

export function createSimulatedTradeRound(input: {
  totalInvestedUsd: number;
  finalScore: number;
  regimeLabel: string;
  regimeKey?: string;
  plans: Array<{
    symbol: string;
    category: string;
    marketUsd: number;
    limitUsd: number;
    spotPrice: number;
    limitPrice: number;
  }>;
}): DcaTradeRound {
  const orders: TradeHistoryLeg[] = [];

  for (const plan of input.plans) {
    if (plan.marketUsd > 0 && plan.spotPrice > 0) {
      orders.push({
        symbol: plan.symbol,
        category: plan.category,
        leg: "market",
        amountUsd: plan.marketUsd,
        price: plan.spotPrice,
        quantity: plan.marketUsd / plan.spotPrice,
        status: "simulated",
      });
    }
    if (plan.limitUsd > 0 && plan.limitPrice > 0) {
      orders.push({
        symbol: plan.symbol,
        category: plan.category,
        leg: "limit",
        amountUsd: plan.limitUsd,
        price: plan.limitPrice,
        quantity: plan.limitUsd / plan.limitPrice,
        status: "simulated",
      });
    }
  }

  return {
    id: `round-${Date.now()}`,
    executedAt: new Date().toISOString(),
    mode: "simulation",
    totalInvestedUsd: input.totalInvestedUsd,
    finalScore: input.finalScore,
    regimeLabel: input.regimeLabel,
    regimeKey: input.regimeKey,
    orders,
  };
}

export function readTradingMode(): TradingMode {
  if (typeof window === "undefined") return "simulation";
  const raw = window.localStorage.getItem(TRADING_MODE_STORAGE_KEY);
  return raw === "live" ? "live" : "simulation";
}

export function writeTradingMode(mode: TradingMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TRADING_MODE_STORAGE_KEY, mode);
}
