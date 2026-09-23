"use client";

import { create } from "zustand";

interface LiveClockState {
  lastUpdatedAt: number;
  connected: boolean;
  touch: (connected?: boolean) => void;
  setConnected: (connected: boolean) => void;
}

export const useLiveClockStore = create<LiveClockState>((set) => ({
  lastUpdatedAt: Date.now(),
  connected: false,
  touch: (connected) =>
    set((state) => ({
      lastUpdatedAt: Date.now(),
      connected: connected ?? state.connected,
    })),
  setConnected: (connected) => set({ connected }),
}));

export function formatLiveClock(ms: number): string {
  const date = new Date(ms);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
