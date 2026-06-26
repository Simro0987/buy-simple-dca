import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  hardResetCyborgEngineForStakeMount,
  initializeCyborgEngine,
  logCyborgDiagnostic,
} from '@/lib/cyborgEngine';

/**
 * Background-only HCD engine bootstrap. Never blocks Stake UI rendering.
 */
export function useCyborgBootstrap() {
  const queryClient = useQueryClient();
  const mountedRef = useRef(false);
  const [restartToken, setRestartToken] = useState(0);

  const runInitialize = useCallback(async (force: boolean) => {
    try {
      await initializeCyborgEngine(queryClient, { force });
    } catch (error) {
      logCyborgDiagnostic('useCyborgBootstrap: init swallowed (UI unaffected)', error);
    }
  }, [queryClient]);

  const restartEngine = useCallback(async () => {
    logCyborgDiagnostic('restartEngine: background cycle');
    setRestartToken(t => t + 1);
    hardResetCyborgEngineForStakeMount();
    await runInitialize(true);
  }, [runInitialize]);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    hardResetCyborgEngineForStakeMount();
    logCyborgDiagnostic('Background engine: async init (decoupled from UI)');
    void runInitialize(true);
  }, [runInitialize]);

  return { restartToken, restartEngine };
}
