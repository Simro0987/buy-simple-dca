"use client";

import { useCallback, useEffect, useState } from "react";
import {
  evaluateMondayTiming,
  fetchMondayTimingIndicators,
  readMondayDeferUntil,
  type MondayTimingEvaluation,
} from "@/lib/smartMondayTiming";

const POLL_MS = 15 * 60_000;

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
    const interval = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  return {
    timing,
    loading,
    refresh,
    executionAllowed: timing?.isGreenLight !== false,
  };
}
