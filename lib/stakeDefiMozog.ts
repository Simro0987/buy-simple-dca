/** DeFi Mozog — multi-layer ETH staking architecture & Smart Routing. */

export const STAKE_FOCUS_SYMBOL = "ETH";

/** Layer 1 — gas & take-profit reserve (never staked). */
export const GAS_RESERVE_PCT = 20;

export const DEFAULT_LIDO_SHARE_PCT = 30;
export const DEFAULT_ROCKET_SHARE_PCT = 70;

export interface EthGasSnapshot {
  baseFeeGwei: number;
  fastFeeGwei: number;
  source: "live" | "fallback";
}

export interface StakingProtocolQuote {
  id: "lido" | "rocket-pool";
  label: string;
  token: string;
  apyPct: number;
  tvlUsd?: number;
  sharePct: number;
}

export interface SmartRouteQuote {
  id: "native_mint" | "cowswap" | "oneinch" | "jumper" | "uniswap";
  label: string;
  outputToken: string;
  effectiveApyPct: number;
  feeUsd: number;
  slippagePct: number;
  etaMinutes: number;
  recommended?: boolean;
}

export interface AdvancedVaultOption {
  id: "earneth";
  label: string;
  underlying: string;
  apyBoostPct: number;
  riskLevel: "low" | "medium" | "elevated";
  riskNote: string;
  contractAddress: string;
}

export interface StakeLayerAllocation {
  gasReserveEth: number;
  gasReservePct: number;
  coreStakingEth: number;
  lidoEth: number;
  rocketEth: number;
  vaultEligibleEth: number;
}

export interface StakeMozogSnapshot {
  availableEth: number;
  ethPriceUsd: number;
  availableUsd: number;
  gas: EthGasSnapshot;
  protocols: StakingProtocolQuote[];
  smartRoutes: SmartRouteQuote[];
  vaults: AdvancedVaultOption[];
  allocation: StakeLayerAllocation;
}

export const ADVANCED_VAULTS: AdvancedVaultOption[] = [
  {
    id: "earneth",
    label: "EarnETH Vault",
    underlying: "stETH / rETH",
    apyBoostPct: 0.8,
    riskLevel: "elevated",
    riskNote:
      "Smart-contract vault s re-staking expozíciou. Vyšší výnos, ale dodatočný protokolový a kontrahentný risk oproti natívnemu LST.",
    contractAddress: "0xEEF0f605245b4c364b209C947daBD8f83047a991",
  },
];

const FALLBACK_GAS: EthGasSnapshot = {
  baseFeeGwei: 18.5,
  fastFeeGwei: 24.2,
  source: "fallback",
};

