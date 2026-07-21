import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import type { ExchangeExecuteOrder } from "@/lib/exchange/types";

export function buildExchangeExecuteOrders(
  plans: TokenExecutionPlan[],
): ExchangeExecuteOrder[] {
  const orders: ExchangeExecuteOrder[] = [];

  for (const plan of plans) {
    const price =
      plan.spotPrice > 0
        ? plan.spotPrice
        : plan.limitPrice > 0
          ? plan.limitPrice
          : 0;

    if (plan.marketUsd > 0 && price > 0) {
      orders.push({
        symbol: plan.symbol,
        leg: "market",
        amountUsd: plan.marketUsd,
        price,
        category: plan.category,
      });
    }

    if (plan.limitUsd > 0) {
      const limitPrice = plan.limitPrice > 0 ? plan.limitPrice : price;
      if (limitPrice > 0) {
        orders.push({
          symbol: plan.symbol,
          leg: "limit",
          amountUsd: plan.limitUsd,
          price: limitPrice,
          category: plan.category,
        });
      }
    }
  }

  return orders;
}
