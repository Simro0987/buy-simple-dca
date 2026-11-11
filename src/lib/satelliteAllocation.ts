// ─────────────────────────────────────────────────────────────
// UNIFIED CORE / SATELLITE ALLOCATION (state + math only)
//
// Portfólio má už len DVE kategórie:
//   CORE       — BTC, vždy ≥ 50 % investovateľného kapitálu
//   SATELLITES — ETH, SOL, LINK, AAVE, HYPE
//
// Zvyšok kapitálu po BTC ide do satelitného koša. Pre každý satelit sa
// spočíta jednotné relatívne dynamické skóre (momentum / RSI / 200D MA),
// skóre sa sčítajú a fiat sa rozdelí proporčne podľa váhy v koši.
// Kategórie "Yield" a "Privacy" už neexistujú — všetky alty sú satelity.
// ─────────────────────────────────────────────────────────────

import type { TokenIndicators } from './safetyBrakeBoost';
import { basketOf, type Basket } from './assetBaskets';
import { allocateInverseRsiByBasket, type SieveResult } from './dcaBasketEngine';

export type MacroBasketWeights = Pick<Record<Basket, number>, 'SATELLITES' | 'HIGH_BETA' | 'PROXY'>;

/**
 * Kľúč satelitu = lowercase ticker. Základná sada je pevná, ale používateľ môže
 * v Portfóliu pridať ďalšie tokeny — tie sa automaticky pridajú do koša.
 */
export type SatelliteToken = string;

export type BaseSatelliteToken = 'eth' | 'sol' | 'link' | 'aave' | 'hype';

export const SATELLITE_TOKENS: SatelliteToken[] = ['eth', 'sol', 'link', 'aave', 'hype'];

export const SATELLITE_LABEL: Record<string, string> = {
  eth: 'ETH',
  sol: 'SOL',
  link: 'LINK',
  aave: 'AAVE',
  hype: 'HYPE',
};


/** BTC nikdy nesmie klesnúť pod 50 % investovateľného kapitálu. */
export const BTC_FLOOR_PCT = 50;

