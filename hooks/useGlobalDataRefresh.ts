"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  dispatchGlobalRefresh,
  GLOBAL_REFRESH_MS,
  runGlobalRefreshHandlers,
} from "@/lib/globalRefresh";
import { useAppStore } from "@/src/store/useAppStore";

export function useGlobalDataRefresh() {
  const queryClient = useQueryClient();
  const setGlobalRefreshing = useAppStore((state) => state.setGlobalRefreshing);
  const touchGlobalLastUpdated = useAppStore(
    (state) => state.touchGlobalLastUpdated,
  );
  const isRefreshing = useAppStore((state) => state.globalRefresh.isRefreshing);
  const lastUpdated = useAppStore((state) => state.globalRefresh.lastUpdated);

  const refresh = useCallback(async () => {
    setGlobalRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["market-data"] });
      await runGlobalRefreshHandlers();
      dispatchGlobalRefresh();
      touchGlobalLastUpdated();
    } finally {
      setGlobalRefreshing(false);
    }
  }, [queryClient, setGlobalRefreshing, touchGlobalLastUpdated]);

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const tick = () => {
      void refreshRef.current();
    };
    void tick();
    const interval = setInterval(tick, GLOBAL_REFRESH_MS);
    return () => clearInterval(interval);
  }, []);

  return {
    refresh,
    isRefreshing,
    lastUpdated,
  };
}
