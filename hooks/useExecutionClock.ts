"use client";

import { useEffect, useState } from "react";
import { useExecutionStore } from "@/store/executionStore";

export function useExecutionClock(intervalMs = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  const expireDue = useExecutionStore((state) => state.expireDue);

  useEffect(() => {
    expireDue(Date.now());
    const id = window.setInterval(() => {
      const stamp = Date.now();
      setNow(stamp);
      expireDue(stamp);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [expireDue, intervalMs]);

  useEffect(() => {
    const unsub = useExecutionStore.persist.onFinishHydration(() => {
      expireDue(Date.now());
    });
    if (useExecutionStore.persist.hasHydrated()) expireDue(Date.now());
    return unsub;
  }, [expireDue]);

  return now;
}
