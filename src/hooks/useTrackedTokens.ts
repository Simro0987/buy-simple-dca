import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type TokenCategory = 'core' | 'yield' | 'satellite';

export interface TrackedToken {
  id: string;
  coingecko_id: string;
  symbol: string;
  name: string;
  image_url: string | null;
  category: TokenCategory;
  created_at: string;
}

export function useTrackedTokens() {
  return useQuery({
    queryKey: ['tracked_tokens'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tracked_tokens')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TrackedToken[];
    },
    staleTime: 60_000,
  });
}

export function useAddTrackedToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: { coingecko_id: string; symbol: string; name: string; image_url?: string | null; category: TokenCategory },
    ) => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) throw new Error('Nie si prihlásený');
      // DUPLICATE GUARD — token (podľa symbolu alebo CoinGecko id) môže existovať
      // len raz; inak by vznikla druhá DCA karta pre to isté aktívum.
      const sym = input.symbol.toUpperCase();
      const { data: dupes } = await supabase
        .from('tracked_tokens')
        .select('id, symbol, coingecko_id')
        .eq('user_id', uid);
      const dupe = (dupes ?? []).find(
        (r) => String(r.symbol).toUpperCase() === sym || r.coingecko_id === input.coingecko_id,
      );
      if (dupe) throw new Error(`${sym} už existuje v Portfóliu aj v DCA`);
      const { data, error } = await supabase
        .from('tracked_tokens')
        .insert({
          user_id: uid,
          coingecko_id: input.coingecko_id,
          symbol: sym,
          name: input.name,
          image_url: input.image_url ?? null,
          category: input.category,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracked_tokens'] }),
  });
}

export function useRemoveTrackedToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tracked_tokens').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tracked_tokens'] }),
  });
}
