"use client";

import Image from "next/image";
import type { PortfolioTokenRef } from "@/lib/newsTokenFilter";

interface TokenBadgeProps {
  token: PortfolioTokenRef;
  size?: number;
}

export function TokenBadge({ token, size = 20 }: TokenBadgeProps) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 pl-0.5 pr-2 py-0.5"
      title={token.name}
    >
      <span
        className="relative shrink-0 overflow-hidden rounded-full ring-1 ring-white/10"
        style={{ width: size, height: size }}
      >
        {token.logoUrl ? (
          <Image
            src={token.logoUrl}
            alt={token.symbol}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-zinc-800 text-[8px] font-bold text-white">
            {token.symbol.slice(0, 1)}
          </span>
        )}
      </span>
      <span className="text-[9px] font-bold uppercase tracking-wide text-zinc-300">
        {token.symbol}
      </span>
    </span>
  );
}

interface TokenBadgeListProps {
  tokens: PortfolioTokenRef[];
  max?: number;
}

export function TokenBadgeList({ tokens, max = 3 }: TokenBadgeListProps) {
  const visible = tokens.slice(0, max);
  const overflow = tokens.length - visible.length;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visible.map((token) => (
        <TokenBadge key={token.symbol} token={token} />
      ))}
      {overflow > 0 && (
        <span className="text-[9px] font-semibold text-zinc-500">
          +{overflow}
        </span>
      )}
    </div>
  );
}
