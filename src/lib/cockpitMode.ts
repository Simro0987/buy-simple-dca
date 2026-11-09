// Kokpit Režim — globálny prepínač pre prísne reštrikcie v Swap module.
// Keď je VYPNUTÝ, swap sa správa ako bežné verejné rozhranie bez backend
// reštrikcií ($5 gas cap, cross-chain deficit buffer, atď.).
// Keď je ZAPNUTÝ, všetky pokročilé filtre a obmedzenia sú vynútené.

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'cockpit-mode-v1';
const EVENT = 'cockpit-mode-changed';

export function isCockpitModeEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setCockpitMode(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    /* noop */
  }
}

export function useCockpitMode(): [boolean, (v: boolean) => void] {
  const [enabled, setEnabled] = useState<boolean>(() => isCockpitModeEnabled());
  useEffect(() => {
    const handler = () => setEnabled(isCockpitModeEnabled());
    window.addEventListener(EVENT, handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener(EVENT, handler);
      window.removeEventListener('storage', handler);
    };
  }, []);
  const update = (v: boolean) => {
    setCockpitMode(v);
    setEnabled(v);
  };
  return [enabled, update];
}
