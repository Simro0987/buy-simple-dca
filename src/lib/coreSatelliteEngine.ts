// Autonomous Core-Satellite Engine
// Derives Core (BTC) vs Satellite (ETH+SOL) split from 5 Market Mode factors.
// Pure / deterministic — UI components consume the result through MarketContext.

import { ryiAllocationShiftPp } from './realYieldIndex';

export type MarketMode = 'ACCUMULATION' | 'CAUTIOUS_ACCUMULATION' | 'BALANCED' | 'DISTRIBUTION' | 'DEFENSIVE';

export type FactorKey = 'wma200' | 'fearGreed' | 'cbbc' | 'liquidity' | 'volatility';
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
  /** Real Yield Index (APY − inflation, %) for ETH — "Staking Booster" input. */
  ethRyi?: number;
  /** Real Yield Index (APY − inflation, %) for SOL — "Staking Booster" input. */
  solRyi?: number;
}

export interface EngineResult {
  factors: FactorReading[];
  mode: MarketMode;
  /** Core (BTC) weight in %, clamped to [50, 75]. */
  coreWeight: number;
  /** Satellite (ETH+SOL) weight in %, clamped to [25, 50]. */
  satelliteWeight: number;
  /** Per-token recommended split inside the budget. */
  perToken: { btc: number; eth: number; sol: number };
  /** Slovak narrative bullets explaining the shift. */
  narrative: string[];
  /** True when DEFENSIVE mode is forced — buys frozen, alert raised. */
  defensiveLock: boolean;
  /** RYI (Real Yield Index) Staking Booster breakdown for the satellite split. */
  satelliteRyi: {
    eth: number;
    sol: number;
    /** Allocation shift in pp (+ toward ETH, − toward SOL). */
    shiftPp: number;
    boosterApplied: boolean;
  };
}

const BTC_VOL_DANGER = 4.5;   // % daily stdev → systemic stress
const SAT_VOL_DANGER = 7.0;   // ETH/SOL combined avg above this → DEFENSIVE

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// BTC-ONLY 200WMA reading. NEVER apply to ETH/SOL.
function read200wma(btc: number | null): FactorReading {
  if (btc === null) {
    return {
      key: 'wma200', label: '200WMA',
      status: 'neu', bias: 0, value: 'N/A', detail: 'BTC 200WMA nedostupné (cache purge / sanity check)',
    };
  }
  const fmt = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
  // BTC-only bands.
  if (btc < -15) return { key: 'wma200', label: 'BTC 200WMA POD', status: 'pos', bias: +1.0, value: `${fmt(btc)} | POD`, detail: 'BTC hlboko pod 200WMA — kapitulácia / akumulácia' };
  if (btc < -3)  return { key: 'wma200', label: 'BTC 200WMA POD', status: 'pos', bias: +0.7, value: `${fmt(btc)} | POD`, detail: 'BTC pod 200WMA — akumulačné pásmo' };
  if (btc <= 3)  return { key: 'wma200', label: 'BTC 200WMA Neutrál', status: 'neu', bias: 0, value: `${fmt(btc)} | NEUTRAL`, detail: 'BTC tesne pri 200WMA — neutrálne pásmo' };
  if (btc <= 15) return { key: 'wma200', label: 'BTC 200WMA NAD', status: 'neg', bias: -0.4, value: `${fmt(btc)} | NAD`, detail: 'BTC mierne nad 200WMA — opatrnosť / mierna distribúcia' };
  if (btc <= 35) return { key: 'wma200', label: 'BTC 200WMA NAD', status: 'neg', bias: -0.7, value: `${fmt(btc)} | NAD`, detail: 'BTC výrazne nad 200WMA — distribučná zóna' };
  return { key: 'wma200', label: 'BTC 200WMA NAD', status: 'neg', bias: -1.0, value: `${fmt(btc)} | NAD`, detail: 'Prehriaty BTC — silná distribúcia' };
}

