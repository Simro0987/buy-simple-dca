import type { Basket } from './assetBaskets';

export type DcaFilterStatus = 'approved' | 'falling_knife' | 'stopped';

export interface DcaBasketCandidate {
  token: string;
  basket: Basket;
  rsi: number;
  price: number;
  sma200: number;
  stopped?: boolean;
  status?: DcaFilterStatus;
  /** Skóre prehriatia 0–100 (nižšie = lepšie). */
  overheat?: number;
  /** 24h zmena v % (väčší pokles = lepšie). */
  change24hPct?: number;
}

export interface DcaBasketAllocation extends DcaBasketCandidate {
  weight: number;
  redirectedWeight: number;
  /** Váha pred filtrami (podiel 100 − RSI zo všetkých tokenov koša). */
  baselineWeight: number;
}

const safeRsi = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;

/** Falling-knife hysteréza: vstup pod 15 + pod SMA200, návrat až nad RSI 25. */
export function fallingKnifeActive(candidate: DcaBasketCandidate, wasActive: boolean): boolean {
  const rsi = safeRsi(candidate.rsi);
  if (wasActive) return rsi <= 25;
  return rsi < 15 && candidate.price > 0 && candidate.sma200 > 0 && candidate.price < candidate.sma200;
}

/**
 * Kompozitná „Value Weight“: zlučuje nízke RSI, nízke prehriatie
 * a najväčší 24h pokles do jedného čísla (0–100, vyššie = lepšia hodnota).
 * Váhy: 50 % RSI + 30 % prehriatie + 20 % 24h pokles.
 */
export function valueWeightRaw(candidate: DcaBasketCandidate): number {
  const rsiScore = 100 - safeRsi(candidate.rsi);
  const overheatScore = 100 - safeRsi(candidate.overheat ?? candidate.rsi);
  const drop = Number.isFinite(candidate.change24hPct) ? Number(candidate.change24hPct) : 0;
  const dropScore = Math.max(0, Math.min(100, -drop * 5)); // −20 % pokles = 100 bodov
  return Math.max(0.01, 0.5 * rsiScore + 0.3 * overheatScore + 0.2 * dropScore);
}

/** Rozdelí rozpočet každého koša schváleným tokenom podľa kompozitnej Value Weight. */
export function allocateInverseRsiByBasket(candidates: DcaBasketCandidate[]): DcaBasketAllocation[] {
  const output: DcaBasketAllocation[] = [];
  const baskets: Basket[] = ['SATELLITES', 'HIGH_BETA', 'PROXY'];
  for (const basket of baskets) {
    const rows = candidates.filter((candidate) => candidate.basket === basket);
    const baselineRaw = rows.map((candidate) => valueWeightRaw(candidate));
    const baselineTotal = baselineRaw.reduce((sum, value) => sum + value, 0) || 1;
    const approved = rows.map((candidate) => !candidate.stopped && (candidate.status ?? 'approved') === 'approved');
    const approvedRawTotal = rows.reduce((sum, _candidate, index) => sum + (approved[index] ? baselineRaw[index] : 0), 0);

    rows.forEach((candidate, index) => {
      const weight = approved[index] && approvedRawTotal > 0 ? baselineRaw[index] / approvedRawTotal : 0;
      const baselineWeight = baselineRaw[index] / baselineTotal;
      output.push({
        ...candidate,
        weight,
        redirectedWeight: approved[index] && approvedRawTotal > 0 ? Math.max(0, weight - baselineWeight) : 0,
        baselineWeight,
      });
    });
  }
  return output;
}

/** Largest-remainder zaokrúhlenie na desatiny, vždy presne 100,0 %. */
export function exactTenths(weights: number[]): number[] {
  if (weights.length === 0) return [];
  const total = weights.reduce((sum, value) => sum + Math.max(0, value), 0);
  if (total <= 0) return weights.map(() => 0);
  const raw = weights.map((value) => (Math.max(0, value) / total) * 1000);
  const tenths = raw.map(Math.floor);
  let rest = 1000 - tenths.reduce((sum, value) => sum + value, 0);
  const order = raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);
  for (let i = 0; i < order.length && rest > 0; i += 1, rest -= 1) tenths[order[i].index] += 1;
  return tenths.map((value) => value / 10);
}

