export type TradingMode = "simulation" | "live";

export type ExchangeOrderLeg = "market" | "limit";

export type ExchangeOrderStatus = "filled" | "open" | "simulated" | "failed";

export interface ExchangeBalanceResponse {
  success: boolean;
  exchange?: string;
  freeBalanceUsd?: number;
  assets?: Array<{ asset: string; free: number }>;
  error?: string;
  liveEnabled?: boolean;
}

export interface ExchangeExecuteOrder {
  symbol: string;
  leg: ExchangeOrderLeg;
  amountUsd: number;
  price: number;
  category?: string;
}

export interface ExchangeExecuteResultItem {
  symbol: string;
  leg: ExchangeOrderLeg;
  amountUsd: number;
  price: number;
  quantity: number;
  status: ExchangeOrderStatus;
  category?: string;
  exchangeOrderId?: string;
  error?: string;
}

export interface ExchangeExecuteResponse {
  success: boolean;
  mode: TradingMode;
  results?: ExchangeExecuteResultItem[];
  totalExecutedUsd?: number;
  error?: string;
}

export interface TradeHistoryLeg {
  symbol: string;
  category: string;
  leg: ExchangeOrderLeg;
  amountUsd: number;
  price: number;
  quantity: number;
  status: ExchangeOrderStatus;
  exchangeOrderId?: string;
}

export interface DcaTradeRound {
  id: string;
  executedAt: string;
  mode: TradingMode;
  totalInvestedUsd: number;
  finalScore: number;
  regimeLabel: string;
  regimeKey?: string;
  orders: TradeHistoryLeg[];
}
