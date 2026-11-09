import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuditEntry { ts: number; action: string; protocol: string; network: string; amount: number; symbol: string }

export const useAuditLog = create<{ entries: AuditEntry[]; add: (e: Omit<AuditEntry, 'ts'>) => void; clear: () => void }>()(
  persist(
    (set) => ({
      entries: [],
      add: (e) => set((s) => ({ entries: [{ ...e, ts: Date.now() }, ...s.entries].slice(0, 200) })),
      clear: () => set({ entries: [] }),
    }),
    { name: 'defi-audit-log' },
  ),
);
