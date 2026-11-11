import { useCallback, useSyncExternalStore } from 'react';
import {
  HCD_ALCHEMIX_AUTONOMY_EVENT,
  loadAlchemixAutonomyState,
  type AlchemixAutonomyState,
} from '@/lib/hcdAlchemixAutonomy';

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener(HCD_ALCHEMIX_AUTONOMY_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(HCD_ALCHEMIX_AUTONOMY_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function useAlchemixAutonomy() {
  const state = useSyncExternalStore(
    subscribe,
    loadAlchemixAutonomyState,
    () => ({ locked: false, redistribution: null }),
  );

  const refresh = useCallback(() => loadAlchemixAutonomyState(), []);

  return { ...state, refresh };
}
