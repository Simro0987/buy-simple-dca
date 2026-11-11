/**
 * JEDNORAZOVÁ HARMONIZÁCIA PORTFÓLIO ⇄ DCA
 *
 * Pri prvom spustení po aktualizácii sa oba moduly zosúladia:
 *  • token v Portfóliu, ale bez DCA karty → kartu vytvorí `useDynamicSatellites`
 *    (automaticky, bez zápisu do DB).
 *  • token v DCA (built-in: BTC/ETH/SOL/LINK/AAVE/HYPE), ale chýbajúci
 *    v Portfóliu → vloží sa do `tracked_tokens` (BTC = Core, ostatné = Satelity).
 *
 * Odstránené (skryté) tokeny sa NIKDY nevracajú späť a história transakcií
 * ostáva nedotknutá. Beží iba raz — príznak v LocalStorage.
 */
import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTrackedTokens, type TokenCategory } from './useTrackedTokens';
import { useDcaTokenVisibility } from '@/lib/dcaTokenVisibility';

const FLAG = 'dca-portfolio-harmonized-v1';

interface BuiltinToken {
  symbol: string;
  name: string;
  cgId: string;
  category: TokenCategory;
}

/** Tokeny, ktoré majú v DCA vlastnú kartu — musia existovať aj v Portfóliu. */
export const BUILTIN_DCA_TOKENS: BuiltinToken[] = [
  { symbol: 'BTC', name: 'Bitcoin', cgId: 'bitcoin', category: 'core' },
  { symbol: 'ETH', name: 'Ethereum', cgId: 'ethereum', category: 'satellite' },
  { symbol: 'SOL', name: 'Solana', cgId: 'solana', category: 'satellite' },
  { symbol: 'LINK', name: 'Chainlink', cgId: 'chainlink', category: 'satellite' },
  { symbol: 'AAVE', name: 'Aave', cgId: 'aave', category: 'satellite' },
  { symbol: 'HYPE', name: 'Hyperliquid', cgId: 'hyperliquid', category: 'satellite' },
];

export function useTokenHarmonization(): void {
  const { data, isLoading } = useTrackedTokens();
  const { isHidden } = useDcaTokenVisibility();
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current || isLoading || !Array.isArray(data)) return;
    let done = false;
    try {
      done = localStorage.getItem(FLAG) === '1';
    } catch { /* ignore */ }
    if (done) { ran.current = true; return; }
    ran.current = true;

    (async () => {
      try {
        const { data: userRes } = await supabase.auth.getUser();
        const uid = userRes?.user?.id;
        if (!uid) { ran.current = false; return; } // skús znova po prihlásení

        const symbols = new Set(
          data.map((r) => String(r?.symbol ?? '').trim().toUpperCase()).filter(Boolean),
        );
        const ids = new Set(data.map((r) => String(r?.coingecko_id ?? '')).filter(Boolean));

        const missing = BUILTIN_DCA_TOKENS.filter(
          (t) =>
            !symbols.has(t.symbol) &&
            !ids.has(t.cgId) &&
            !isHidden(t.symbol) &&
            !isHidden(t.cgId),
        );

        if (missing.length > 0) {
          const { error } = await supabase.from('tracked_tokens').insert(
            missing.map((t) => ({
              user_id: uid,
              coingecko_id: t.cgId,
              symbol: t.symbol,
              name: t.name,
              image_url: null,
              category: t.category,
            })),
          );
          if (error) throw error;
          qc.invalidateQueries({ queryKey: ['tracked_tokens'] });
        }

        try { localStorage.setItem(FLAG, '1'); } catch { /* ignore */ }
      } catch {
        // Backend nedostupný → skús pri ďalšom načítaní.
        ran.current = false;
      }
    })();
  }, [data, isLoading, isHidden, qc]);
}
