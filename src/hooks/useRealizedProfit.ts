/**
 * useRealizedProfit — „Vybrané zisky“ (realized profit).
 *
 * Realizovaný zisk počítame z histórie transakcií: pri každom SELL
 * porovnáme predajnú cenu s priemernou nákupnou cenou (WACB) v danom
 * momente → (price − avgCost) × sellQty.
 *
 * Dôležité: počíta sa z DB transakcií, takže „odstránenie“ tokenu
 * z UI zoznamu nikdy neodmaže už vybrané zisky.
 */
import { useMemo } from 'react';
import { useTokenTransactions, type TokenTransaction } from '@/hooks/useTokenTransactions';

export interface RealizedProfitState {
  /** Realizovaný zisk podľa CoinGecko ID. */
  byId: Record<string, number>;
  /** Realizovaný zisk podľa symbolu (BTC, ETH, …). */
  bySymbol: Record<string, number>;
  /** Súčet za celé portfólio (vrátane skrytých tokenov). */
  total: number;
  isLoading: boolean;
}

export function computeRealizedProfit(txs: TokenTransaction[]) {
  const byId: Record<string, number> = {};
  const bySymbol: Record<string, number> = {};
  const state: Record<string, { qty: number; cost: number }> = {};

  const sorted = [...txs].sort(
    (a, b) => new Date(a.executed_at).getTime() - new Date(b.executed_at).getTime(),
  );

  for (const tx of sorted) {
    const id = tx.coingecko_id;
    const sym = (tx.symbol || '').toUpperCase();
    const qty = Number(tx.quantity) || 0;
    const price = Number(tx.price_usd) || 0;
    const cur = state[id] ?? { qty: 0, cost: 0 };

    if (tx.side === 'buy') {
      cur.qty += qty;
      cur.cost += qty * price;
    } else {
      const avg = cur.qty > 0 ? cur.cost / cur.qty : 0;
      const sellQty = Math.min(qty, cur.qty);
      if (sellQty > 0 && avg > 0) {
        const realized = (price - avg) * sellQty;
        byId[id] = (byId[id] ?? 0) + realized;
        bySymbol[sym] = (bySymbol[sym] ?? 0) + realized;
      }
      cur.qty -= sellQty;
      cur.cost = Math.max(0, cur.cost - avg * sellQty);
    }
    state[id] = cur;
  }

  const total = Object.values(byId).reduce((s, v) => s + v, 0);
  return { byId, bySymbol, total };
}

export function useRealizedProfit(): RealizedProfitState {
  const { data: txs = [], isLoading } = useTokenTransactions();
  return useMemo(() => ({ ...computeRealizedProfit(txs), isLoading }), [txs, isLoading]);
}
