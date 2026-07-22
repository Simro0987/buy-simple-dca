"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { EARNETH_VAULT_ADDRESS } from "@/lib/ethDefi/constants";
import {
  fetchEthDefiDataLayer,
  type OnChainMintRates,
} from "@/lib/ethDefi/dataLayer";
import {
  buildSmartRoutingQuotes,
  type RoutingWinner,
  type SmartRouteQuote,
} from "@/lib/ethDefi/metaAggregator";
import {
  computeStakeLayerAllocation,
  computeWmaAllocation,
  type StakeLayerAllocation,
  type WmaAllocationResult,
} from "@/lib/ethDefi/riskAllocation";
import { useGasEstimator } from "@/hooks/useGasEstimator";

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
  depositGasUsd: number;
  inheritedToken: "stETH" | "wstETH";
}

export interface EthDefiMozogSnapshot {
  availableEth: number;
  ethPriceUsd: number;
  ethPriceSource: "live" | "fallback";
  availableUsd: number;
  gas: {
    baseFeeGwei: number;
    fastFeeGwei: number;
    source: "live" | "fallback";
  };
  wma: WmaAllocationResult;
  protocols: StakingProtocolQuote[];
  smartRoutes: SmartRouteQuote[];
  rocketRoutes: SmartRouteQuote[];
  lidoRoutes: SmartRouteQuote[];
  routingWinner: RoutingWinner | null;
  vaults: AdvancedVaultOption[];
  allocation: StakeLayerAllocation;
  mintRatesSource: "live" | "fallback";
  apySource: "live" | "fallback";
  loading: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function useEthDefiMozog(input: {
  availableEth: number;
  fallbackEthPrice?: number;
}): EthDefiMozogSnapshot {
  const fallbackPrice = input.fallbackEthPrice ?? 3500;
  const gasEstimator = useGasEstimator(fallbackPrice);

  const [ethPriceUsd, setEthPriceUsd] = useState(fallbackPrice);
  const [ethPriceSource, setEthPriceSource] = useState<"live" | "fallback">(
    "fallback",
  );
  const [lidoApy, setLidoApy] = useState(2.2);
  const [rocketApy, setRocketApy] = useState(2.2);
  const [lidoTvl, setLidoTvl] = useState<number | undefined>();
  const [rocketTvl, setRocketTvl] = useState<number | undefined>();
  const [apySource, setApySource] = useState<"live" | "fallback">("fallback");
  const [mintRates, setMintRates] = useState<OnChainMintRates>({
    stEthPerEth: 1,
    wstEthPerEth: 1.15,
    rEthPerEth: 0.926,
    source: "fallback",
  });
  const [smartRoutes, setSmartRoutes] = useState<SmartRouteQuote[]>([]);
  const [routingWinner, setRoutingWinner] = useState<RoutingWinner | null>(
    null,
  );
  const [dataReady, setDataReady] = useState(false);
  const [routesReady, setRoutesReady] = useState(false);

  useEffect(() => {
    let active = true;

    void (async () => {
      const data = await fetchEthDefiDataLayer();
      if (!active) return;

      setEthPriceUsd(data.price.usd);
      setEthPriceSource(data.price.source);
      setLidoApy(data.apy.lidoApyPct);
      setRocketApy(data.apy.rocketApyPct);
      setLidoTvl(data.apy.lidoTvlUsd);
      setRocketTvl(data.apy.rocketTvlUsd);
      setApySource(data.apy.source);
      setMintRates(data.mintRates);
      setDataReady(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  const wma = useMemo(
    () => computeWmaAllocation(lidoApy, rocketApy),
    [lidoApy, rocketApy],
  );

  const allocation = useMemo(
    () => computeStakeLayerAllocation(input.availableEth, wma.lidoSharePct),
    [input.availableEth, wma.lidoSharePct],
  );

  const protocols = useMemo<StakingProtocolQuote[]>(
    () => [
      {
        id: "lido",
        label: "Lido",
        token: "stETH / wstETH",
        apyPct: lidoApy,
        tvlUsd: lidoTvl,
        sharePct: wma.lidoSharePct,
      },
      {
        id: "rocket-pool",
        label: "Rocket Pool",
        token: "rETH",
        apyPct: rocketApy,
        tvlUsd: rocketTvl,
        sharePct: wma.rocketSharePct,
      },
    ],
    [lidoApy, rocketApy, lidoTvl, rocketTvl, wma],
  );

  const refreshRoutes = useCallback(async () => {
    if (!dataReady) return;

    setRoutesReady(false);
    const result = await buildSmartRoutingQuotes({
      lidoEth: allocation.lidoEth,
      rocketEth: allocation.rocketEth,
      ethPriceUsd,
      lidoApyPct: lidoApy,
      rocketApyPct: rocketApy,
      gwei: gasEstimator.fastFeeGwei,
      mintRates,
    });

    setSmartRoutes(result.routes);
    setRoutingWinner(result.routingWinner);
    setRoutesReady(true);
  }, [
    dataReady,
    allocation.lidoEth,
    allocation.rocketEth,
    ethPriceUsd,
    lidoApy,
    rocketApy,
    gasEstimator.fastFeeGwei,
    mintRates,
  ]);

  useEffect(() => {
    void refreshRoutes();
  }, [refreshRoutes]);

  const inheritedToken: "stETH" | "wstETH" =
    routingWinner?.lidoToken ?? "stETH";

  const vaults = useMemo<AdvancedVaultOption[]>(
    () => [
      {
        id: "earneth",
        label: "EarnETH Vault",
        underlying: inheritedToken,
        apyBoostPct: 0.8,
        riskLevel: inheritedToken === "wstETH" ? "elevated" : "medium",
        riskNote:
          inheritedToken === "wstETH"
            ? `Smart-contract vault s re-staking expozíciou cez ${inheritedToken}. Extra wrapping kontrakt + vault risk oproti natívnemu LST.`
            : `Smart-contract vault s re-staking expozíciou cez ${inheritedToken}. Vyšší výnos, ale dodatočný protokolový risk oproti natívnemu LST.`,
        contractAddress: EARNETH_VAULT_ADDRESS,
        depositGasUsd: gasEstimator.earnEthDepositGasUsd(ethPriceUsd),
        inheritedToken,
      },
    ],
    [inheritedToken, gasEstimator, ethPriceUsd],
  );

  const rocketRoutes = useMemo(
    () => smartRoutes.filter((r) => r.section === "rocket"),
    [smartRoutes],
  );
  const lidoRoutes = useMemo(
    () => smartRoutes.filter((r) => r.section === "lido"),
    [smartRoutes],
  );

  return {
    availableEth: input.availableEth,
    ethPriceUsd,
    ethPriceSource,
    availableUsd: round2(input.availableEth * ethPriceUsd),
    gas: {
      baseFeeGwei: gasEstimator.baseFeeGwei,
      fastFeeGwei: gasEstimator.fastFeeGwei,
      source: gasEstimator.source,
    },
    wma,
    protocols,
    smartRoutes,
    rocketRoutes,
    lidoRoutes,
    routingWinner,
    vaults,
    allocation,
    mintRatesSource: mintRates.source,
    apySource,
    loading: !dataReady || !routesReady,
  };
}
