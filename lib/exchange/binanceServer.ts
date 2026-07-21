import { createHmac } from "node:crypto";
import { ALL_DCA_TOKENS } from "@/lib/dcaMarketData";
import type {
  ExchangeExecuteOrder,
  ExchangeExecuteResultItem,
} from "@/lib/exchange/types";
import type { ExchangeServerConfig } from "@/lib/exchange/serverConfig";

const STABLE_ASSETS = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD"]);

const SYMBOL_TO_PAIR = new Map(
  ALL_DCA_TOKENS.map((token) => [
    token.symbol,
    token.binanceSymbol ?? `${token.symbol}USDT`,
  ]),
);

function signQuery(query: string, secret: string): string {
  return createHmac("sha256", secret).update(query).digest("hex");
}

async function binanceRequest<T>(
  config: ExchangeServerConfig,
  path: string,
  params: Record<string, string | number> = {},
  method: "GET" | "POST" = "GET",
): Promise<T> {
  if (!config.apiKey || !config.apiSecret) {
    throw new Error("Binance API credentials are not configured");
  }

  const timestamp = Date.now();
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    search.set(key, String(value));
  }
  search.set("timestamp", String(timestamp));
  search.set("recvWindow", "5000");
  const signature = signQuery(search.toString(), config.apiSecret);
  search.set("signature", signature);

  const url = `${config.baseUrl}${path}?${search.toString()}`;
  const response = await fetch(url, {
    method,
    headers: {
      "X-MBX-APIKEY": config.apiKey,
    },
    cache: "no-store",
  });

  const json = (await response.json()) as T & { code?: number; msg?: string };
  if (!response.ok) {
    const message =
      typeof json === "object" && json && "msg" in json
        ? String(json.msg)
        : `Binance API error (${response.status})`;
    throw new Error(message);
  }

  return json;
}

export async function fetchBinanceStablecoinBalance(
  config: ExchangeServerConfig,
): Promise<{ freeBalanceUsd: number; assets: Array<{ asset: string; free: number }> }> {
  const account = await binanceRequest<{
    balances: Array<{ asset: string; free: string; locked: string }>;
  }>(config, "/api/v3/account");

  const assets = account.balances
    .map((balance) => ({
      asset: balance.asset,
      free: Number(balance.free),
    }))
    .filter((balance) => balance.free > 0 && STABLE_ASSETS.has(balance.asset));

  const freeBalanceUsd = assets.reduce((sum, asset) => sum + asset.free, 0);
  return { freeBalanceUsd, assets };
}

function resolvePair(symbol: string): string {
  return SYMBOL_TO_PAIR.get(symbol) ?? `${symbol}USDT`;
}

function roundQuantity(quantity: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.floor(quantity * factor) / factor;
}

export async function executeBinanceOrders(
  config: ExchangeServerConfig,
  orders: ExchangeExecuteOrder[],
): Promise<ExchangeExecuteResultItem[]> {
  const results: ExchangeExecuteResultItem[] = [];

  for (const order of orders) {
    if (order.amountUsd <= 0 || order.price <= 0) continue;

    const pair = resolvePair(order.symbol);
    const quantity = roundQuantity(order.amountUsd / order.price);

    try {
      if (order.leg === "market") {
        const response = await binanceRequest<{
          orderId: number;
          executedQty: string;
          cummulativeQuoteQty: string;
          status: string;
        }>(
          config,
          "/api/v3/order",
          {
            symbol: pair,
            side: "BUY",
            type: "MARKET",
            quoteOrderQty: order.amountUsd.toFixed(2),
          },
          "POST",
        );

        results.push({
          symbol: order.symbol,
          leg: "market",
          amountUsd: Number(response.cummulativeQuoteQty) || order.amountUsd,
          price: order.price,
          quantity: Number(response.executedQty) || quantity,
          status: "filled",
          category: order.category,
          exchangeOrderId: String(response.orderId),
        });
      } else {
        const response = await binanceRequest<{
          orderId: number;
          price: string;
          origQty: string;
          status: string;
        }>(
          config,
          "/api/v3/order",
          {
            symbol: pair,
            side: "BUY",
            type: "LIMIT",
            timeInForce: "GTC",
            quantity: quantity.toFixed(6),
            price: order.price.toFixed(
              order.price >= 1 ? 2 : order.price >= 0.01 ? 4 : 6,
            ),
          },
          "POST",
        );

        results.push({
          symbol: order.symbol,
          leg: "limit",
          amountUsd: order.amountUsd,
          price: Number(response.price) || order.price,
          quantity: Number(response.origQty) || quantity,
          status: "open",
          category: order.category,
          exchangeOrderId: String(response.orderId),
        });
      }
    } catch (error) {
      results.push({
        symbol: order.symbol,
        leg: order.leg,
        amountUsd: order.amountUsd,
        price: order.price,
        quantity,
        status: "failed",
        category: order.category,
        error: error instanceof Error ? error.message : "Order failed",
      });
    }
  }

  return results;
}
