// Autonomous Core-Satellite Engine
// Derives the four-basket split from the existing Market Mode factors.
// Pure / deterministic — UI components consume the result through MarketContext.
//
// SMOOTH MACRO RATIO: všetky faktory používajú spojitú (lineárne interpolovanú)
// bias krivku namiesto skokových pásiem, výsledný Core pomer je jedna spojitá
// funkcia kompozitného skóre + Confluence, a navrch sa aplikuje časové
// vyhladenie (EMA + rate limit) z macroRatioSmoothing. BTC floor 50 % je vždy tvrdý.

import { computeRyiBooster, RYI_DEFAULTS, type RyiInputs } from './ryi';
import { smoothCoreWeight, type RatioSmoothState, type SmoothOptions } from './macroRatioSmoothing';

export type MarketMode = 'ACCUMULATION' | 'CAUTIOUS_ACCUMULATION' | 'BALANCED' | 'DISTRIBUTION' | 'DEFENSIVE';

export type FactorKey = 'wma200' | 'fearGreed' | 'cbbc' | 'liquidity' | 'volatility' | 'confluence';
export type FactorStatus = 'pos' | 'neu' | 'neg' | 'critical';


export interface FactorReading {
  key: FactorKey;
  label: string;
  status: FactorStatus;
  /** -1 (defensive bias) … 0 (neutral) … +1 (accumulate bias). NaN-safe. */
  bias: number;
  /** Human-readable short value for the UI chip. */
  value: string;
  detail: string;
}

export interface EngineInputs {
  /** BTC-ONLY 200WMA deviation (%). 200WMA does not apply to ETH/SOL. */
  btcWmaDistPct: number | null;
  fearGreed: number | null;       // 0..100
  cbbcAvg: number;                // 0..100 quality of held basket (BTC/ETH/SOL composite)
  /** Per-coin CBBC quality scores driving the satellite quality bias. */
  ethCbbc?: number;               // 0..100
  solCbbc?: number;               // 0..100
  solTvlUsd: number | null;       // liquidity proxy
  btcVol14d: number;              // % daily stdev
  ethVol14d: number;
  solVol14d: number;
  /** SOL volatility baseline (historical avg). Used by Volatility Defense to detect spikes. */
  solVol14dBaseline?: number;
  /** RYI inputs (Gross Staking APY %, Network Inflation %). Optional — použijú sa RYI_DEFAULTS. */
  ethRyi?: RyiInputs;
  solRyi?: RyiInputs;
  /** Confluence skóre 0..100 (vyššie = viac akumulačné). Optional. */
  confluenceScore?: number | null;
  /** Predchádzajúci vyhladený Core pomer (persistovaný stav) pre plynulý prechod. */
  prevRatioState?: RatioSmoothState | null;
  /** Nastavenie vyhladenia (polčas EMA, max pp/deň). */
  smoothing?: SmoothOptions;
}


export interface EngineResult {
  factors: FactorReading[];
  mode: MarketMode;
  /** Core (BTC) weight in %, po odpočítaní yield koša (min 50 zachované). */
  coreWeight: number;
  /** Satellite (ETH+SOL) weight in %, po odpočítaní yield koša. */
  satelliteWeight: number;
  /** High-Beta basket weight in %. */
  highBetaWeight: number;
  /** Proxy basket weight in %. */
  proxyWeight: number;
  /** @deprecated Legacy bucket; four-basket allocation uses highBetaWeight. */
  yieldWeight: number;
  /** @deprecated Privacy bucket odstránený — vždy 0. */
  privacyWeight: number;
  /** Per-token recommended split inside the budget. */
  perToken: { btc: number; eth: number; sol: number; zec: number };
  /** Slovak narrative bullets explaining the shift. */
  narrative: string[];
  /** True when DEFENSIVE mode is forced — buys frozen, alert raised. */
  defensiveLock: boolean;
  /** Internal composite score (-1..+1) — používa yield engine na renormalizáciu. */
  score: number;
  /** Nevyhladený makro cieľ Core (BTC) v % — pred EMA / rate limitom. */
  rawCoreTargetPct: number;
  /** Koľko pp ešte "dobehne" k cieľu (target − aktuálny). */
  ratioGapPp: number;
  /** Pomer sa práve plynulo posúva (smoothing aktívny). */
  ratioDrifting: boolean;
  /** Nový stav vyhladenia na persistovanie (localStorage). */
  ratioState: RatioSmoothState;

}