// ── SATELLITE SIEVE (sekvenčné master filtre pre kôš SATELITY) ──
export interface SieveCheck { step: 0 | 1 | 2; label: string; passed: boolean | null; detail: string; points?: { label: string; passed: boolean | null; detail: string }[] }
export interface SieveResult {
  /** null = dáta sa ešte načítavajú (token sa zatiaľ nezastavuje). */
  passed: boolean | null;
  failedStep: 0 | 1 | 2 | null;
  /** 'satellite' = DCA POZASTAVENÉ, 'highbeta'/'proxy' = NÁKUP ZAMIETNUTÝ. */
  kind?: 'satellite' | 'highbeta' | 'proxy';
  reason: string;
  checks: SieveCheck[];
  /** PROXY: mNAV násobič alokácie (0 / 0,5 / 1 / 1,5). */
  multiplier?: number;
  /** PROXY: technické skóre 0–3. */
  score?: number;
}
export const SIEVE_RSI_MAX = 65;
export const SIEVE_GROWTH_MAX = 50;

const f = (n: number, d = 1) => n.toFixed(d).replace('.', ',');

export function satelliteSieve(input: {
  btcPrice: number | null; btc200w: number | null; btcError?: boolean;
  rsi: number | null; growthPct: number | null;
}): SieveResult {
  const { btcPrice, btc200w, rsi, growthPct } = input;
  const k0Known = (btcPrice ?? 0) > 0 && (btc200w ?? 0) > 0;
  const k0: boolean | null = k0Known ? btcPrice! > btc200w! : input.btcError ? false : null;
  const checks: SieveCheck[] = [{
    step: 0, label: 'KROK 0 · Makro bezpečnosť: BTC > 200W SMA', passed: k0,
    detail: k0Known ? `BTC $${f(btcPrice!, 0)} vs 200W SMA $${f(btc200w!, 0)}` : input.btcError ? 'BTC 200W SMA nedostupná' : 'Načítavam…',
  }];
  if (k0 === false) {
    checks.push({ step: 1, label: 'KROK 1 · Brzda eufórie', passed: null, detail: 'Nevyhodnotené (zlyhal KROK 0)' });
    return { passed: false, failedStep: 0, reason: 'Zlyhal KROK 0: BTC pod 200W SMA (makro riziko)', checks };
  }
  const k1Known = rsi !== null && Number.isFinite(rsi) && growthPct !== null && Number.isFinite(growthPct);
  const rsiOk = k1Known ? rsi! <= SIEVE_RSI_MAX : null;
  const growOk = k1Known ? growthPct! < SIEVE_GROWTH_MAX : null;
  const k1 = k1Known ? !!rsiOk && !!growOk : null;
  checks.push({
    step: 1, label: `KROK 1 · Brzda eufórie: RSI ≤ ${SIEVE_RSI_MAX} a rast < ${SIEVE_GROWTH_MAX} %`, passed: k1,
    detail: k1Known ? `RSI ${f(rsi!)} ${rsiOk ? '✓' : '✗'} · rast 30D ${growthPct! >= 0 ? '+' : ''}${f(growthPct!)} % ${growOk ? '✓' : '✗'}` : 'Načítavam…',
  });
  if (k0 === null || k1 === null) return { passed: null, failedStep: null, reason: 'Vyhodnocujem…', checks };
  if (!k1) {
    const why = !rsiOk && !growOk ? 'vysoké RSI a prudký rast' : !rsiOk ? `vysoké RSI (${f(rsi!)} > ${SIEVE_RSI_MAX})` : `prudký rast (${f(growthPct!)} % ≥ ${SIEVE_GROWTH_MAX} %)`;
    return { passed: false, failedStep: 1, reason: `Zlyhal KROK 1: ${why}`, checks };
  }
  return { passed: true, failedStep: null, reason: 'Prešiel KROK 0 aj KROK 1', checks };
}


// ── HIGH-BETA SIEVE (3 kroky) ──
export const HB_GROWTH_MAX = 80;
export const UNLOCK_MAX_PCT = 3;
export const INFLATION_7D_MAX_PCT = 3;

