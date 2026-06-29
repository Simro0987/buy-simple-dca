import { useCallback, useSyncExternalStore } from 'react';
import {
  loadSupplyOnlyMode,
  saveSupplyOnlyMode,
  SUPPLY_ONLY_MODE_EVENT,
} from '@/lib/supplyOnlyMode';

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener(SUPPLY_ONLY_MODE_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(SUPPLY_ONLY_MODE_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function useSupplyOnlyMode() {
  const supplyOnlyMode = useSyncExternalStore(
    subscribe,
    () => loadSupplyOnlyMode(),
    () => false,
  );

  const setSupplyOnlyMode = useCallback((enabled: boolean) => {
    saveSupplyOnlyMode(enabled);
  }, []);

  return { supplyOnlyMode, setSupplyOnlyMode };
}