function readFearGreed(v: number | null): FactorReading {
  if (v === null) return { key: 'fearGreed', label: 'Fear & Greed', status: 'neu', bias: 0, value: 'N/A', detail: 'Alternative.me nedostupné' };
  if (v <= 20) return { key: 'fearGreed', label: 'Extreme Fear', status: 'pos', bias: +1, value: `${v}`, detail: 'Kapitulácia — akumulačná príležitosť' };
  if (v <= 40) return { key: 'fearGreed', label: 'Fear', status: 'pos', bias: +0.5, value: `${v}`, detail: 'Sentiment pod priemerom' };
  if (v >= 80) return { key: 'fearGreed', label: 'Extreme Greed', status: 'neg', bias: -0.8, value: `${v}`, detail: 'Eufória — riziko distribúcie' };
  if (v >= 60) return { key: 'fearGreed', label: 'Greed', status: 'neu', bias: -0.3, value: `${v}`, detail: 'Sentiment nad priemerom' };
  return { key: 'fearGreed', label: 'Neutral', status: 'neu', bias: 0, value: `${v}`, detail: 'Vyvážený sentiment' };
}

function readCbbc(avg: number): FactorReading {
  if (avg >= 88) return { key: 'cbbc', label: 'CBBC Quality', status: 'pos', bias: +0.4, value: `${avg.toFixed(0)}`, detail: 'Vysoká kvalita košíka — priestor pre satelity' };
  if (avg >= 75) return { key: 'cbbc', label: 'CBBC Quality', status: 'neu', bias: +0.1, value: `${avg.toFixed(0)}`, detail: 'Štandardná kvalita košíka' };
  if (avg >= 60) return { key: 'cbbc', label: 'CBBC Quality', status: 'neu', bias: -0.2, value: `${avg.toFixed(0)}`, detail: 'Nižšia kvalita — preferuj Core' };
  return { key: 'cbbc', label: 'CBBC Quality', status: 'neg', bias: -0.5, value: `${avg.toFixed(0)}`, detail: 'Slabá kvalita — Core dominantné' };
}