const BTC_VOL_DANGER = 4.5;   // % daily stdev → systemic stress
const SAT_VOL_DANGER = 7.0;   // ETH/SOL combined avg above this → DEFENSIVE

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Spojitá lineárna interpolácia po bodoch [x, y] (x rastúce). Bez skokov. */
function interp(x: number, pts: Array<[number, number]>): number {
  if (!Number.isFinite(x)) return 0;
  if (x <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    if (x <= x1) {
      const t = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
      return y0 + (y1 - y0) * t;
    }
  }
  return last[1];
}

function statusFromBias(bias: number): FactorStatus {
  if (bias >= 0.15) return 'pos';
  if (bias <= -0.15) return 'neg';
  return 'neu';
}

// BTC-ONLY 200WMA reading. NEVER apply to ETH/SOL. Spojitá krivka.
function read200wma(btc: number | null): FactorReading {
  if (btc === null) {
    return {
      key: 'wma200', label: '200WMA',
      status: 'neu', bias: 0, value: 'Dáta nedostupné', detail: 'BTC 200WMA nedostupné (cache purge / sanity check)',
    };
  }
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  const bias = interp(btc, [[-30, +1.0], [-15, +0.85], [-3, +0.45], [0, 0], [3, -0.25], [15, -0.55], [35, -0.85], [60, -1.0]]);
  const zone = btc < -3 ? 'POD' : btc <= 3 ? 'NEUTRAL' : 'NAD';
  const label = zone === 'NEUTRAL' ? 'BTC 200WMA Neutrál' : `BTC 200WMA ${zone}`;
  const detail = zone === 'POD'
    ? 'BTC pod 200WMA — akumulačné pásmo (plynulá krivka)'
    : zone === 'NAD'
      ? 'BTC nad 200WMA — plynulý prechod do distribúcie'
      : 'BTC tesne pri 200WMA — neutrálne pásmo';
  return { key: 'wma200', label, status: statusFromBias(bias), bias, value: `${fmt(btc)} | ${zone}`, detail };
}

function readFearGreed(v: number | null): FactorReading {
  if (v === null) return { key: 'fearGreed', label: 'Fear & Greed', status: 'neu', bias: 0, value: 'Dáta nedostupné', detail: 'On-Chain Motor nedostupný' };
  const bias = interp(v, [[0, +1.0], [20, +0.8], [40, +0.4], [50, 0], [60, -0.3], [80, -0.75], [100, -1.0]]);
  const label = v <= 20 ? 'Extreme Fear' : v <= 40 ? 'Fear' : v >= 80 ? 'Extreme Greed' : v >= 60 ? 'Greed' : 'Neutral';
  return { key: 'fearGreed', label, status: statusFromBias(bias), bias, value: `${v}`, detail: 'Sentiment — plynulá interpolácia (bez skokov)' };
}

function readCbbc(avg: number): FactorReading {
  const bias = interp(avg, [[40, -0.6], [60, -0.25], [75, +0.05], [88, +0.35], [100, +0.45]]);
  return {
    key: 'cbbc', label: 'CBBC Quality', status: statusFromBias(bias), bias,
    value: `${avg.toFixed(0)}`, detail: 'Kvalita košíka — plynulý vplyv na satelity',
  };
}

function readLiquidity(solTvl: number | null): FactorReading {
  if (solTvl === null || solTvl <= 0) return { key: 'liquidity', label: 'Likvidita', status: 'neu', bias: 0, value: 'Dáta nedostupné', detail: 'DefiLlama TVL nedostupné' };
  const b = solTvl / 1e9;
  const bias = interp(b, [[3, -0.6], [8, 0], [12, +0.45], [20, +0.6]]);
  const label = bias > 0.15 ? 'Likvidita Up' : bias < -0.15 ? 'Likvidita Down' : 'Likvidita OK';
  return { key: 'liquidity', label, status: statusFromBias(bias), bias, value: `$${b.toFixed(1)} B`, detail: 'TVL proxy — plynulá krivka od $3 B do $20 B' };
}