export function highBetaSieve(input: {
  symbol: string;
  btcPrice: number | null; btc200w: number | null; btcEma50: number | null; btcError?: boolean;
  price: number | null; ema50: number | null; swingLow: number | null; change24hPct: number | null;
  growthPct: number | null; rsi: number | null; rsiWeekly: number | null;
  volume24h: number | null; volumeAvg20: number | null;
  /** Najväčší cliff unlock v najbližších 14 dňoch (% cirk. ponuky). */
  unlock?: { pct: number; date: string } | null;
  /** Zmena cirkulujúcej ponuky za 7 dní v % (null = málo histórie). */
  supplyChange7dPct?: number | null;
  /** true = tokenomics sa ešte načítavajú. */
  tokenomicsLoading?: boolean;
}): SieveResult {
  const kind = 'highbeta' as const;
  const checks: SieveCheck[] = [];
  const { btcPrice: bp, btc200w: w, btcEma50: e } = input;
  // KROK 0
  const known0 = (bp ?? 0) > 0 && (w ?? 0) > 0 && (e ?? 0) > 0;
  const above200w = known0 ? bp! > w! : null;
  const emaOk = known0 ? bp! >= e! * 0.97 : null; // mäkký pullback do −3 %
  const k0 = known0 ? !!above200w && !!emaOk : input.btcError ? false : null;
  checks.push({ step: 0, label: 'KROK 0 · Makro brána BTC: > 200W SMA a > 50D EMA', passed: k0,
    detail: known0 ? `BTC $${f(bp!, 0)} · 200W $${f(w!, 0)} ${above200w ? '✓' : '✗'} · 50D EMA $${f(e!, 0)} ${bp! > e! ? '✓' : emaOk ? '✓ mäkký pullback' : '✗'}` : input.btcError ? 'BTC dáta nedostupné' : 'Načítavam…' });
  const skip = (from: number) => { for (let s = from; s <= 2; s++) checks.push({ step: s as 1 | 2, label: s === 1 ? 'KROK 1 · Anti-FOMO' : 'KROK 2 · Technické skóre', passed: null, detail: `Nevyhodnotené (zlyhal KROK ${from - 1})` }); };
  if (k0 === false) { skip(1); return { kind, passed: false, failedStep: 0, reason: 'Dôvod: KROK 0 — BTC makro brána zatvorená', checks }; }
  // KROK 1
  const g = input.growthPct;
  const known1 = g !== null && Number.isFinite(g) && !input.tokenomicsLoading;
  const growOk = known1 ? g! <= HB_GROWTH_MAX : null;
  const unlockFail = !!input.unlock && input.unlock.pct > UNLOCK_MAX_PCT;
  const inf = input.supplyChange7dPct;
  const infKnown = !unlockFail && !input.unlock && inf !== null && inf !== undefined && Number.isFinite(inf);
  const inflationFail = infKnown && inf! > INFLATION_7D_MAX_PCT;
  const k1 = known1 ? !!growOk && !unlockFail && !inflationFail : null;
  const tokenomicsDetail = input.tokenomicsLoading ? 'tokenomics: načítavam…'
    : input.unlock ? `unlock ${f(input.unlock.pct, 2)} % (${input.unlock.date}) ${unlockFail ? '✗' : '✓'}`
    : infKnown ? `bez známeho unlocku · ponuka 7D ${inf! >= 0 ? '+' : ''}${f(inf!, 2)} % ${inflationFail ? '✗' : '✓'}`
    : 'bez známeho unlocku · inflácia 7D: zbieram históriu ponuky';
  checks.push({ step: 1, label: `KROK 1 · Anti-FOMO: rast 30D ≤ ${HB_GROWTH_MAX} % a bez masívnych unlockov`, passed: k1,
    detail: known1 ? `Rast 30D ${g! >= 0 ? '+' : ''}${f(g!)} % ${growOk ? '✓' : '✗'} · ${tokenomicsDetail}` : 'Načítavam…' });
  if (k1 === false) {
    skip(2);
    const reason = unlockFail ? 'Zastavené: Blížiaci sa masívny unlock nad 3%'
      : inflationFail ? 'Zastavené: Masívna inflácia ponuky'
      : `Dôvod: KROK 1 — rast 30D ${f(g!)} % > ${HB_GROWTH_MAX} %`;
    return { kind, passed: false, failedStep: 1, reason, checks };
  }
  // KROK 2
  const { price: p, ema50: em, swingLow: sl, change24hPct: c24, rsi: r, rsiWeekly: rw, volume24h: v, volumeAvg20: va } = input;
  const known2 = (p ?? 0) > 0 && r !== null && Number.isFinite(r);
  const nearSupport = (sl ?? 0) > 0 && p! <= sl! * 1.05 && (c24 ?? 0) > 0;
  const t1 = known2 ? ((em ?? 0) > 0 && p! > em!) || nearSupport : null;
  const volKnown = (v ?? 0) > 0 && (va ?? 0) > 0;
  const t2 = known2 ? (volKnown ? v! >= va! * 1.3 : false) : null;
  const t3 = known2 ? r! >= 35 && r! <= 55 && (rw === null || rw < 60) : null;
  const pts = [t1, t2, t3].filter((x) => x === true).length;
  const k2 = known2 ? pts >= 2 : null;
  checks.push({ step: 2, label: 'KROK 2 · Technické skóre (min. 2/3)', passed: k2,
    detail: known2 ? `Skóre ${pts}/3` : 'Načítavam…',
    points: [
      { label: '1. Trend / odraz od supportu', passed: t1, detail: known2 ? ((em ?? 0) > 0 && p! > em! ? 'Cena nad 50D EMA' : nearSupport ? 'Odraz pri 30D minime' : 'Pod 50D EMA, bez odrazu') : '—' },
      { label: '2. Objem pri odraze ≥ 1,3× 20D priemer', passed: t2, detail: volKnown ? `${f(v! / va!, 2)}× priemeru` : 'Objem nedostupný (0 bodov)' },
      { label: '3. RSI 1D 35–55, 1W < 60', passed: t3, detail: known2 ? `1D ${f(r!)} · 1W ${rw === null ? 'Dáta nedostupné' : f(rw)}` : '—' },
    ] });
  if (k0 === null || k1 === null || k2 === null) return { kind, passed: null, failedStep: null, reason: 'Vyhodnocujem…', checks };
  if (!k2) return { kind, passed: false, failedStep: 2, reason: `Dôvod: Technické skóre ${pts}/3 - potrebných minimálne 2`, checks };
  return { kind, passed: true, failedStep: null, reason: `Prešiel všetky 3 kroky (skóre ${pts}/3)`, checks };
}