function readLiquidity(solTvl: number | null): FactorReading {
  if (solTvl === null || solTvl <= 0) return { key: 'liquidity', label: 'Likvidita', status: 'neu', bias: 0, value: 'N/A', detail: 'DefiLlama TVL nedostupné' };
  const b = solTvl / 1e9;
  if (b >= 12) return { key: 'liquidity', label: 'Likvidita Up', status: 'pos', bias: +0.5, value: `$${b.toFixed(1)} B`, detail: 'Solana TVL rastie — alts môžu reagovať' };
  if (b >= 8)  return { key: 'liquidity', label: 'Likvidita OK', status: 'neu', bias: 0, value: `$${b.toFixed(1)} B`, detail: 'TVL v zdravom pásme' };
  return { key: 'liquidity', label: 'Likvidita Down', status: 'neg', bias: -0.5, value: `$${b.toFixed(1)} B`, detail: 'TVL pod prahom $8 B — utiahnuť satelity' };
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
  if (btcVol >= 3 || satAvg >= 5) return { key: 'volatility', label: 'Volatility High', status: 'neg', bias: -0.5, value: `${btcVol.toFixed(1)}%`, detail: 'Zvýšená vol — preferuj Core, šírka limitov' };
  if (btcVol <= 1.5 && satAvg <= 2.5) return { key: 'volatility', label: 'Volatility Low', status: 'pos', bias: +0.3, value: `${btcVol.toFixed(1)}%`, detail: 'Pokojný trh — priestor pre satelity' };
  return { key: 'volatility', label: 'Volatility OK', status: 'neu', bias: 0, value: `${btcVol.toFixed(1)}%`, detail: 'Štandardná volatilita' };
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
  const factors: FactorReading[] = [f200, fFg, fCb, fLi, fVo];

  const defensiveLock = fVo.status === 'critical';

  // Weighted bias → mapped to core weight 50..75 (high bias = more BTC = ACCUMULATION/DEFENSIVE).
  // Positive bias → accumulate → tilt Core slightly higher (BTC anchor).
  // Negative bias → distribution risk → keep Core dominant to defend.
  // BALANCED midpoint sits at ~62 % Core.
  const weights = { wma200: 0.25, fearGreed: 0.20, cbbc: 0.15, liquidity: 0.15, volatility: 0.25 };
  const score = factors.reduce((s, f) => s + (f.bias || 0) * (weights[f.key] ?? 0), 0); // -1..+1

  let coreWeight: number;
  if (defensiveLock) {
    coreWeight = 75; // max BTC anchor
  } else if (score >= 0.45) {
    // strong accumulation — slightly heavier satellites to capture upside
    coreWeight = clamp(58 - score * 8, 50, 75);
  } else if (score <= -0.45) {
    coreWeight = clamp(70 + Math.abs(score) * 5, 50, 75);
  } else {
    coreWeight = clamp(62 - score * 10, 50, 75);
  }
  coreWeight = Math.round(coreWeight);
  const satelliteWeight = 100 - coreWeight;

  // === AUTONOMOUS SATELLITE SPLIT (ETH vs SOL) ===
  // Baseline ETH-heavy (ETH = bluechip satellite, deeper liquidity, larger market cap).
  // Inputs: per-coin CBBC quality + 14D volatility (independent ATR proxy).
  // Rule 1 — QUALITY BIAS: if ETH CBBC > SOL CBBC → +10 pp weight advantage to ETH.
  // Rule 2 — VOLATILITY DEFENSE: if SOL vol > baseline × 1.15 → shift +15 pp from SOL → ETH.
  const ethCbbc = inputs.ethCbbc ?? 92;
  const solCbbc = inputs.solCbbc ?? 84;
  const solBaseline = inputs.solVol14dBaseline ?? 4.0;
  let ethShare = 0.60; // ETH baseline 60 % of satellite bucket
  const qualityBiasApplied = ethCbbc > solCbbc;
  if (qualityBiasApplied) ethShare += 0.10;
  const solVolRatio = solBaseline > 0 ? inputs.solVol14d / solBaseline : 1;
  const volDefenseApplied = solVolRatio > 1.15;
  if (volDefenseApplied) ethShare += 0.15;

  // Rule 3 — RYI (Real Yield Index) "Staking Booster": a PROPORTIONAL shift on
  // top of the CBBC quality bias / volatility defense. The satellite with the
  // higher real yield (APY − inflation) gains allocation in proportion to the
  // RYI gap (2 pp per 1 % of difference). Additive — nothing above is removed.
  const ryiEth = inputs.ethRyi ?? 0;
  const ryiSol = inputs.solRyi ?? 0;
  const ryiShiftPp = ryiAllocationShiftPp(ryiEth, ryiSol); // + toward ETH, − toward SOL
  ethShare += ryiShiftPp / 100;
  const ryiBoosterApplied = Math.abs(ryiShiftPp) >= 0.5;

  ethShare = clamp(ethShare, 0.50, 0.95);
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
    narrative.push(`⚠ Volatility Defense: SOL 14D vol ${inputs.solVol14d.toFixed(2)} % > baseline ${solBaseline.toFixed(2)} % × 1.15 → kapitál presunutý zo SOL do ETH (+15 pp).`);
  } else if (qualityBiasApplied) {
    narrative.push(`Quality Bias: ETH CBBC ${ethCbbc} > SOL CBBC ${solCbbc} → ETH dostáva +10 pp výhodu v satelite buckete.`);
  }
  if (ryiBoosterApplied) {
    const leader = ryiEth >= ryiSol ? 'ETH' : 'SOL';
    const laggard = leader === 'ETH' ? 'SOL' : 'ETH';
    const leaderRyi = Math.max(ryiEth, ryiSol);
    narrative.push(`RYI Booster: ${leader} (Real Yield +${leaderRyi.toFixed(1)} %) posúva alokáciu o +${Math.abs(ryiShiftPp).toFixed(0)} pp voči ${laggard}.`);
  }

  return {
    factors,
    mode,
    coreWeight,
    satelliteWeight,
    perToken: { btc: coreWeight, eth: ethPct, sol: solPct },
    narrative,
    defensiveLock,
    satelliteRyi: {
      eth: ryiEth,
      sol: ryiSol,
      shiftPp: ryiShiftPp,
      boosterApplied: ryiBoosterApplied,
    },
  };
}