const SMART_ROUTE_DEFS: Array<{
  id: SmartRouteQuote["id"];
  label: string;
  feeMultiplier: number;
  slippageBase: number;
  etaMinutes: number;
}> = [
  { id: "native_mint", label: "Native Mint", feeMultiplier: 0.35, slippageBase: 0.02, etaMinutes: 8 },
  { id: "cowswap", label: "CowSwap", feeMultiplier: 0.55, slippageBase: 0.04, etaMinutes: 12 },
  { id: "oneinch", label: "1inch", feeMultiplier: 0.65, slippageBase: 0.06, etaMinutes: 6 },
  { id: "jumper", label: "Jumper", feeMultiplier: 0.5, slippageBase: 0.05, etaMinutes: 10 },
  { id: "uniswap", label: "Uniswap", feeMultiplier: 0.75, slippageBase: 0.08, etaMinutes: 5 },
];

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function computeStakeLayerAllocation(
  availableEth: number,
  lidoSharePct: number,
): StakeLayerAllocation {
  const safeEth = Math.max(0, availableEth);
  const gasReserveEth = round4(safeEth * (GAS_RESERVE_PCT / 100));
  const coreStakingEth = round4(Math.max(0, safeEth - gasReserveEth));
  const lidoPct = Math.min(100, Math.max(0, lidoSharePct));
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

export function buildSmartRouteQuotes(input: {
  amountEth: number;
  ethPriceUsd: number;
  targetApyPct: number;
  gasFastGwei: number;
}): SmartRouteQuote[] {
  const gasUsd =
    input.ethPriceUsd > 0
      ? (input.gasFastGwei * 1e-9) * 180_000 * input.ethPriceUsd
      : 4.5;

  const routes = SMART_ROUTE_DEFS.map((route) => {
    const feeUsd = round2(gasUsd * route.feeMultiplier);
    const slippagePct = round2(route.slippageBase + (input.amountEth > 1 ? 0.02 : 0));
    const effectiveApyPct = round2(
      Math.max(0, input.targetApyPct - slippagePct * 0.15 - feeUsd * 0.02),
    );

    return {
      id: route.id,
      label: route.label,
      outputToken: "stETH / rETH",
      effectiveApyPct,
      feeUsd,
      slippagePct,
      etaMinutes: route.etaMinutes,
      recommended: false,
    };
  });

  const bestIdx = routes.reduce(
    (bestI, route, i, arr) =>
      route.effectiveApyPct > arr[bestI].effectiveApyPct ? i : bestI,
    0,
  );
  routes[bestIdx] = { ...routes[bestIdx], recommended: true };

  return routes.sort((a, b) => b.effectiveApyPct - a.effectiveApyPct);
}

export function buildProtocolQuotes(input: {
  lidoSharePct: number;
  lidoApyPct: number;
  rocketApyPct: number;
  lidoTvlUsd?: number;
  rocketTvlUsd?: number;
}): StakingProtocolQuote[] {
  const lidoShare = Math.min(100, Math.max(0, input.lidoSharePct));
  return [
    {
      id: "lido",
      label: "Lido",
      token: "stETH / wstETH",
      apyPct: input.lidoApyPct,
      tvlUsd: input.lidoTvlUsd,
      sharePct: lidoShare,
    },
    {
      id: "rocket-pool",
      label: "Rocket Pool",
      token: "rETH",
      apyPct: input.rocketApyPct,
      tvlUsd: input.rocketTvlUsd,
      sharePct: 100 - lidoShare,
    },
  ];
}

export async function fetchEthGasSnapshot(): Promise<EthGasSnapshot> {
  try {
    const res = await fetch("https://cloudflare-eth.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBlockByNumber",
        params: ["latest", false],
      }),
      cache: "no-store",
    });

    if (!res.ok) return FALLBACK_GAS;

    const json = (await res.json()) as {
      result?: { baseFeePerGas?: string };
    };
    const baseHex = json.result?.baseFeePerGas;
    if (!baseHex) return FALLBACK_GAS;

    const baseFeeGwei = parseInt(baseHex, 16) / 1e9;
    if (!Number.isFinite(baseFeeGwei) || baseFeeGwei <= 0) return FALLBACK_GAS;

    const fastFeeGwei = round2(baseFeeGwei * 1.25 + 1.5);

    return {
      baseFeeGwei: round2(baseFeeGwei),
      fastFeeGwei,
      source: "live",
    };
  } catch {
    return FALLBACK_GAS;
  }
}

export function buildStakeMozogSnapshot(input: {
  availableEth: number;
  ethPriceUsd: number;
  lidoSharePct: number;
  lidoApyPct: number;
  rocketApyPct: number;
  gas: EthGasSnapshot;
  lidoTvlUsd?: number;
  rocketTvlUsd?: number;
}): StakeMozogSnapshot {
  const allocation = computeStakeLayerAllocation(
    input.availableEth,
    input.lidoSharePct,
  );
  const blendedApy =
    (input.lidoApyPct * input.lidoSharePct +
      input.rocketApyPct * (100 - input.lidoSharePct)) /
    100;

  return {
    availableEth: input.availableEth,
    ethPriceUsd: input.ethPriceUsd,
    availableUsd: round2(input.availableEth * input.ethPriceUsd),
    gas: input.gas,
    protocols: buildProtocolQuotes({
      lidoSharePct: input.lidoSharePct,
      lidoApyPct: input.lidoApyPct,
      rocketApyPct: input.rocketApyPct,
      lidoTvlUsd: input.lidoTvlUsd,
      rocketTvlUsd: input.rocketTvlUsd,
    }),
    smartRoutes: buildSmartRouteQuotes({
      amountEth: allocation.coreStakingEth,
      ethPriceUsd: input.ethPriceUsd,
      targetApyPct: blendedApy,
      gasFastGwei: input.gas.fastFeeGwei,
    }),
    vaults: ADVANCED_VAULTS,
    allocation,
  };
}