function readConfluence(score: number | null | undefined): FactorReading {
  if (score === null || score === undefined || !Number.isFinite(score)) {
    return { key: 'confluence', label: 'Confluence', status: 'neu', bias: 0, value: 'Dáta nedostupné', detail: 'Confluence skóre nedostupné' };
  }
  const s = clamp(score, 0, 100);
  const bias = interp(s, [[0, -0.8], [35, -0.4], [50, 0], [65, +0.4], [100, +0.8]]);
  return {
    key: 'confluence', label: 'Confluence', status: statusFromBias(bias), bias,
    value: `${s.toFixed(0)}`, detail: 'Confluence skóre — plynulý makro potvrdzovač',
  };
}

function readVolatility(btcVol: number, ethVol: number, solVol: number): FactorReading {
  const satAvg = (ethVol + solVol) / 2;
  if (btcVol >= BTC_VOL_DANGER || satAvg >= SAT_VOL_DANGER) {
    return {
      key: 'volatility', label: 'Volatility ALERT', status: 'critical', bias: -1,
      value: `BTC ${btcVol.toFixed(1)}% / Sat ${satAvg.toFixed(1)}%`,
      detail: 'Extrémna volatilita — DEFENSIVE mód, freeze nových buyov',
    };
  }
  // Spojité skóre — horší z BTC / satelitného priemeru rozhoduje.
  const btcBias = interp(btcVol, [[1.0, +0.35], [1.5, +0.2], [2.2, 0], [3.0, -0.4], [BTC_VOL_DANGER, -0.9]]);
  const satBias = interp(satAvg, [[2.0, +0.3], [2.5, +0.15], [3.5, 0], [5.0, -0.4], [SAT_VOL_DANGER, -0.9]]);
  const bias = Math.min(btcBias, satBias);
  const label = bias > 0.15 ? 'Volatility Low' : bias < -0.15 ? 'Volatility High' : 'Volatility OK';
  return { key: 'volatility', label, status: statusFromBias(bias), bias, value: `${btcVol.toFixed(1)}%`, detail: 'Volatilita — plynulá interpolácia (bez skokov)' };
}


function inferMode(score: number, defensive: boolean, f200: FactorReading, fFg: FactorReading): MarketMode {
  if (defensive) return 'DEFENSIVE';
  // Special case: 200WMA NAD + panic F&G (extreme fear) → cautious accumulation.
  const wmaNad = f200.bias < 0;
  const fgPanic = fFg.bias >= +0.9; // Extreme Fear bias = +1
  if (wmaNad && fgPanic) return 'CAUTIOUS_ACCUMULATION';
  if (score >= 0.45) return 'ACCUMULATION';
  if (score <= -0.45) return 'DISTRIBUTION';
  return 'BALANCED';
}

