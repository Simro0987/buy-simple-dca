"use client";

import { useCallback, useEffect, useState } from "react";
import {
  evaluateMondayTiming,
  fetchMondayTimingIndicators,
  readMondayDeferUntil,
  type MondayTimingEvaluation,
} from "@/lib/smartMondayTiming";
import { GLOBAL_REFRESH_EVENT } from "@/lib/globalRefresh";

export function useSmartMondayTiming() {
  const [timing, setTiming] = useState<MondayTimingEvaluation | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const indicators = await fetchMondayTimingIndicators();
      const evaluation = evaluateMondayTiming(indicators, {
        deferredUntil: readMondayDeferUntil(),
      });
      setTiming(evaluation);
    } catch {
      setTiming(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onGlobalRefresh = () => {
      void refresh();
    };
    window.addEventListener(GLOBAL_REFRESH_EVENT, onGlobalRefresh);
    return () => window.removeEventListener(GLOBAL_REFRESH_EVENT, onGlobalRefresh);
  }, [refresh]);

  return {
    timing,
    loading,
    refresh,
    executionAllowed: timing?.isGreenLight !== false,
  };
}
