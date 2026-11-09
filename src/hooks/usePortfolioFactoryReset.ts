import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { runPortfolioFactoryReset } from '@/lib/portfolioFactoryReset';

/**
 * Runs the Portfolio Factory Reset exactly once per page mount.
 * If mock/legacy data is detected in Supabase or local cache it is wiped
 * and React Query caches are invalidated so the UI re-renders from zero.
 */
export function usePortfolioFactoryReset() {
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    (async () => {
      try {
        const r = await runPortfolioFactoryReset();
        if (!r.ran) return;
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['app_settings'] }),
          qc.invalidateQueries({ queryKey: ['dca_purchases'] }),
          qc.invalidateQueries({ queryKey: ['capital_entries'] }),
        ]);
        toast.success('Portfólio bolo automaticky resetované na nulový stav', {
          description: `Vymazané: ${r.deletedPurchases} nákupov, ${r.deletedCapitalEntries} vkladov` +
            (r.resetSettings ? ', mock holdings vynulované' : ''),
        });
      } catch (err) {
        console.error('[FactoryReset] failed', err);
      }
    })();
  }, [qc]);
}
