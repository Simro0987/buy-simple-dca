// Global Safety Switch — pauses all DCA execution (Market = 0%, blocks Limits, freezes engine).
// State persisted to localStorage so it survives refresh / cross-tab via 'storage' event.
import { useEffect, useState } from 'react';

const KEY = 'emergency-pause-v1';
const EVT = 'emergency-pause-change';

export function isEmergencyPaused(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setEmergencyPaused(v: boolean): void {
  try {
    if (v) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* noop */ }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: v })); } catch { /* noop */ }
}

export function useEmergencyPause(): readonly [boolean, (v: boolean) => void] {
  const [paused, setP] = useState<boolean>(isEmergencyPaused);
  useEffect(() => {
    const handler = () => setP(isEmergencyPaused());
    window.addEventListener(EVT, handler as EventListener);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVT, handler as EventListener);
      window.removeEventListener('storage', handler);
    };
  }, []);
  return [paused, setEmergencyPaused] as const;
}
