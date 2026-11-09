/**
 * ASSET BASKETS — jediný zdroj pravdy pre zoznam tokenov v Portfóliu aj DCA.
 *
 *  CORE       — BTC
 *  SATELLITES — ETH, SOL, LINK, AAVE
 *  HIGH_BETA  — UNI, NEAR, HYPE, PENDLE
 *  PROXY      — MSTR (akcia)
 *
 * Token mimo tohto zoznamu sa v Portfóliu ani v DCA nevykresľuje.
 * Smerovanie dát:
 *  · binance     — denné sviečky z Binance (fallback CoinGecko)
 *  · dexscreener — živá cena + likvidita z DexScreener, indikátory z Binance/CoinGecko histórie
 *  · yahoo       — akcie (Yahoo Finance cez backend proxy), denné OHLC
 */

export type Basket = 'CORE' | 'SATELLITES' | 'HIGH_BETA' | 'PROXY';

export const BASKET_ORDER: Basket[] = ['CORE', 'SATELLITES', 'HIGH_BETA', 'PROXY'];

export const BASKET_LABELS: Record<Basket, string> = {
  CORE: 'Core',
  SATELLITES: 'Satelity',
  HIGH_BETA: 'High-Beta',
  PROXY: 'Proxy',
};

export type PriceSource = 'binance' | 'dexscreener' | 'coingecko' | 'yahoo';

export interface BasketAsset {
  symbol: string;
  name: string;
  cgId: string;
  basket: Basket;
  priceSource: PriceSource;
  /** Adresa tokenu pre DexScreener (`/latest/dex/tokens/{address}`). */
  dexAddress?: string;
  /** Ticker pre Yahoo Finance. */
  yahooTicker?: string;
  /** false → bez stakingu/výnosov (napr. akcia). */
  hasYield: boolean;
}

export const BASKET_ASSETS: BasketAsset[] = [
  { symbol: 'BTC', name: 'Bitcoin', cgId: 'bitcoin', basket: 'CORE', priceSource: 'binance', hasYield: true },

  { symbol: 'ETH', name: 'Ethereum', cgId: 'ethereum', basket: 'SATELLITES', priceSource: 'binance', hasYield: true },
  { symbol: 'SOL', name: 'Solana', cgId: 'solana', basket: 'SATELLITES', priceSource: 'binance', hasYield: true },
  { symbol: 'LINK', name: 'Chainlink', cgId: 'chainlink', basket: 'SATELLITES', priceSource: 'binance', hasYield: true },
  { symbol: 'AAVE', name: 'Aave', cgId: 'aave', basket: 'SATELLITES', priceSource: 'binance', hasYield: true },
  { symbol: 'UNI', name: 'Uniswap', cgId: 'uniswap', basket: 'HIGH_BETA', priceSource: 'binance', hasYield: true },
  { symbol: 'NEAR', name: 'NEAR Protocol', cgId: 'near', basket: 'HIGH_BETA', priceSource: 'binance', hasYield: true },

  { symbol: 'PENDLE', name: 'Pendle', cgId: 'pendle', basket: 'HIGH_BETA', priceSource: 'binance', hasYield: true },
  {
    symbol: 'HYPE', name: 'Hyperliquid', cgId: 'hyperliquid', basket: 'HIGH_BETA', priceSource: 'dexscreener',
    dexAddress: '0x5555555555555555555555555555555555555555', hasYield: true,
  },

  // MSTR = tokenizovaná akcia (MSTRX xStock) — cena a história z CoinGecko, bez Yahoo.
  { symbol: 'MSTR', name: 'MicroStrategy', cgId: 'microstrategy-xstock', basket: 'PROXY', priceSource: 'coingecko', hasYield: false },
];

const BY_SYMBOL = new Map(BASKET_ASSETS.map((a) => [a.symbol, a]));

export function basketAsset(symbol: string): BasketAsset | undefined {
  return BY_SYMBOL.get(String(symbol ?? '').toUpperCase());
}

export function basketOf(symbol: string): Basket | null {
  return basketAsset(symbol)?.basket ?? null;
}

export function isBasketToken(symbol: string): boolean {
  return BY_SYMBOL.has(String(symbol ?? '').toUpperCase());
}

export function symbolsIn(basket: Basket): string[] {
  return BASKET_ASSETS.filter((a) => a.basket === basket).map((a) => a.symbol);
}
