"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSolanaGasEstimator } from "@/hooks/useSolanaGasEstimator";
import {
  fetchSolDefiDataLayer,
  type JitoMintRateData,
} from "@/lib/solDefi/dataLayer";
import {
  buildSolSmartRoutingQuotes,
  type JitoRoutingWinner,
  type MarinadeRoutingWinner,
  type SolSmartRouteQuote,
} from "@/lib/solDefi/metaAggregator";
import {
  buildRestakingRecommendation,
  type RestakingVaultRecommendation,
} from "@/lib/solDefi/restakingVaults";
import {
  computeStakeLayerAllocation,
  computeWmaAllocation,
  type StakeLayerAllocation,
  type WmaAllocationResult,
} from "@/lib/solDefi/riskAllocation";

export interface SolStakingProtocolQuote {
  id: "marinade" | "jito";
  label: string;
  token: string;
  apyPct: number;
  tvlUsd?: number;
  sharePct: number;
}

export interface SolDefiMozogSnapshot {
  availableSol: number;
  solPriceUsd: number;
  solPriceSource: "live" | "fallback";
  availableUsd: number;
  gas: {
    baseFeeLamports: number;
    priorityFeeLamports: number;
    totalFeeSol: number;
    totalFeeUsd: number;
    source: "live" | "fallback";
  };
  wma: WmaAllocationResult;
  protocols: SolStakingProtocolQuote[];
  smartRoutes: SolSmartRouteQuote[];
  marinadeRoutes: SolSmartRouteQuote[];
  jitoRoutes: SolSmartRouteQuote[];
  marinadeWinner: MarinadeRoutingWinner | null;
  jitoWinner: JitoRoutingWinner | null;
  restaking: RestakingVaultRecommendation | null;
  allocation: StakeLayerAllocation;
  mintRate: JitoMintRateData;
  apySource: "live" | "fallback";
  loading: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function useSolDefiMozog(input: {
  availableSol: number;
  fallbackSolPrice?: number;
}): SolDefiMozogSnapshot {
  const fallbackPrice = input.fallbackSolPrice ?? 150;
  const gasEstimator = useSolanaGasEstimator(fallbackPrice);

  const [solPriceUsd, setSolPriceUsd] = useState(fallbackPrice);
  const [solPriceSource, setSolPriceSource] = useState<"live" | "fallback">(
    "fallback",
  );
  const [marinadeApy, setMarinadeApy] = useState(7.0);
  const [jitoApy, setJitoApy] = useState(8.0);
  const [marinadeTvl, setMarinadeTvl] = useState<number | undefined>();
  const [jitoTvl, setJitoTvl] = useState<number | undefined>();
  const [apySource, setApySource] = useState<"live" | "fallback">("fallback");
  const [mintRate, setMintRate] = useState<JitoMintRateData>({
    jitoSolPerSol: 0.98,
    source: "fallback",
  });
  const [smartRoutes, setSmartRoutes] = useState<SolSmartRouteQuote[]>([]);
  const [marinadeWinner, setMarinadeWinner] =
    useState<MarinadeRoutingWinner | null>(null);
  const [jitoWinner, setJitoWinner] = useState<JitoRoutingWinner | null>(null);
  const [dataReady, setDataReady] = useState(false);
  const [routesReady, setRoutesReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const data = await fetchSolDefiDataLayer();
      if (!active) return;

      setSolPriceUsd(data.price.usd);
      setSolPriceSource(data.price.source);
      setMarinadeApy(data.apy.marinadeApyPct);
      setJitoApy(data.apy.jitoApyPct);
      setMarinadeTvl(data.apy.marinadeTvlUsd);
      setJitoTvl(data.apy.jitoTvlUsd);
      setApySource(data.apy.source);
      setMintRate(data.mintRate);
      setDataReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const wma = useMemo(
    () => computeWmaAllocation(marinadeApy, jitoApy),
    [marinadeApy, jitoApy],
  );

  const allocation = useMemo(
    () => computeStakeLayerAllocation(input.availableSol, wma.marinadeSharePct),
    [input.availableSol, wma.marinadeSharePct],
  );

  const protocols = useMemo<SolStakingProtocolQuote[]>(
    () => [
      {
        id: "marinade",
        label: "Marinade Native",
        token: "Staked SOL",
        apyPct: marinadeApy,
        tvlUsd: marinadeTvl,
        sharePct: wma.marinadeSharePct,
      },
      {
        id: "jito",
        label: "Jito",
        token: "JitoSOL",
        apyPct: jitoApy,
        tvlUsd: jitoTvl,
        sharePct: wma.jitoSharePct,
      },
    ],
    [marinadeApy, jitoApy, marinadeTvl, jitoTvl, wma],
  );

  const refreshRoutes = useCallback(async () => {
    if (!dataReady) return;
    setRoutesReady(false);

    const result = await buildSolSmartRoutingQuotes({
      marinadeSol: allocation.marinadeSol,
      jitoSol: allocation.jitoSol,
      solPriceUsd,
      marinadeApyPct: marinadeApy,
      jitoApyPct: jitoApy,
      mintRate,
    });

    setSmartRoutes(result.routes);
    setMarinadeWinner(result.marinadeWinner);
    setJitoWinner(result.jitoWinner);
    setRoutesReady(true);
  }, [
    dataReady,
    allocation.marinadeSol,
    allocation.jitoSol,
    solPriceUsd,
    marinadeApy,
    jitoApy,
    mintRate,
  ]);

  useEffect(() => {
    void refreshRoutes();
  }, [refreshRoutes]);

  const jitoSolOutput = useMemo(() => {
    const winner = jitoWinner?.route;
    if (!winner) return round6(allocation.jitoSol * mintRate.jitoSolPerSol);
    return winner.outputAmount;
  }, [jitoWinner, allocation.jitoSol, mintRate.jitoSolPerSol]);

  const restaking = useMemo(() => {
    if (allocation.jitoSol <= 0) return null;
    return buildRestakingRecommendation(jitoSolOutput);
  }, [allocation.jitoSol, jitoSolOutput]);

  const totalFeeUsd = round2(gasEstimator.totalFeeSol * solPriceUsd);

  return {
    availableSol: input.availableSol,
    solPriceUsd,
    solPriceSource,
    availableUsd: round2(input.availableSol * solPriceUsd),
    gas: {
      baseFeeLamports: gasEstimator.baseFeeLamports,
      priorityFeeLamports: gasEstimator.priorityFeeLamports,
      totalFeeSol: gasEstimator.totalFeeSol,
      totalFeeUsd,
      source: gasEstimator.source,
    },
    wma,
    protocols,
    smartRoutes,
    marinadeRoutes: smartRoutes.filter((r) => r.section === "marinade"),
    jitoRoutes: smartRoutes.filter((r) => r.section === "jito"),
    marinadeWinner,
    jitoWinner,
    restaking,
    allocation,
    mintRate,
    apySource,
    loading: !dataReady || !routesReady,
  };
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
