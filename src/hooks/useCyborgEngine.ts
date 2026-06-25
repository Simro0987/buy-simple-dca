import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  CYBORG_ENGINE_EVENT,
  getCyborgEngineState,
  initializeCyborgEngine,
  logCyborgDiagnostic,
  markCyborgEngineRestart,
  resetCyborgEngineToIdle,
  type CyborgEnginePhase,
} from '@/lib/cyborgEngine';

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener(CYBORG_ENGINE_EVENT, handler);
  return () => window.removeEventListener(CYBORG_ENGINE_EVENT, handler);
}

interface Options {
  onMarketRefresh?: () => void | Promise<void>;
}

export function useCyborgEngine(opts: Options = {}) {
  const queryClient = useQueryClient();
  const engineState = useSyncExternalStore(subscribe, getCyborgEngineState, () => getCyborgEngineState());
  const mountedRef = useRef(false);
  const recoveringRef = useRef(false);
  const [restartToken, setRestartToken] = useState(0);
  const onMarketRefresh = opts.onMarketRefresh;

  const runInitialize = useCallback(async (force: boolean) => {
    await initializeCyborgEngine(queryClient, {
      force,
      onMarketRefresh,
    });
  }, [queryClient, onMarketRefresh]);

  const restartEngine = useCallback(async () => {
    const count = markCyborgEngineRestart();
    logCyborgDiagnostic('restartEngine: full cycle', { restartCount: count });
    setRestartToken(t => t + 1);
    resetCyborgEngineToIdle();
    try {
      await runInitialize(true);
    } catch {
      /* phase + diagnostics already set in initializeCyborgEngine */
    }
  }, [runInitialize]);

  // Force reload on first Stake mount — ignore cached engine phase.
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    logCyborgDiagnostic('Stake mount: forcing fetchPortfolioData + initializeCyborgEngine');
    resetCyborgEngineToIdle();
    void runInitialize(true);
  }, [runInitialize]);

  // Auto-recover from error/fallback deadlock → idle → re-init.
  useEffect(() => {
    const { phase } = engineState;
    if (phase !== 'error' && phase !== 'fallback') {
      recoveringRef.current = false;
      return;
    }
    if (recoveringRef.current) return;

    recoveringRef.current = true;
    logCyborgDiagnostic(`auto-recovery scheduled from ${phase}`);
    const timer = window.setTimeout(() => {
      recoveringRef.current = false;
      void restartEngine();
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [engineState.phase, engineState.restartCount, restartEngine]);

  return {
    enginePhase: engineState.phase as CyborgEnginePhase,
    engineError: engineState.lastError,
    restartToken,
    restartEngine,
  };
}
