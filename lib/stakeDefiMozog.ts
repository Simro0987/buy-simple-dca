/** DeFi Mozog — re-exports & backward-compatible types. */

export { STAKE_FOCUS_SYMBOL } from "@/lib/ethDefi/constants";
export { GAS_RESERVE_PCT } from "@/lib/ethDefi/constants";
export {
  computeStakeLayerAllocation,
  type StakeLayerAllocation,
} from "@/lib/ethDefi/riskAllocation";

export type { SmartRouteQuote } from "@/lib/ethDefi/metaAggregator";

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

export interface AdvancedVaultOption {
  id: "earneth";
  label: string;
  underlying: string;
  apyBoostPct: number;
  riskLevel: "low" | "medium" | "elevated";
  riskNote: string;
  contractAddress: string;
}

export interface StakeMozogSnapshot {
  availableEth: number;
  ethPriceUsd: number;
  availableUsd: number;
  gas: EthGasSnapshot;
  protocols: StakingProtocolQuote[];
  smartRoutes: import("@/lib/ethDefi/metaAggregator").SmartRouteQuote[];
  vaults: AdvancedVaultOption[];
  allocation: import("@/lib/ethDefi/riskAllocation").StakeLayerAllocation;
}

/** @deprecated Use useGasEstimator hook instead. */
export async function fetchEthGasSnapshot(): Promise<EthGasSnapshot> {
  const { createPublicClient, http } = await import("viem");
  const { mainnet } = await import("viem/chains");
  const { ETH_PUBLIC_RPC, FALLBACK_BASE_FEE_GWEI } = await import(
    "@/lib/ethDefi/constants"
  );

  try {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(ETH_PUBLIC_RPC),
    });
    const [block, fees] = await Promise.all([
      client.getBlock({ blockTag: "latest" }),
      client.estimateFeesPerGas(),
    ]);
    const baseFee = block.baseFeePerGas ?? fees.maxFeePerGas ?? fees.gasPrice;
    if (!baseFee) throw new Error("no fee");

    const baseFeeGwei = Number(baseFee) / 1e9;
    if (!Number.isFinite(baseFeeGwei) || baseFeeGwei <= 0) throw new Error("invalid");

    return {
      baseFeeGwei: Math.round(baseFeeGwei * 100) / 100,
      fastFeeGwei: Math.round((baseFeeGwei * 1.25 + 1.5) * 100) / 100,
      source: "live",
    };
  } catch {
    return {
      baseFeeGwei: FALLBACK_BASE_FEE_GWEI,
      fastFeeGwei: Math.round((FALLBACK_BASE_FEE_GWEI * 1.25 + 1.5) * 100) / 100,
      source: "fallback",
    };
  }
}
