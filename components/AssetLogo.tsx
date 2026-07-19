"use client";

import Image from "next/image";
import { useState } from "react";
import { getCategoryStyles } from "@/lib/assetStyles";
import type { AssetCategory } from "@/lib/portfolioStorage";

const LOCAL_ICON_FALLBACKS: Record<string, string> = {
  MORPHO: "/icons/morpho.svg",
};

interface AssetLogoProps {
  symbol: string;
  name: string;
  logoUrl?: string;
  category?: AssetCategory;
  size?: number;
  className?: string;
}

export function AssetLogo({
  symbol,
  name,
  logoUrl,
  category = "yield",
  size = 44,
  className = "",
}: AssetLogoProps) {
  const [failed, setFailed] = useState(false);
  const styles = getCategoryStyles(category);
  const localFallback = LOCAL_ICON_FALLBACKS[symbol.toUpperCase()];
  const src = failed ? localFallback : logoUrl || localFallback;

  if (!src || failed && !localFallback) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-full ring-2 ${styles.ring} ${styles.bg} ${className}`}
        style={{ width: size, height: size }}
      >
        <span
          className="font-bold text-white"
          style={{ fontSize: Math.max(10, size * 0.32) }}
        >
          {symbol.slice(0, 2)}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ring-2 ring-white/10 ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={name}
        fill
        className="object-cover"
        unoptimized
        onError={() => setFailed(true)}
      />
    </div>
  );
}
