// BTC-ONLY Manual Override — 100 % týždenného kapitálu ide do Core (BTC),
// satelitný kôš je presne $0. Persistované v localStorage, cross-tab cez 'storage'.
import { useEffect, useState } from 'react';

const KEY = 'btc-only-override-v1';
const EVT = 'btc-only-override-change';

export function isBtcOnlyMode(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

export function setBtcOnlyMode(v: boolean): void {
  try {
    if (v) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch { /* noop */ }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: v })); } catch { /* noop */ }
}

export function useBtcOnlyMode(): readonly [boolean, (v: boolean) => void] {
  const [on, setOn] = useState<boolean>(isBtcOnlyMode);
  useEffect(() => {
    const handler = () => setOn(isBtcOnlyMode());
    window.addEventListener(EVT, handler as EventListener);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVT, handler as EventListener);
      window.removeEventListener('storage', handler);
    };
  }, []);
  return [on, setBtcOnlyMode] as const;
}
