/**
 * useAvgBuyPrices — reálna priemerná nákupná cena (cost basis) pre každý token.
 *
 * Zdroje:
 *  - `token_transactions` (buy = +qty/+cost, sell = −qty s priemerným cost basis)
 *  - `dca_purchases` (BTC/ETH/SOL amount × price)
 *  - `app_settings.initial_cost_basis` + `manual_holdings` (baseline BTC/ETH/SOL)
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface CostBasisEntry {
  qty: number;
  costUsd: number;
  avgPrice: number;
}

export type AvgBuyPriceMap = Record<string, CostBasisEntry>;

export function useAvgBuyPrices() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  return useQuery<AvgBuyPriceMap>({
    queryKey: ['avgBuyPrices', userId ?? null],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const acc: Record<string, { qty: number; cost: number }> = {};
      const add = (sym: string, qty: number, price: number) => {
        if (!sym || !Number.isFinite(qty) || qty <= 0) return;
        const s = sym.toUpperCase();
        acc[s] = acc[s] ?? { qty: 0, cost: 0 };
        acc[s].qty += qty;
        acc[s].cost += qty * (Number.isFinite(price) ? price : 0);
      };
      const remove = (sym: string, qty: number) => {
        const s = sym.toUpperCase();
        const e = acc[s];
        if (!e || e.qty <= 0 || qty <= 0) return;
        const avg = e.cost / e.qty;
        const sold = Math.min(qty, e.qty);
        e.qty -= sold;
        e.cost -= sold * avg;
      };

      const { data: txs, error: txErr } = await supabase
        .from('token_transactions')
        .select('symbol,coingecko_id,side,quantity,price_usd,executed_at')
        .order('executed_at', { ascending: true });
      if (txErr) throw txErr;

      const { data: dca, error: dcaErr } = await supabase
        .from('dca_purchases')
        .select('btc_amount,eth_amount,sol_amount,btc_price,eth_price,sol_price');
      if (dcaErr) throw dcaErr;

      const { data: settings } = await supabase
        .from('app_settings')
        .select('manual_holdings,initial_cost_basis')
        .limit(1)
        .maybeSingle();

      // 1) baseline manual holdings + initial cost basis
      const s = (settings ?? {}) as unknown as Record<string, unknown>;
      const manual = (s.manual_holdings ?? {}) as Record<string, number>;
      const initial = (s.initial_cost_basis ?? {}) as Record<string, number>;
      for (const [key, sym] of [['btc', 'BTC'], ['eth', 'ETH'], ['sol', 'SOL']] as const) {
        const qty = Number(manual?.[key] ?? 0);
        const cost = Number(initial?.[key] ?? 0);
        if (qty > 0 && cost > 0) add(sym, qty, cost / qty);
      }

      // 2) DCA nákupy
      for (const r of dca ?? []) {
        add('BTC', Number(r.btc_amount ?? 0), Number(r.btc_price ?? 0));
        add('ETH', Number(r.eth_amount ?? 0), Number(r.eth_price ?? 0));
        add('SOL', Number(r.sol_amount ?? 0), Number(r.sol_price ?? 0));
      }

      // 3) manuálne transakcie
      for (const t of txs ?? []) {
        const sym = ((t.symbol as string | null) ?? '').toUpperCase();
        const qty = Number(t.quantity ?? 0);
        if (t.side === 'sell') remove(sym, qty);
        else add(sym, qty, Number(t.price_usd ?? 0));
      }

      const out: AvgBuyPriceMap = {};
      for (const [sym, e] of Object.entries(acc)) {
        out[sym] = {
          qty: Math.max(0, e.qty),
          costUsd: Math.max(0, e.cost),
          avgPrice: e.qty > 0 ? e.cost / e.qty : 0,
        };
      }
      return out;
    },
  });
}
