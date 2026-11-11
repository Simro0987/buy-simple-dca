/**
 * VIDITEĽNOSŤ DCA TOKENOV — synchronizácia Portfólio ⇄ DCA.
 *
 * Keď používateľ odstráni token v Portfóliu (3-dots → „Odstrániť token“),
 * automaticky zmizne aj jeho DCA karta. Historické dáta (transakcie,
 * VYBRANÉ ZISKY) zostávajú archivované v databáze — mažeme iba aktívnu
 * kartu, nikdy nie históriu. Alokačný engine sa prepočíta na zvyšné tokeny.
 */
import { useMemo } from 'react';
import { getHiddenTokens, useHiddenTokens } from './hiddenPortfolioTokens';
import { SATELLITE_TOKENS, type SatelliteToken } from './satelliteAllocation';
import { isPurgedToken, purgeLocalStorageTokens } from './purgedTokens';

// Natrvalo odstránené tokeny (napr. ZEC) — vyčisti LocalStorage pri načítaní modulu.
purgeLocalStorageTokens();

// Povinné členstvo v košoch: XMR (SATELITY) a ENA (HIGH-BETA) musia byť vždy
// viditeľné — ak boli niekedy odstránené v Portfóliu, obnov ich pri načítaní.
// (Povinná obnova XMR/ENA zrušená — tieto tokeny už nie sú v košoch.)

/** CoinGecko id aliasy pre built-in satelitov (kľúč = engine key). */
export const SATELLITE_CG_IDS: Record<string, string[]> = {
  eth: ['ethereum'],
  sol: ['solana'],
  link: ['chainlink'],
  aave: ['aave'],
  hype: ['hyperliquid'],
};

/** BTC (CORE) sa nikdy neskrýva — je základ stratégie. */
const NEVER_HIDDEN = new Set(['btc']);

export interface DcaTokenVisibility {
  /** Aktívne built-in satelity (po odfiltrovaní odstránených tokenov). */
  activeSatellites: SatelliteToken[];
  /** true → karta tokenu sa v DCA nemá vykresliť. */
  isHidden: (keyOrSymbol: string) => boolean;
  /** Zoznam skrytých coingecko id (archivované, nie zmazané). */
  hiddenIds: string[];
}

/**
 * Neaktívny token (odstránený v Portfóliu) — synchronná verzia bez hooku.
 * Používa sa na vypnutie polling/fetch loopov (`enabled: false`).
 */
export function isTokenRemovedNow(...keys: Array<string | null | undefined>): boolean {
  if (isPurgedToken(...keys)) return true;
  const hiddenSet = new Set(getHiddenTokens().filter(Boolean).map((x) => x.toLowerCase()));
  if (hiddenSet.size === 0) return false;
  for (const raw of keys) {
    const k = String(raw ?? '').trim().toLowerCase();
    if (!k || NEVER_HIDDEN.has(k)) continue;
    if (hiddenSet.has(k)) return true;
    const aliases = SATELLITE_CG_IDS[k];
    if (aliases?.some((a) => hiddenSet.has(a))) return true;
  }
  return false;
}

/** Reaktívne: true → pre token sa nesmie spúšťať žiadny fetch/polling. */
export function useTokenRemoved(...keys: Array<string | null | undefined>): boolean {
  const hidden = useHiddenTokens();
  const sig = hidden.join(',');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => isTokenRemovedNow(...keys), [sig, keys.join('|')]);
}

export function useDcaTokenVisibility(): DcaTokenVisibility {
  const hidden = useHiddenTokens();

  return useMemo(() => {
    const hiddenIds = hidden.filter(Boolean);
    const hiddenSet = new Set(hiddenIds.map((x) => x.toLowerCase()));

    const isHidden = (keyOrSymbol: string) => {
      const k = String(keyOrSymbol ?? '').trim().toLowerCase();
      if (!k || NEVER_HIDDEN.has(k)) return false;
      if (isPurgedToken(k)) return true;
      if (hiddenSet.has(k)) return true;
      const aliases = SATELLITE_CG_IDS[k];
      if (aliases?.some((a) => hiddenSet.has(a))) return true;
      return false;
    };

    return {
      activeSatellites: SATELLITE_TOKENS.filter((t) => !isHidden(t)),
      isHidden,
      hiddenIds,
    };
  }, [hidden.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
}
