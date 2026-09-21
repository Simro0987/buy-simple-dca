"use client";

import { useEffect, useState } from "react";
import { useDcaStore } from "@/store/dcaStore";

export function useDcaHydrated() {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsub = useDcaStore.persist.onFinishHydration(() => setHydrated(true));
    if (useDcaStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  return hydrated;
}
