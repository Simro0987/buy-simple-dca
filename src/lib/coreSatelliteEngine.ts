// Autonomous Core-Satellite Engine
// Derives Core (BTC) vs Satellite (ETH+SOL) split from market score + 5 factors.
// Pure / deterministic — UI components consume the result through MarketContext.

import { continuousTokenSplit } from '@/lib/dcaAllocationEngine';
import { getLatestMarketScore } from '@/lib/dcaScoreBridge';

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
  /** Komozitné skóre 0..100 z Monday Controller (plynulý token split). */
  marketScore?: number;
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

  const mode = inferMode(score, defensiveLock, f200, fFg);

  const marketScore = inputs.marketScore ?? getLatestMarketScore();
  const split = continuousTokenSplit(marketScore);
  let coreWeight = Math.round(defensiveLock ? Math.max(split.btc, 75) : split.btc);
  const satelliteWeight = 100 - coreWeight;
  const satSplit = split.eth + split.sol;
  const ethPct = satSplit > 0 ? Math.round(satelliteWeight * (split.eth / satSplit)) : 0;
  const solPct = satelliteWeight - ethPct;

  const narrative: string[] = [];
  narrative.push(split.why);
  if (defensiveLock) {
    narrative.push('Volatility Risk prekročil prah — DEFENSIVE mód, BTC kotva navýšená, nové buy príkazy zmrazené.');
  }
  narrative.push(`5 faktorov: 200WMA ${f200.value} · F&G ${fFg.value} · CBBC ${fCb.value}.`);

  return {
    factors,
    mode,
    coreWeight,
    satelliteWeight,
    perToken: { btc: coreWeight, eth: ethPct, sol: solPct },
    narrative,
    defensiveLock,
  };
}
