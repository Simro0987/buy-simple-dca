/**
 * NATRVALO ODSTRÁNENÉ TOKENY (purge list).
 *
 * Token na tomto zozname je z aplikácie odstránený úplne:
 *  · žiadna karta v Portfóliu ani v DCA,
 *  · žiadny fetch / polling / live cena,
 *  · žiadny záznam v LocalStorage.
 *
 * Historické realizované zisky sa NIKDY nemažú — čítajú sa z databázy
 * (`useRealizedProfit`) a naďalej vstupujú do globálnej metriky „Vybrané zisky“.
 */

/** Kľúče (lowercase ticker + coingecko id) natrvalo odstránených tokenov. */
export const PURGED_TOKEN_KEYS: string[] = ['zec', 'zcash'];

const PURGED = new Set(PURGED_TOKEN_KEYS);

/** true → token je natrvalo odstránený (nikdy sa nevykresľuje ani nedopytuje). */
export function isPurgedToken(...keys: Array<string | null | undefined>): boolean {
  for (const raw of keys) {
    const k = String(raw ?? '').trim().toLowerCase();
    if (k && PURGED.has(k)) return true;
  }
  return false;
}

/** Vyčistí zostatky odstránených tokenov z LocalStorage (idempotentné). */
export function purgeLocalStorageTokens(): void {
  try {
    const extraKey = 'portfolio-extra-assets-v1';
    const raw = JSON.parse(localStorage.getItem(extraKey) || '{}') as Record<string, unknown>;
    let dirty = false;
    for (const sym of Object.keys(raw)) {
      if (PURGED.has(sym.toLowerCase())) { delete raw[sym]; dirty = true; }
    }
    if (dirty) localStorage.setItem(extraKey, JSON.stringify(raw));
  } catch { /* ignore */ }
}