export function runCoreSatelliteEngine(inputs: EngineInputs): EngineResult {
  const f200 = read200wma(inputs.btcWmaDistPct);
  const fFg = readFearGreed(inputs.fearGreed);
  const fCb = readCbbc(inputs.cbbcAvg);
  const fLi = readLiquidity(inputs.solTvlUsd);
  const fVo = readVolatility(inputs.btcVol14d, inputs.ethVol14d, inputs.solVol14d);
  const fCo = readConfluence(inputs.confluenceScore);
  const factors: FactorReading[] = [f200, fFg, fCb, fLi, fVo, fCo];

  const defensiveLock = fVo.status === 'critical';

  // Weighted bias → jedna SPOJITÁ krivka Core 50..75 (bez pásiem / skokov).
  // Positive bias (akumulácia) → mierne nižší Core (viac satelitov).
  // Negative bias (distribúcia / stres) → vyšší Core (BTC ako anchor).
  const weights = { wma200: 0.24, fearGreed: 0.18, cbbc: 0.12, liquidity: 0.12, volatility: 0.22, confluence: 0.12 };
  const score = factors.reduce((s, f) => s + (f.bias || 0) * (weights[f.key] ?? 0), 0); // -1..+1

  // Spojitá base krivka: score −1 → 75 %, 0 → 62 %, +1 → 50 %.
  // tanh dáva jemné okraje, takže extrémy nespôsobia skok.
  const curve = Math.tanh(score * 1.35);
  let coreWeight = defensiveLock ? 75 : clamp(62 - curve * 12.5, 50, 75);
  const coreBase = coreWeight;
  const satBase = 100 - coreBase;


  // === YIELD BUCKET WEIGHT === (rovnaké 5 faktorov, plynulé; 0 v DEFENSIVE)
  let yieldWeight: number;
  if (defensiveLock) {
    yieldWeight = 0;
  } else if (score >= 0.4) {
    yieldWeight = Math.round(clamp(15 + (score - 0.4) * 12, 12, 20));
  } else if (score <= -0.4) {
    yieldWeight = Math.round(clamp(3 - (Math.abs(score) - 0.4) * 5, 0, 5));
  } else {
    yieldWeight = Math.round(clamp(10 + score * 10, 5, 15));
  }
  // Renormalizácia — yield/privacy sa odkrája proporcionálne z Core aj Satellite,
  // ale platí JEDINÉ tvrdé pravidlo: Core (BTC) ≥ 50 %.
  // PRIVACY kôš (ZEC) — dynamický podľa kompozitného skóre, 0 v DEFENSIVE.
  // PRIVACY kôš odstránený (ZEC purge) — vždy 0 %.
  const privacyWeight = 0;
  const scale = (100 - yieldWeight - privacyWeight) / 100;
  // Nevyhladený makro cieľ (BTC floor 50 % vždy).
  const rawCoreTargetPct = Math.max(50, coreBase * scale);
  // === ČASOVÉ VYHLADENIE === EMA (polčas 36 h) + rate limit 2.5 pp / 24 h.
  const smooth = smoothCoreWeight(rawCoreTargetPct, inputs.prevRatioState ?? null, inputs.smoothing);
  coreWeight = Math.max(50, smooth.core);
  // Four-basket macro split. The existing Core curve and smoothing stay intact;
  // Confluence only changes how the remaining capital is shared.
  const nonCoreWeight = Math.max(0, 100 - coreWeight);
  const confluence01 = clamp((inputs.confluenceScore ?? 50) / 100, 0, 1);
  const satelliteShare = 0.65 - 0.20 * confluence01;
  const highBetaShare = 0.15 + 0.30 * confluence01;
  const proxyShare = Math.max(0, 1 - satelliteShare - highBetaShare);
  const satelliteWeight = nonCoreWeight * satelliteShare;
  const highBetaWeight = nonCoreWeight * highBetaShare;
  const proxyWeight = Math.max(0, nonCoreWeight - satelliteWeight - highBetaWeight);



  // === AUTONOMOUS SATELLITE SPLIT (ETH vs SOL) ===
  // Combines three additive boosters — Quality Bias, Volatility Defense, RYI Staking Booster.
  // Baseline ETH-heavy (ETH = bluechip satellite, deeper liquidity, larger market cap).
  //   Rule 1 — QUALITY BIAS (CBBC): higher-CBBC token gets +10 pp advantage.
  //   Rule 2 — VOLATILITY DEFENSE: if SOL vol > baseline × 1.15 → shift +15 pp SOL → ETH.
  //   Rule 3 — RYI STAKING BOOSTER: (SOL_RYI − ETH_RYI) × 2 pp per 1 % diff.
  //            Positive diff → shift toward SOL (higher real yield).
  //            Diff is capped ±20 pp inside computeRyiBooster.
  const ethCbbc = inputs.ethCbbc ?? 92;
  const solCbbc = inputs.solCbbc ?? 84;
  const solBaseline = inputs.solVol14dBaseline ?? 4.0;
  let ethShare = 0.60; // ETH baseline 60 % of satellite bucket
  const qualityBiasApplied = ethCbbc !== solCbbc;
  const qualityFavorsEth = ethCbbc > solCbbc;
  if (qualityBiasApplied) ethShare += qualityFavorsEth ? 0.10 : -0.10;
  const solVolRatio = solBaseline > 0 ? inputs.solVol14d / solBaseline : 1;
  const volDefenseApplied = solVolRatio > 1.15;
  if (volDefenseApplied) ethShare += 0.15;
  // RYI booster — proportional shift (2 pp / 1 % RYI difference, cap ±20 pp).
  const ryi = computeRyiBooster(inputs.ethRyi ?? RYI_DEFAULTS.eth, inputs.solRyi ?? RYI_DEFAULTS.sol);
  const ryiShiftShare = -ryi.shiftPp / 100; // positive shiftPp favors SOL → reduce ethShare
  ethShare += ryiShiftShare;
  ethShare = clamp(ethShare, 0.30, 0.95);
  const solShare = 1 - ethShare;
  const ethPct = Math.round(satelliteWeight * ethShare);
  const solPct = satelliteWeight - ethPct;

  const mode = inferMode(score, defensiveLock, f200, fFg);

  const narrative: string[] = [];
  narrative.push(
    `Alokácia BTC ${defensiveLock ? 'uzamknutá' : 'nastavená'} na ${coreWeight} % vďaka ${
      f200.status === 'pos' ? '200WMA (POD)' : f200.status === 'neg' ? '200WMA (NAD)' : '200WMA neutrál'
    } a F&G ${fFg.value}.`,
  );
  if (defensiveLock) {
    narrative.push('Volatility Risk prekročil prah — DEFENSIVE mód aktivovaný, nové buy príkazy zmrazené.');
  } else if (mode === 'CAUTIOUS_ACCUMULATION') {
    narrative.push(`Cautious Accumulation — 200WMA NAD (${f200.value}) brzdí, ale F&G ${fFg.value} (panika) tlačí na nákupy. Core navýšený na ${coreWeight} %.`);
  } else if (mode === 'ACCUMULATION') {
    narrative.push(`Satelity ${satelliteWeight} % (ETH ${ethPct} % · SOL ${solPct} %) — likvidita ${fLi.value} podporuje rast.`);
  } else if (mode === 'DISTRIBUTION') {
    narrative.push(`Distribúcia — Core navýšený, satelity stlačené na ${satelliteWeight} %.`);
  } else {
    narrative.push(`Vyvážený režim — ${coreWeight}/${satelliteWeight} split medzi Core a satelitmi.`);
  }
  narrative.push(`CBBC kvalita ${fCb.value} · vol ${fVo.value}.`);
  if (volDefenseApplied) {
    narrative.push(`⚠ Volatility Defense: SOL 14D vol ${inputs.solVol14d.toFixed(2)} % > baseline ${solBaseline.toFixed(2)} % × 1.15 → +15 pp SOL → ETH.`);
  }
  if (qualityBiasApplied) {
    narrative.push(`Quality Bias: ${qualityFavorsEth ? `ETH CBBC ${ethCbbc} > SOL ${solCbbc}` : `SOL CBBC ${solCbbc} > ETH ${ethCbbc}`} → ${qualityFavorsEth ? 'ETH' : 'SOL'} +10 pp v satellite buckete.`);
  }
  // RYI Staking Booster line — always shown (aj keď je 0 pp).
  const ryiFavors = ryi.shiftPp > 0.5 ? 'SOL' : ryi.shiftPp < -0.5 ? 'ETH' : null;
  if (ryiFavors) {
    narrative.push(
      `RYI Booster: ${ryiFavors} (+${Math.abs(ryi.diff).toFixed(1)} % Real Yield · ETH ${ryi.ethRyi.toFixed(1)} % vs SOL ${ryi.solRyi.toFixed(1)} %) posúva alokáciu o ${Math.abs(ryi.shiftPp).toFixed(1)} pp v prospech ${ryiFavors}.`,
    );
  } else {
    narrative.push(`RYI Booster: ETH ${ryi.ethRyi.toFixed(1)} % vs SOL ${ryi.solRyi.toFixed(1)} % Real Yield — bez posunu (Δ ${ryi.diff.toFixed(2)} %).`);
  }

  // Smooth macro ratio narrative
  if (smooth.drifting) {
    narrative.push(
      `Plynulý prechod pomeru: Core ${coreWeight.toFixed(1)} % → cieľ ${smooth.target.toFixed(1)} % (Δ ${smooth.gapPp > 0 ? '+' : ''}${smooth.gapPp.toFixed(1)} pp, max 2,5 pp / 24 h, EMA polčas 36 h).`,
    );
  } else {
    narrative.push(`Makro pomer stabilizovaný na Core ${coreWeight.toFixed(1)} % (cieľ dosiahnutý, BTC floor 50 % vždy platí).`);
  }

  return {
    factors,
    mode,
    coreWeight,
    satelliteWeight,
    highBetaWeight,
    proxyWeight,
    yieldWeight: 0,
    privacyWeight,
    perToken: { btc: coreWeight, eth: ethPct, sol: solPct, zec: 0 },
    narrative,
    defensiveLock,
    score,
    rawCoreTargetPct: Math.round(smooth.target * 10) / 10,
    ratioGapPp: smooth.gapPp,
    ratioDrifting: smooth.drifting,
    ratioState: smooth.state,
  };

}