// ── PROXY SIEVE (MSTR) — makro · fundamenty · technika + mNAV matica ──
export const MNAV_MAX = 1.6;
export const PROXY_GROWTH_MAX = 80;

export function proxySieve(input: {
  btcPrice: number | null; btc200w: number | null; btcEma50: number | null;
  btcChange7dPct: number | null; btcRsiWeekly: number | null; btcError?: boolean;
  mnav: number | null; mnavLoading?: boolean; cleanSheet: boolean;
  price: number | null; ema50: number | null; sma200: number | null; bbLower: number | null;
  low7d: number | null; growthPct: number | null; rsiWeekly: number | null;
}): SieveResult {
  const kind = 'proxy' as const;
  const checks: SieveCheck[] = [];
  const skip = (from: number) => { for (let s = from; s <= 2; s++) checks.push({ step: s as 1 | 2, label: s === 1 ? 'KROK 1 · Fundamenty' : 'KROK 2 · Technické skóre', passed: null, detail: `Nevyhodnotené (zlyhal KROK ${from - 1})` }); };
  // KROK 0
  const { btcPrice: bp, btc200w: w, btcEma50: e, btcChange7dPct: d7, btcRsiWeekly: rw } = input;
  const known0 = (bp ?? 0) > 0 && (w ?? 0) > 0 && (e ?? 0) > 0;
  const above200w = known0 ? bp! > w! : null;
  const altOk = d7 !== null && Number.isFinite(d7) && d7 >= -10 && rw !== null && rw > 40;
  const emaGate = known0 ? bp! > e! || altOk : null;
  const k0 = known0 ? !!above200w && !!emaGate : input.btcError ? false : null;
  checks.push({ step: 0, label: 'KROK 0 · Makro brána BTC', passed: k0,
    detail: known0 ? `200W SMA ${above200w ? '✓' : '✗'} · 50D EMA ${bp! > e! ? '✓' : altOk ? '✓ (7D pokles ≤ 10 % a 1W RSI > 40)' : '✗'} · 7D ${d7 === null ? 'Dáta nedostupné' : `${d7 >= 0 ? '+' : ''}${f(d7)} %`} · 1W RSI ${rw === null ? 'Dáta nedostupné' : f(rw)}`
      : input.btcError ? 'BTC dáta nedostupné' : 'Načítavam…' });
  if (k0 === false) { skip(1); return { kind, passed: false, failedStep: 0, multiplier: 0, reason: 'Dôvod: KROK 0 — BTC makro brána zatvorená', checks }; }
  // KROK 1
  const m = input.mnav;
  const g = input.growthPct;
  const mnavOk = m !== null ? m <= MNAV_MAX : false;
  const growKnown = g !== null && Number.isFinite(g);
  const growOk = growKnown ? g! <= PROXY_GROWTH_MAX : null;
  const k1 = growKnown && !(m === null && input.mnavLoading) ? mnavOk && input.cleanSheet && !!growOk : null;
  checks.push({ step: 1, label: 'KROK 1 · Fundamenty (všetky 3)', passed: k1, detail: growKnown ? 'mNAV · čistý štít · anti-parabola' : 'Načítavam…',
    points: [
      { label: `mNAV prémia ≤ ${f(MNAV_MAX)}×`, passed: m === null ? false : mnavOk, detail: m === null ? (input.mnavLoading ? 'Načítavam...' : 'Dáta nedostupné') : `${f(m, 2)}×` },
      { label: 'Fundamentálne čistý štít', passed: input.cleanSheet, detail: input.cleanSheet ? 'Automaticky splnené' : 'Nepotvrdené' },
      { label: `Anti-parabola: rast 30D ≤ ${PROXY_GROWTH_MAX} %`, passed: growOk, detail: growKnown ? `${g! >= 0 ? '+' : ''}${f(g!)} %` : '—' },
    ] });
  if (k1 === false) {
    skip(2);
    const why = m === null ? 'mNAV nedostupné' : !mnavOk ? `mNAV ${f(m, 2)}× > ${f(MNAV_MAX)}×` : !input.cleanSheet ? 'nepotvrdený čistý štít' : `rast 30D ${f(g!)} % > ${PROXY_GROWTH_MAX} %`;
    return { kind, passed: false, failedStep: 1, multiplier: 0, reason: `Dôvod: KROK 1 — ${why}`, checks };
  }
  // KROK 2
  const { price: p, ema50: em, sma200: s2, bbLower: bb, low7d: lo, rsiWeekly: mrw } = input;
  const known2 = (p ?? 0) > 0 && (em ?? 0) > 0;
  const bounced = (lvl: number | null) => (lvl ?? 0) > 0 && (lo ?? 0) > 0 && lo! <= lvl! * 1.02 && p! > lvl!;
  const bounceFrom = known2 ? (bounced(bb) ? 'dolné Bollinger' : bounced(s2) ? '200D SMA' : bounced(em) ? '50D EMA' : null) : null;
  const tA = known2 ? bounceFrom !== null : null;
  const tB = known2 ? p! >= em! * 0.95 : null;
  const tC = known2 ? (mrw !== null && mrw >= 35 && mrw <= 65) : null;
  const pts = [tA, tB, tC].filter((x) => x === true).length;
  const k2 = known2 ? pts >= 2 : null;
  checks.push({ step: 2, label: 'KROK 2 · Technické skóre (min. 2/3)', passed: k2, detail: known2 ? `Skóre ${pts}/3` : 'Načítavam…',
    points: [
      { label: 'A. Odraz od BB / 200D SMA / 50D EMA', passed: tA, detail: known2 ? (bounceFrom ?? 'Bez odrazu') : '—' },
      { label: 'B. Cena ≥ 50D EMA (max −5 %)', passed: tB, detail: known2 ? `${skSign(((p! - em!) / em!) * 100)} % vs EMA` : '—' },
      { label: 'C. MSTR 1W RSI 35–65', passed: tC, detail: mrw === null ? 'Dáta nedostupné' : f(mrw) },
    ] });
  if (k0 === null || k1 === null || k2 === null) return { kind, passed: null, failedStep: null, multiplier: 1, score: pts, reason: 'Vyhodnocujem…', checks };
  if (!k2) return { kind, passed: false, failedStep: 2, multiplier: 0, score: pts, reason: `Dôvod: Technické skóre ${pts}/3 - potrebných minimálne 2`, checks };
  const mult = m! < 1.0 ? 1.5 : m! <= 1.3 ? 1.0 : 0.5;
  const tag = mult === 1.5 ? 'DEEP BOOST 150 %' : mult === 1 ? 'štandard 100 %' : 'REDUCE 50 %';
  return { kind, passed: true, failedStep: null, multiplier: mult, score: pts, reason: `Prešiel všetky 3 kroky (skóre ${pts}/3) · mNAV ${f(m!, 2)}× → ${tag}`, checks };
}
const skSign = (n: number) => `${n >= 0 ? '+' : ''}${f(n)}`;