/** Indikátory satelitu; ema50 sa používa ako fallback za 200D MA. */
export interface SatelliteIndicators extends Partial<TokenIndicators> {
  price?: number;
  ma200?: number;
  rsi14?: number;
  ema50?: number;
  change24hPct?: number;
  fallingKnife?: boolean;
  /** Sekvenčné sito (KROK 0 / KROK 1) — iba kôš SATELITY. */
  sieve?: SieveResult;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Jednotné relatívne dynamické skóre 0..100.
 * Nižší RSI a cena pod 200D MA = vyššie skóre (kupujeme slabosť),
 * momentum (cena vs 50D EMA) pridáva jemnú korekciu.
 * Bez dát → neutrálne skóre 50 (nikdy nespadne appka).
 */
export function scoreSatellite(ind?: SatelliteIndicators | null): number {
  const rsi = Number.isFinite(ind?.rsi14) ? clamp(Number(ind?.rsi14), 0, 100) : 50;
  const price = Number(ind?.price) > 0 ? Number(ind?.price) : 0;
  // 200D MA fallback → 50D EMA (nové tokeny nemajú 200 sviečok)
  const ma = Number(ind?.ma200) > 0 ? Number(ind?.ma200) : (Number(ind?.ema50) > 0 ? Number(ind?.ema50) : 0);
  const ema = Number(ind?.ema50) > 0 ? Number(ind?.ema50) : 0;

  // RSI komponenta: RSI 30 → 100, RSI 70 → 0
  const rsiScore = clamp(((70 - rsi) / 40) * 100, 0, 100);

  // MA komponenta: −25 % pod MA → 100, +25 % nad MA → 0
  const maDistPct = price > 0 && ma > 0 ? ((price - ma) / ma) * 100 : 0;
  const maScore = clamp(((25 - maDistPct) / 50) * 100, 0, 100);

  // Momentum komponenta: cena vs 50D EMA (−15 % → 100, +15 % → 0)
  const momPct = price > 0 && ema > 0 ? ((price - ema) / ema) * 100 : 0;
  const momScore = clamp(((15 - momPct) / 30) * 100, 0, 100);

  const blend = 0.45 * rsiScore + 0.35 * maScore + 0.20 * momScore;
  return clamp(blend, 1, 100);
}

export interface SatelliteAllocation {
  token: SatelliteToken;
  label: string;
  score: number;
  /** Relatívna váha v satelitnom koši (0..1). */
  weight: number;
  /** Fiat alokácia v USD. */
  usd: number;
  /** 200D MA bola nedostupná → použitá 50D EMA. */
  maFallback: boolean;
  basket: Basket;
  status: 'approved' | 'falling_knife' | 'stopped';
  redirectedWeight: number;
  /** Absolútny USD, ktorý tento token získal z presmerovaní (intra + cross-basket). */
  redirectedUsd: number;
  rsi: number;
  overheat: number;
  change24hPct: number;
  sieve?: SieveResult;
  /** USD, ktoré by token dostal bez filtrov (pre zamietnuté = presmerovaná suma). */
  baselineUsd: number;
}

export interface CascadeInfo {
  /** HIGH-BETA kôš bez schváleného tokenu → kapitál sa prelial do SATELLITES. */
  highBetaToSatellitesUsd: number;
  /** SATELLITES kôš bez schváleného tokenu → kapitál sa prelial do CORE (BTC). */
  satellitesToCoreUsd: number;
  /** PROXY (MSTR) zamietnutý → kapitál sa prelial priamo do CORE (BTC). */
  proxyToCoreUsd: number;
  /** mNAV REDUCE (50 %): ušetrená polovica MSTR rozpočtu → bonus_pool → CORE (BTC). */
  proxyReduceToCoreUsd: number;
  /** mNAV DEEP BOOST (150 %): extra 50 % kryté z Hotovostnej rezervy. */
  proxyBoostReserveUsd: number;
}

export interface CoreSatelliteAllocationResult {
  /** BTC (CORE) fiat suma. */
  btcUsd: number;
  /** BTC podiel v % z investovateľného kapitálu (vždy ≥ 50). */
  btcPct: number;
  /** Satelitný kôš v USD. */
  satelliteUsd: number;
  satelliteList: SatelliteAllocation[];
  bySatellite: Record<SatelliteToken, SatelliteAllocation>;
  totalScore: number;
  cascade: CascadeInfo;
  approvedCount: Record<Basket, number>;
  /** Aktuálny rozpočet každého koša po cross-basket kaskáde. */
  basketUsd: Record<Basket, number>;
}

/** Percentá pre prezentáciu vychádzajú výlučne z konečných súm po waterfall. */
export function effectiveBasketPercentages(basketUsd: Record<Basket, number>): Record<Basket, number> {
  const baskets: Basket[] = ['CORE', 'SATELLITES', 'HIGH_BETA', 'PROXY'];
  const amounts = baskets.map((basket) => Math.max(0, Number.isFinite(basketUsd[basket]) ? basketUsd[basket] : 0));
  const shares = allocateDisplayTenths(amounts);
  return { CORE: shares[0], SATELLITES: shares[1], HIGH_BETA: shares[2], PROXY: shares[3] };
}

function allocateDisplayTenths(amounts: number[]): number[] {
  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (total <= 0) return amounts.map(() => 0);
  const raw = amounts.map((amount) => amount / total * 1000);
  const tenths = raw.map(Math.floor);
  const remaining = 1000 - tenths.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - tenths[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < remaining; i++) tenths[order[i].index] += 1;
  return tenths.map((value) => value / 10);
}


/**
 * Rozdelí investovateľný kapitál: BTC ≥ 50 %, zvyšok proporčne
 * medzi satelity podľa relatívneho dynamického skóre.
 *
 * @param tokens voliteľný zoznam satelitov (základná sada + dynamicky pridané
 *               tokeny z Portfólia). Musí byť bez duplikátov.
 * @param labels voliteľné tickery pre dynamické tokeny (fallback = UPPERCASE kľúč).
 */
export function allocateCoreSatellite(
  investableUsd: number,
  requestedBtcPct: number,
  indicators: Partial<Record<SatelliteToken, SatelliteIndicators | null | undefined>> = {},
  tokens: SatelliteToken[] = SATELLITE_TOKENS,
  labels: Record<string, string> = {},
  macroBasketWeights?: MacroBasketWeights,
): CoreSatelliteAllocationResult {
  const capital = Math.max(0, Number(investableUsd) || 0);
  const btcPct = clamp(Number.isFinite(requestedBtcPct) ? requestedBtcPct : BTC_FLOOR_PCT, BTC_FLOOR_PCT, 100);
  const btcUsd = round2((capital * btcPct) / 100);
  const satelliteUsd = round2(Math.max(0, capital - btcUsd));

  const activeTokens = Array.from(new Set(tokens.length > 0 ? tokens : SATELLITE_TOKENS));
  const labelOf = (t: SatelliteToken) => labels[t] ?? SATELLITE_LABEL[t] ?? t.toUpperCase();

  const scores = activeTokens.map((token) => {
    const ind = indicators[token];
    const score = scoreSatellite(ind);
    const maFallback = !(Number(ind?.ma200) > 0) && Number(ind?.ema50) > 0;
    const basket = basketOf(labelOf(token)) ?? 'SATELLITES';
    const status = ind?.fallingKnife ? 'falling_knife' as const : ind?.sieve?.passed === false ? 'stopped' as const : 'approved' as const;
    return { token, score, maFallback, basket, status, rsi: Number.isFinite(ind?.rsi14) ? Number(ind?.rsi14) : 50 };
  });

  const totalScore = scores.reduce((s, x) => s + x.score, 0) || 1;

  // ── NORMALIZÁCIA SKÓRE (anti-dominancia) ────────────────────
  // Surové skóre (1..100) sa kompresuje odmocninou → token so skóre 51
  // už nezdrtí tokeny so skóre 5–10. Následne sa aplikuje minimálna
  // podlaha váhy (MIN_WEIGHT) a strop (MAX_WEIGHT), a všetko sa
  // renormalizuje tak, aby súčet váh bol presne 1.
  // Pri veľkom počte satelitov sa podlaha/strop automaticky zmenší,
  // aby súčet limitov nikdy neprekročil 1 (žiadne NaN pri > 16 tokenoch).
  const n = Math.max(1, scores.length);
  const MIN_WEIGHT = Math.min(0.06, 0.5 / n);
  const MAX_WEIGHT = Math.max(1 / n, 0.30);

  const compressed = scores.map(({ score }) => Math.sqrt(Math.max(0.01, score)));
  const compressedTotal = compressed.reduce((s, x) => s + x, 0) || 1;

  let weights = compressed.map((c) => c / compressedTotal);
  // clamp + renormalizácia (2 iterácie stačia na stabilizáciu)
  for (let i = 0; i < 2; i++) {
    weights = weights.map((w) => clamp(w, MIN_WEIGHT, MAX_WEIGHT));
    const sum = weights.reduce((s, x) => s + x, 0) || 1;
    weights = weights.map((w) => w / sum);
  }

  const inverse = allocateInverseRsiByBasket(scores.map((row) => ({
    token: row.token,
    basket: row.basket,
    rsi: row.rsi,
    price: Number(indicators[row.token]?.price) || 0,
    sma200: Number(indicators[row.token]?.ma200) || 0,
    status: row.status,
    overheat: Math.max(0, Math.min(100, row.rsi)),
    change24hPct: Number(indicators[row.token]?.change24hPct) || 0,
  })));
  const basketBaseline = new Map<Basket, number>();
  if (macroBasketWeights) {
    const nonCorePct = Math.max(0.0001, 100 - btcPct);
    for (const basket of ['SATELLITES', 'HIGH_BETA', 'PROXY'] as Basket[]) {
      basketBaseline.set(basket, Math.max(0, macroBasketWeights[basket] ?? 0) / nonCorePct);
    }
  } else {
    scores.forEach((row, idx) => basketBaseline.set(row.basket, (basketBaseline.get(row.basket) ?? 0) + (weights[idx] ?? 0)));
  }

  const origSatelliteUsd = satelliteUsd;
  const satelliteList: SatelliteAllocation[] = scores.map(({ token, score, maFallback, basket, status, rsi }, idx) => {
    const redistributed = inverse.find((row) => row.token === token);
    const weight = (basketBaseline.get(basket) ?? 0) * (redistributed?.weight ?? 0);
    const ind = indicators[token];
    const intraRedirWeight = (basketBaseline.get(basket) ?? 0) * (redistributed?.redirectedWeight ?? 0);
    void idx;
    return {
      token,
      label: labelOf(token),
      score: round2(score),
      weight,
      usd: round2(origSatelliteUsd * weight),
      maFallback,
      basket,
      status,
      redirectedWeight: intraRedirWeight,
      redirectedUsd: round2(origSatelliteUsd * intraRedirWeight),
      rsi,
      overheat: Math.max(0, Math.min(100, rsi)),
      change24hPct: Number(ind?.change24hPct) || 0,
      sieve: ind?.sieve,
      baselineUsd: round2(origSatelliteUsd * (basketBaseline.get(basket) ?? 0) * (redistributed?.baselineWeight ?? 0)),
    };
  });

  // ── CROSS-BASKET CASCADING (Risk-Off Waterfall) ─────────────
  const approvedCount: Record<Basket, number> = { CORE: 0, SATELLITES: 0, HIGH_BETA: 0, PROXY: 0 };
  scores.forEach((row) => { if (row.status === 'approved') approvedCount[row.basket] += 1; });
  const basketBudget: Record<Basket, number> = { CORE: 0, SATELLITES: 0, HIGH_BETA: 0, PROXY: 0 };
  for (const basket of ['SATELLITES', 'HIGH_BETA', 'PROXY'] as Basket[]) {
    basketBudget[basket] = (basketBaseline.get(basket) ?? 0) * origSatelliteUsd;
  }

  let btcUsdAdj = btcUsd;
  let satelliteUsdAdj = origSatelliteUsd;
  let hbCascade = 0;
  let satCascade = 0;
  let proxyCascade = 0;

  if (approvedCount.HIGH_BETA === 0 && basketBudget.HIGH_BETA > 0.01) {
    hbCascade = basketBudget.HIGH_BETA;
  }

  // PROXY FALLBACK: MSTR zamietnutý → celý PROXY rozpočet priamo do CORE (BTC).
  if (approvedCount.PROXY === 0 && basketBudget.PROXY > 0.01) {
    proxyCascade = round2(basketBudget.PROXY);
    btcUsdAdj = round2(btcUsdAdj + proxyCascade);
    satelliteUsdAdj = round2(Math.max(0, satelliteUsdAdj - proxyCascade));
  }

  if (approvedCount.SATELLITES === 0) {
    satCascade = round2((basketBudget.SATELLITES ?? 0) + hbCascade);
    if (satCascade > 0.01) {
      btcUsdAdj = round2(btcUsdAdj + satCascade);
      satelliteUsdAdj = round2(Math.max(0, satelliteUsdAdj - satCascade));
      hbCascade = 0;
    }
  } else if (hbCascade > 0.01) {
    // Rozdeľ HIGH-BETA kôš medzi schválené SATELLITES tokeny podľa ich váhy v koši.
    const approvedRows = satelliteList.filter((r) => r.basket === 'SATELLITES' && r.status === 'approved' && r.weight > 0);
    const totalW = approvedRows.reduce((s, r) => s + r.weight, 0) || 1;
    for (const r of approvedRows) {
      const share = r.weight / totalW;
      const extraUsd = round2(hbCascade * share);
      r.usd = round2(r.usd + extraUsd);
      r.redirectedUsd = round2(r.redirectedUsd + extraUsd);
      if (origSatelliteUsd > 0) {
        const addW = (hbCascade * share) / origSatelliteUsd;
        r.weight = r.weight + addW;
        r.redirectedWeight = r.redirectedWeight + addW;
      }
    }
  }

  // ── PROXY mNAV EXEKUČNÁ MATICA ──
  let proxyReduce = 0;
  let proxyBoost = 0;
  if (approvedCount.PROXY > 0) {
    for (const r of satelliteList.filter((x) => x.basket === 'PROXY' && x.status === 'approved')) {
      const mult = r.sieve?.kind === 'proxy' && r.sieve.passed === true ? (r.sieve.multiplier ?? 1) : 1;
      if (mult === 1) continue;
      const delta = round2(r.usd * (mult - 1));
      r.usd = round2(r.usd + delta);
      if (delta < 0) { proxyReduce += -delta; btcUsdAdj = round2(btcUsdAdj - delta); satelliteUsdAdj = round2(satelliteUsdAdj + delta); }
      else { proxyBoost += delta; satelliteUsdAdj = round2(satelliteUsdAdj + delta); }
    }
  }

  const basketUsd: Record<Basket, number> = {
    CORE: btcUsdAdj,
    SATELLITES: satelliteList.filter((r) => r.basket === 'SATELLITES').reduce((sum, r) => sum + r.usd, 0),
    HIGH_BETA: satelliteList.filter((r) => r.basket === 'HIGH_BETA').reduce((sum, r) => sum + r.usd, 0),
    PROXY: satelliteList.filter((r) => r.basket === 'PROXY').reduce((sum, r) => sum + r.usd, 0),
  };
  if (satCascade > 0.01) {
    basketUsd.SATELLITES = 0;
    basketUsd.HIGH_BETA = 0;
  } else if (hbCascade > 0.01) {
    // hbCascade je už zahrnutá v USD jednotlivých satelitných tokenov —
    // k súčtu koša sa NEPRIPOČÍTAVA znova (inak by celkový súčet presiahol kapitál).
    basketUsd.HIGH_BETA = 0;
  }
  if (proxyCascade > 0.01) {
    basketUsd.CORE = round2(basketUsd.CORE);
    basketUsd.PROXY = 0;
  }

  const bySatellite = {} as Record<SatelliteToken, SatelliteAllocation>;
  for (const a of satelliteList) bySatellite[a.token] = a;

  return {
    btcUsd: btcUsdAdj,
    btcPct,
    satelliteUsd: satelliteUsdAdj,
    satelliteList,
    bySatellite,
    totalScore: round2(totalScore),
    cascade: {
      highBetaToSatellitesUsd: round2(hbCascade),
      satellitesToCoreUsd: round2(satCascade),
      proxyToCoreUsd: round2(proxyCascade),
      proxyReduceToCoreUsd: round2(proxyReduce),
      proxyBoostReserveUsd: round2(proxyBoost),
    },
    approvedCount,
    basketUsd,
  };
}


// ─────────────────────────────────────────────────────────────
// JEDINÝ ZDROJ PRAVDY PRE ZOBRAZENIE PODIELOV V SATELITNOM KOŠI
// Podiely sú relatívne VNÚTRI koša (Σ = presne 100,0 %) — largest-remainder
// na desatiny. Rovnaké čísla používa súhrnná karta aj jednotlivé token karty.
// ─────────────────────────────────────────────────────────────
export interface SatelliteShare {
  token: SatelliteToken;
  label: string;
  score: number;
  /** Podiel v satelitnom koši v % (Σ = 100,0). */
  sharePct: number;
  /** Fiat alokácia v USD odvodená z sharePct × satelliteUsd. */
  usd: number;
  basket: Basket;
  status: 'approved' | 'falling_knife' | 'stopped';
  redirectedUsd: number;
  rsi: number;
  overheat: number;
  change24hPct: number;
}

export function satelliteShares(
  list: SatelliteAllocation[],
  satelliteUsd: number,
): SatelliteShare[] {
  const safe = Array.isArray(list) ? list : [];
  const total = safe.reduce((s, x) => s + (Number(x.weight) > 0 ? Number(x.weight) : 0), 0) || 1;
  const raw = safe.map((s) => ((Number(s.weight) > 0 ? Number(s.weight) : 0) / total) * 100);
  const tenths = raw.map((v) => Math.floor(v * 10));
  let rest = 1000 - tenths.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, frac: v * 10 - Math.floor(v * 10) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < order.length && rest > 0; k++, rest--) tenths[order[k].i] += 1;
  const pool = Math.max(0, Number(satelliteUsd) || 0);
  return safe.map((s, i) => {
    const sharePct = (tenths[i] ?? 0) / 10;
    return {
      token: s.token,
      label: s.label,
      score: s.score,
      sharePct,
      usd: round2((pool * sharePct) / 100),
      basket: s.basket,
      status: s.status,
      redirectedUsd: round2(pool * s.redirectedWeight),
      rsi: s.rsi,
      overheat: s.overheat,
      change24hPct: s.change24hPct,
    };
  });
}

/** Mapa token → podiel/usd pre priame prepojenie do exekučných kariet. */
export function satelliteShareMap(
  list: SatelliteAllocation[],
  satelliteUsd: number,
): Partial<Record<SatelliteToken, SatelliteShare>> {
  const out: Partial<Record<SatelliteToken, SatelliteShare>> = {};
  for (const s of satelliteShares(list, satelliteUsd)) out[s.token] = s;
  return out;
}
