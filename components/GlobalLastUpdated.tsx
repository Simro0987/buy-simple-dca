"use client";

import { RefreshCw } from "lucide-react";
import { formatGlobalLastUpdated } from "@/lib/globalRefresh";

interface GlobalLastUpdatedProps {
  lastUpdated: string | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function GlobalLastUpdated({
  lastUpdated,
  isRefreshing,
  onRefresh,
}: GlobalLastUpdatedProps) {
  const label = lastUpdated
    ? `Posledná aktualizácia: ${formatGlobalLastUpdated(lastUpdated)}`
    : "Synchronizácia dát…";

  return (
    <button
      type="button"
      onClick={onRefresh}
      disabled={isRefreshing}
      className="group flex w-full items-center gap-1.5 rounded-lg border border-transparent px-0 py-0.5 text-left transition-colors hover:border-white/5 hover:bg-white/[0.02] disabled:opacity-70"
      aria-label="Obnoviť živé dáta"
      title="Kliknutím obnovíte ceny, portfólio a DCA dáta"
    >
      <RefreshCw
        className={`h-3 w-3 shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-400 ${
          isRefreshing ? "animate-spin text-emerald-400/80" : ""
        }`}
        aria-hidden
      />
      <span className="text-[10px] font-medium leading-tight text-zinc-600 transition-colors group-hover:text-zinc-400">
        {label}
      </span>
    </button>
  );
}
