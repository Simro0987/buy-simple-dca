import {
  GAS_RESERVE_PCT,
  RISK_PENALTY_BPS,
  WMA_CLAMP_MAX_PCT,
  WMA_CLAMP_MIN_PCT,
} from "@/lib/solDefi/constants";

export interface WmaAllocationResult {
  marinadeSharePct: number;
  jitoSharePct: number;
  riskAdjustedJitoApy: number;
  rawMarinadeApy: number;
  rawJitoApy: number;
}

export interface StakeLayerAllocation {
  gasReserveSol: number;
  gasReservePct: number;
  coreStakingSol: number;
  marinadeSol: number;
  jitoSol: number;
  vaultEligibleJitoSol: number;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function applyJitoRiskPenalty(jitoApyPct: number): number {
  return Math.max(0, jitoApyPct - RISK_PENALTY_BPS / 100);
}

/** WMA alokácia Marinade vs Jito — pomer z risk-adjusted APY, clamp 30–70 %. */
export function computeWmaAllocation(
  marinadeApyPct: number,
  jitoApyPct: number,
): WmaAllocationResult {
  const riskAdjustedJito = applyJitoRiskPenalty(jitoApyPct);
  const total = marinadeApyPct + riskAdjustedJito;

  let marinadeSharePct: number;
  if (total <= 0) {
    marinadeSharePct = 60;
  } else {
    marinadeSharePct = (marinadeApyPct / total) * 100;
  }

  marinadeSharePct = clamp(marinadeSharePct, WMA_CLAMP_MIN_PCT, WMA_CLAMP_MAX_PCT);
  const jitoSharePct = 100 - marinadeSharePct;

  return {
    marinadeSharePct: round2(marinadeSharePct),
    jitoSharePct: round2(jitoSharePct),
    riskAdjustedJitoApy: round2(riskAdjustedJito),
    rawMarinadeApy: marinadeApyPct,
    rawJitoApy: jitoApyPct,
  };
}

export function computeStakeLayerAllocation(
  availableSol: number,
  marinadeSharePct: number,
): StakeLayerAllocation {
  const safeSol = Math.max(0, availableSol);
  const gasReserveSol = round4(safeSol * (GAS_RESERVE_PCT / 100));
  const coreStakingSol = round4(Math.max(0, safeSol - gasReserveSol));
  const marinadePct = clamp(marinadeSharePct, 0, 100);
  const jitoPct = 100 - marinadePct;
  const marinadeSol = round4(coreStakingSol * (marinadePct / 100));
  const jitoSol = round4(coreStakingSol * (jitoPct / 100));

  return {
    gasReserveSol,
    gasReservePct: GAS_RESERVE_PCT,
    coreStakingSol,
    marinadeSol,
    jitoSol,
    vaultEligibleJitoSol: jitoSol,
  };
}
