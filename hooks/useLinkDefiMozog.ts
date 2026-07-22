"use client";

import { useEffect, useMemo, useState } from "react";
import {
  computeLinkCapitalAllocation,
  fetchLinkDefiDataLayer,
  type LinkCapitalAllocation,
  type MorphoSupplyData,
} from "@/lib/linkDefi/dataLayer";
import { MORPHO_BLUE_ARBITRUM } from "@/lib/linkDefi/constants";

export interface LinkDefiMozogSnapshot {
  availableLink: number;
  linkPriceUsd: number;
  linkPriceSource: "live" | "fallback";
  availableUsd: number;
  morpho: MorphoSupplyData;
  allocation: LinkCapitalAllocation;
  loading: boolean;
  network: string;
  vaultLabel: string;
  vaultUrl: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function useLinkDefiMozog(input: {
  availableLink: number;
  fallbackLinkPrice?: number;
}): LinkDefiMozogSnapshot {
  const fallbackPrice = input.fallbackLinkPrice ?? 15;

  const [linkPriceUsd, setLinkPriceUsd] = useState(fallbackPrice);
  const [linkPriceSource, setLinkPriceSource] = useState<"live" | "fallback">(
    "fallback",
  );
  const [morpho, setMorpho] = useState<MorphoSupplyData>({
    apyPct: 4.5,
    baseApyPct: 3.2,
    rewardApyPct: 1.3,
    source: "fallback",
  });
  const [dataReady, setDataReady] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const data = await fetchLinkDefiDataLayer();
      if (!active) return;
      setLinkPriceUsd(data.price.usd);
      setLinkPriceSource(data.price.source);
      setMorpho(data.morpho);
      setDataReady(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const allocation = useMemo(
    () => computeLinkCapitalAllocation(input.availableLink),
    [input.availableLink],
  );

  return {
    availableLink: input.availableLink,
    linkPriceUsd,
    linkPriceSource,
    availableUsd: round2(input.availableLink * linkPriceUsd),
    morpho,
    allocation,
    loading: !dataReady,
    network: MORPHO_BLUE_ARBITRUM.network,
    vaultLabel: MORPHO_BLUE_ARBITRUM.label,
    vaultUrl: MORPHO_BLUE_ARBITRUM.url,
  };
}
