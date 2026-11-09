/**
 * Dynamické smerovanie ziskov (Profit Routing).
 *
 * BTC / wBTC → pod prahom prehriatia zisk nechávame v BTC; nad prahom podľa
 *   indikátorov rozhodneme medzi PAXG (tvrdé aktívum, extrémna chamtivosť)
 *   a USDT (čistý stable, mierne prehriatie).
 * Alty (ETH, SOL, HYPE, LINK, AAVE, ZEC) → wBTC (Arbitrum) kým je BTC overheat
 *   pod prahom, inak USDC (Arbitrum).
 * Reentry: zisky z PAXG/USDT sa vracajú do BTC a z USDC do wBTC, keď je trh
 *   ochladený (nízky overheat + strach).
 */
import { useBtcOverheatScore } from '@/lib/btcOverheat';

export const BTC_OVERHEAT_ROUTING_THRESHOLD = 67;
/** Nad týmto prahom prehriatia / chamtivosti radšej PAXG než USDT. */
export const PAXG_PREFERENCE_OVERHEAT = 80;
export const PAXG_PREFERENCE_FEARGREED = 78;
/** Pod týmito hodnotami je vhodná príležitosť na spätný nákup BTC / wBTC. */
export const REENTRY_OVERHEAT = 40;
export const REENTRY_FEARGREED = 35;

export interface ProfitRoute {
  token: 'USDC' | 'USDT' | 'PAXG' | 'wBTC' | 'BTC';
  network: 'Optimism' | 'Arbitrum' | 'HODL';
  /** true = nič nevyberáme, zisk zostáva v BTC. */
  hold?: boolean;
  /** Dôvod výberu cieľa (pre UI). */
  reason?: string;
}

/** Kam idú zisky z BTC / wBTC — PAXG vs. USDT podľa indikátorov. */
export function getBtcProfitTarget(btcOverheatScore: number, fearGreed = 50): ProfitRoute {
  const hot = btcOverheatScore >= PAXG_PREFERENCE_OVERHEAT || fearGreed >= PAXG_PREFERENCE_FEARGREED;
  return hot
    ? { token: 'PAXG', network: 'Arbitrum', reason: `Extrémne prehriatie (🌡 ${Math.round(btcOverheatScore)} / F&G ${Math.round(fearGreed)}) → zlato` }
    : { token: 'USDT', network: 'Arbitrum', reason: `Mierne prehriatie (🌡 ${Math.round(btcOverheatScore)}) → stable` };
}

/** Kam idú zisky z altcoinov — wBTC vs. USDC podľa indikátorov. */
export function getAltProfitTarget(btcOverheatScore: number): ProfitRoute {
  return btcOverheatScore < BTC_OVERHEAT_ROUTING_THRESHOLD
    ? { token: 'wBTC', network: 'Arbitrum', reason: `BTC nie je prehriaty (🌡 ${Math.round(btcOverheatScore)}) → rotácia do wBTC` }
    : { token: 'USDC', network: 'Arbitrum', reason: `BTC prehriaty (🌡 ${Math.round(btcOverheatScore)}) → parkovanie v USDC` };
}

export function getProfitRouting(assetSymbol: string, btcOverheatScore: number, fearGreed = 50): ProfitRoute {
  const score = Number.isFinite(btcOverheatScore) ? btcOverheatScore : 0;
  const sym = String(assetSymbol).toUpperCase();

  if (sym === 'BTC' || sym === 'WBTC') {
    return score >= BTC_OVERHEAT_ROUTING_THRESHOLD
      ? getBtcProfitTarget(score, fearGreed)
      : { token: 'BTC', network: 'HODL', hold: true, reason: 'Zisk zostáva v BTC' };
  }

  return getAltProfitTarget(score);
}

export interface ReentrySignal {
  /** true = vhodná príležitosť vrátiť zisky do BTC / wBTC. */
  active: boolean;
  /** PAXG/USDT → BTC, USDC → wBTC. */
  routes: { from: string; to: 'BTC' | 'wBTC' }[];
  reason: string;
}

export function getReentrySignal(btcOverheatScore: number, fearGreed = 50): ReentrySignal {
  const active = btcOverheatScore <= REENTRY_OVERHEAT || fearGreed <= REENTRY_FEARGREED;
  return {
    active,
    routes: [
      { from: 'PAXG', to: 'BTC' },
      { from: 'USDT', to: 'BTC' },
      { from: 'USDC', to: 'wBTC' },
    ],
    reason: active
      ? `Trh ochladený (🌡 ${Math.round(btcOverheatScore)} · F&G ${Math.round(fearGreed)}) → vracaj zisky do BTC / wBTC`
      : `Čakáme na príležitosť (🌡 ${Math.round(btcOverheatScore)} · F&G ${Math.round(fearGreed)})`,
  };
}

export function routeLabel(route: ProfitRoute): string {
  return route.hold ? 'Nechávať v BTC' : `${route.token} (${route.network})`;
}


/** Reaktívna verzia — prekreslí sa pri každej zmene BTC overheat skóre. */
export function useProfitRouting(assetSymbol: string): ProfitRoute {
  const btcOverheatScore = useBtcOverheatScore();
  return getProfitRouting(assetSymbol, btcOverheatScore);
}
