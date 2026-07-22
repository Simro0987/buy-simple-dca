"use client";

import { useState } from "react";
import { EthDefiMozogPanel } from "@/components/stake/EthDefiMozogPanel";
import { LinkDefiMozogPanel } from "@/components/stake/LinkDefiMozogPanel";
import { SolDefiMozogPanel } from "@/components/stake/SolDefiMozogPanel";
import {
  DefiTokenSelector,
  type DefiTokenTab,
} from "@/components/stake/defiShared";

interface StakeDefiMozogSectionProps {
  onToast?: (message: string) => void;
}

export function StakeDefiMozogSection({ onToast }: StakeDefiMozogSectionProps) {
  const [activeToken, setActiveToken] = useState<DefiTokenTab>("ETH");

  return (
    <div className="space-y-4">
      <DefiTokenSelector active={activeToken} onChange={setActiveToken} />
      {activeToken === "ETH" ? (
        <EthDefiMozogPanel onToast={onToast} />
      ) : activeToken === "SOL" ? (
        <SolDefiMozogPanel onToast={onToast} />
      ) : (
        <LinkDefiMozogPanel onToast={onToast} />
      )}
    </div>
  );
}
