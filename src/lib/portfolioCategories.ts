/**
 * Kategorizácia portfólia — už len DVE kategórie.
 *
 *  CORE       — BTC + wBTC (wBTC je token, do ktorého odsávame zisky z altov)
 *  SATELLITES — ETH, SOL, LINK, AAVE, HYPE
 *  PROFITS    — „Zisky“: wBTC, PAXG, USDC, USDT — zobrazujú sa iba tokeny,
 *               v ktorých reálne držíme odsatý zisk (qty > 0).
 *
 * Kategórie „Yield“ a „Privacy“ boli odstránené — všetky alty sú satelity.
 */

export type PortfolioCategory = 'CORE' | 'SATELLITES' | 'HIGH_BETA' | 'PROXY' | 'PROFITS';

export const CATEGORY_LABELS: Record<PortfolioCategory, string> = {
  CORE: 'Core',
  SATELLITES: 'Satelity',
  HIGH_BETA: 'High-Beta',
  PROXY: 'Proxy',
  PROFITS: 'Zisky',
};

export const CATEGORY_ORDER: PortfolioCategory[] = ['CORE', 'SATELLITES', 'HIGH_BETA', 'PROXY', 'PROFITS'];

/** Tokeny so skórovaním rozdelené do kategórií. */
export const SCORED_CATEGORY: Record<string, PortfolioCategory> = {
  BTC: 'CORE',
  ETH: 'SATELLITES',
  SOL: 'SATELLITES',
  LINK: 'SATELLITES',
  AAVE: 'SATELLITES',
  HYPE: 'HIGH_BETA',
  UNI: 'HIGH_BETA',
  NEAR: 'HIGH_BETA',
  PENDLE: 'HIGH_BETA',
  MSTR: 'PROXY',
};

/** Aktíva bez DCA skórovania (držané ako zisk). */
export const EXTRA_ASSETS = ['WBTC', 'PAXG', 'USDC', 'USDT'] as const;
export type ExtraAsset = typeof EXTRA_ASSETS[number];

export const EXTRA_LABELS: Record<ExtraAsset, string> = {
  WBTC: 'wBTC',
  PAXG: 'PAXG',
  USDC: 'USDC',
  USDT: 'USDT',
};

/** wBTC patrí do Core aj do Zisky — v Core je vždy, v Zisky len keď je nenulový. */
export const EXTRA_CATEGORIES: Record<ExtraAsset, PortfolioCategory[]> = {
  WBTC: ['CORE', 'PROFITS'],
  PAXG: ['PROFITS'],
  USDC: ['PROFITS'],
  USDT: ['PROFITS'],
};

export const STABLE_ASSETS: ExtraAsset[] = ['USDC', 'USDT'];

export function categoryOf(symbol: string): PortfolioCategory | null {
  const s = symbol.toUpperCase();
  if (SCORED_CATEGORY[s]) return SCORED_CATEGORY[s];
  const extra = EXTRA_CATEGORIES[s as ExtraAsset];
  return extra ? extra[0] : null;
}
