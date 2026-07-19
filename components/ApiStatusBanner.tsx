"use client";

import { useApiStatus } from "@/src/store/useAppStore";

export function ApiStatusBanner() {
  const apiStatus = useApiStatus();
  const degraded =
    apiStatus.prices.degraded ||
    apiStatus.news.degraded ||
    apiStatus.dca.degraded;

  if (!degraded) return null;

  return (
    <div className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-center text-[11px] text-amber-300">
      API Degraded — používame záložné zdroje (
      {apiStatus.prices.source}
      {apiStatus.prices.degraded ? " · ceny" : ""}
      {apiStatus.news.degraded ? " · novinky" : ""}
      {apiStatus.dca.degraded ? " · DCA" : ""})
    </div>
  );
}
