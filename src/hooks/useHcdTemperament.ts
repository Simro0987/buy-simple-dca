import { useCallback, useSyncExternalStore } from 'react';
import {
  DEFAULT_HCD_TEMPERAMENT,
  HCD_TEMPERAMENT_EVENT,
  loadHcdTemperament,
  saveHcdTemperament,
} from '@/lib/hcdTemperament';

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener(HCD_TEMPERAMENT_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(HCD_TEMPERAMENT_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function useHcdTemperament() {
  const temperamentPct = useSyncExternalStore(
    subscribe,
    () => loadHcdTemperament(),
    () => DEFAULT_HCD_TEMPERAMENT,
  );

  const setTemperamentPct = useCallback((value: number) => {
    saveHcdTemperament(value);
  }, []);

  return { temperamentPct, setTemperamentPct };
}
