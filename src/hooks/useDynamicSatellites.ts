/**
 * DYNAMICKÉ SATELITY — tokeny pridané používateľom v Portfóliu, ktoré ešte
 * nemajú vlastnú (hardkódovanú) DCA kartu.
 *
 * Zdroj pravdy: tabuľka `tracked_tokens` (Portfólio). Každý taký token
 * automaticky dostane plnú DCA kartu v sekcii „Satelity“ — bez manuálnej
 * konfigurácie. Duplikáty sú vylúčené (built-in tickery + dedup podľa symbolu).
 */
import { useMemo } from 'react';
import { useTrackedTokens } from './useTrackedTokens';
import { useDcaTokenVisibility } from '@/lib/dcaTokenVisibility';
import { BASKET_ASSETS, basketAsset, type Basket } from '@/lib/assetBaskets';

/** Tokeny, ktoré už majú vlastnú DCA kartu alebo do DCA nepatria (stables/zisky). */
export const BUILTIN_DCA_SYMBOLS = new Set([
  'BTC', 'WBTC', 'CBBTC', 'LBTC',
  'WETH', 'STETH', 'WSTETH', 'WEETH', 'RETH',
  'WSOL', 'JITOSOL', 'MSOL',
  'USDC', 'USDT', 'DAI', 'PAXG',
]);

export interface DynamicSatellite {
  /** Kľúč v alokačnom engine (lowercase ticker). */
  key: string;
  /** Ticker (napr. `ARB`). */
  symbol: string;
  /** Celý názov z CoinGecko. */
  name: string;
  /** CoinGecko id pre cenový/indikátorový fallback. */
  cgId: string;
  imageUrl: string | null;
  basket: Basket;
}

/**
 * Vráti stabilný (abecedne zoradený, deduplikovaný) zoznam dynamických satelitov.
 * Bezpečné pri chýbajúcich dátach — vždy vracia pole.
 */
export function useDynamicSatellites(): { satellites: DynamicSatellite[]; isLoading: boolean } {
  const { data, isLoading } = useTrackedTokens();
  const { isHidden } = useDcaTokenVisibility();

  const satellites = useMemo(() => {
    const rows = Array.isArray(data) ? data : [];
    const images = new Map<string, string | null>();
    for (const r of rows) {
      const sym = String(r?.symbol ?? '').trim().toUpperCase();
      if (sym && !images.has(sym)) images.set(sym, r?.image_url ?? null);
    }
    // Iba tokeny zo 4 košov — všetko ostatné je skryté.
    const out: DynamicSatellite[] = [];
    for (const a of BASKET_ASSETS) {
      if (BUILTIN_DCA_SYMBOLS.has(a.symbol)) continue;
      if ((a.cgId && isHidden(a.cgId)) || isHidden(a.symbol)) continue;
      out.push({
        key: a.symbol.toLowerCase(),
        symbol: a.symbol,
        name: a.name,
        cgId: a.cgId,
        imageUrl: images.get(a.symbol) ?? null,
        basket: basketAsset(a.symbol)!.basket,
      });
    }
    return out;
  }, [data, isHidden]);

  return { satellites, isLoading };
}
