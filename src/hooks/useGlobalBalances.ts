/**
 * useGlobalBalances — jediný zdroj pravdy pre zostatky tokenov naprieč aplikáciou.
 *
 * Sumarizuje:
 *  - manuálne transakcie z `token_transactions` (buy − sell)
 *  - DCA nákupy z `dca_purchases` (btc/eth/sol_amount)
 *  - manuálne holdings z `app_settings.manual_holdings` (baseline BTC/ETH/SOL)
 *
 * Číta iba keď je používateľ prihlásený (RLS filtruje na auth.uid()).
 * Query key `['globalBalances']` — invalidovať pri každom write ktorý mení zostatky.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type BalanceMap = Record<string, number>; // SYMBOL -> quantity

const CG_TO_SYMBOL: Record<string, string> = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  solana: 'SOL',
};

export function useGlobalBalances() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  return useQuery<BalanceMap>({
    queryKey: ['globalBalances', userId ?? null],
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: async () => {
      const balances: BalanceMap = {};

      const add = (sym: string, qty: number) => {
        if (!sym || !Number.isFinite(qty) || qty === 0) return;
        const s = sym.toUpperCase();
        balances[s] = (balances[s] ?? 0) + qty;
      };

      // 1) token_transactions (buy − sell)
      const { data: txs, error: txErr } = await supabase
        .from('token_transactions')
        .select('symbol,coingecko_id,side,quantity');
      if (txErr) throw txErr;
      for (const t of txs ?? []) {
        const sym = (t.symbol as string | null) ?? CG_TO_SYMBOL[t.coingecko_id as string] ?? '';
        const q = Number(t.quantity ?? 0);
        add(sym, t.side === 'sell' ? -q : q);
      }

      // 2) dca_purchases (BTC/ETH/SOL)
      const { data: dca, error: dcaErr } = await supabase
        .from('dca_purchases')
        .select('btc_amount,eth_amount,sol_amount');
      if (dcaErr) throw dcaErr;
      for (const r of dca ?? []) {
        add('BTC', Number(r.btc_amount ?? 0));
        add('ETH', Number(r.eth_amount ?? 0));
        add('SOL', Number(r.sol_amount ?? 0));
      }

      // 3) app_settings.manual_holdings baseline (jediný riadok pre používateľa)
      const { data: settings } = await supabase
        .from('app_settings')
        .select('manual_holdings')
        .limit(1)
        .maybeSingle();
      const manual = (settings as any)?.manual_holdings ?? {};
      add('BTC', Number(manual?.btc ?? 0));
      add('ETH', Number(manual?.eth ?? 0));
      add('SOL', Number(manual?.sol ?? 0));

      // Clamp na >= 0 (predaje nesmú spraviť záporný zostatok kvôli chýbajúcemu baseline)
      for (const k of Object.keys(balances)) {
        if (balances[k] < 0) balances[k] = 0;
      }

      return balances;
    },
  });
}
