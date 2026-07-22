import {
  GAS_RESERVE_PCT,
  RISK_PENALTY_BPS,
  WMA_CLAMP_MAX_PCT,
  WMA_CLAMP_MIN_PCT,
} from "@/lib/ethDefi/constants";

export interface WmaAllocationResult {
  lidoSharePct: number;
  rocketSharePct: number;
  riskAdjustedLidoApy: number;
  rawLidoApy: number;
  rawRocketApy: number;
}

export interface StakeLayerAllocation {
  gasReserveEth: number;
  gasReservePct: number;
  coreStakingEth: number;
  lidoEth: number;
  rocketEth: number;
  vaultEligibleEth: number;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Risk-adjusted Lido APY pre WMA výpočet (slider zobrazuje raw APY). */
export function applyLidoRiskPenalty(lidoApyPct: number): number {
  return Math.max(0, lidoApyPct - RISK_PENALTY_BPS / 100);
}

/**
 * WMA alokácia Lido vs Rocket Pool — pomer z risk-adjusted APY, clamp 30–70 %.
 */
export function computeWmaAllocation(
  lidoApyPct: number,
  rocketApyPct: number,
): WmaAllocationResult {
  const riskAdjustedLido = applyLidoRiskPenalty(lidoApyPct);
  const total = riskAdjustedLido + rocketApyPct;

  let lidoSharePct: number;
  if (total <= 0) {
    lidoSharePct = 50;
  } else {
    lidoSharePct = (riskAdjustedLido / total) * 100;
  }

  lidoSharePct = clamp(lidoSharePct, WMA_CLAMP_MIN_PCT, WMA_CLAMP_MAX_PCT);
  const rocketSharePct = 100 - lidoSharePct;

  return {
    lidoSharePct: round2(lidoSharePct),
    rocketSharePct: round2(rocketSharePct),
    riskAdjustedLidoApy: round2(riskAdjustedLido),
    rawLidoApy: lidoApyPct,
    rawRocketApy: rocketApyPct,
  };
}

export function computeStakeLayerAllocation(
  availableEth: number,
  lidoSharePct: number,
): StakeLayerAllocation {
  const safeEth = Math.max(0, availableEth);
  const gasReserveEth = round4(safeEth * (GAS_RESERVE_PCT / 100));
  const coreStakingEth = round4(Math.max(0, safeEth - gasReserveEth));
  const lidoPct = clamp(lidoSharePct, 0, 100);
  const rocketPct = 100 - lidoPct;
  const lidoEth = round4(coreStakingEth * (lidoPct / 100));
  const rocketEth = round4(coreStakingEth * (rocketPct / 100));

  return {
    gasReserveEth,
    gasReservePct: GAS_RESERVE_PCT,
    coreStakingEth,
    lidoEth,
    rocketEth,
    vaultEligibleEth: coreStakingEth,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
