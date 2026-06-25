import type { QueryClient } from '@tanstack/react-query';
import { clearApiCache } from '@/lib/apiCache';

export type CyborgEnginePhase = 'idle' | 'loading' | 'ready' | 'error' | 'fallback';

export interface CyborgEngineState {
  phase: CyborgEnginePhase;
  lastError: string | null;
  lastInitAt: number | null;
  restartCount: number;
  forceReload: boolean;
}

export const CYBORG_ENGINE_EVENT = 'cyborg-engine-changed';

const DIAG_PREFIX = '[CyborgEngine]';

let engineState: CyborgEngineState = {
  phase: 'idle',
  lastError: null,
  lastInitAt: null,
  restartCount: 0,
  forceReload: true,
};

function emitEngineChange(): void {
  try {
    window.dispatchEvent(new CustomEvent(CYBORG_ENGINE_EVENT));
  } catch { /* SSR */ }
}

export function logCyborgDiagnostic(message: string, detail?: unknown): void {
  const line = `${DIAG_PREFIX} ${message}`;
  const isFailure = /fail|error|timeout|fallback/i.test(message);
  if (isFailure) {
    if (detail !== undefined) console.warn(line, detail);
    else console.warn(line);
  } else if (detail !== undefined) {
    console.log(line, detail);
  } else {
    console.log(line);
  }
}

export function diagnoseCyborgFailure(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('api key') || msg.includes('apikey')) return 'Missing API key';
    if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('abort')) {
      return 'Blockchain timeout';
    }
    if (msg.includes('network') || msg.includes('fetch') || msg.includes('cors')) {
      return 'Network fetch failed';
    }
    if (msg.includes('unauthorized') || msg.includes('401')) return 'API unauthorized';
    return error.message;
  }
  if (typeof error === 'string') return error;
  return 'Unknown initialization error';
}

export function getCyborgEngineState(): CyborgEngineState {
  return { ...engineState };
}

export function hardResetCyborgEngineForStakeMount(): void {
  engineState = {
    phase: 'idle',
    lastError: null,
    lastInitAt: null,
    restartCount: 0,
    forceReload: true,
  };
  logCyborgDiagnostic('Stake mount: hard reset — cleared error/fallback state');
  emitEngineChange();
}

export function resetCyborgEngineToIdle(): void {
  engineState = {
    ...engineState,
    phase: 'idle',
    lastError: null,
    forceReload: true,
  };
  logCyborgDiagnostic('reset to Idle');
  emitEngineChange();
}

export function setCyborgEnginePhase(phase: CyborgEnginePhase, errorReason?: string | null): void {
  engineState = {
    ...engineState,
    phase,
    lastError: errorReason ?? (phase === 'error' || phase === 'fallback' ? engineState.lastError : null),
    lastInitAt: phase === 'ready' ? Date.now() : engineState.lastInitAt,
  };
  if (errorReason) {
    logCyborgDiagnostic(`phase=${phase}: ${errorReason}`);
  } else {
    logCyborgDiagnostic(`phase=${phase}`);
  }
  emitEngineChange();
}

export function markCyborgEngineRestart(): number {
  engineState = {
    ...engineState,
    restartCount: engineState.restartCount + 1,
    forceReload: true,
    phase: 'idle',
    lastError: null,
  };
  emitEngineChange();
  return engineState.restartCount;
}

const PORTFOLIO_QUERY_KEYS = [
  ['crypto-prices'],
  ['fear-greed'],
  ['dca_purchases'],
  ['capital_entries'],
  ['app_settings'],
  ['hcd-live-indicators'],
  ['defi-apys-v2'],
] as const;

/** Force-refresh portfolio + market inputs — no stale cache on Stake mount. */
export async function fetchPortfolioData(
  queryClient: QueryClient,
  force = true,
): Promise<void> {
  logCyborgDiagnostic('fetchPortfolioData: start', { force });

  if (force) {
    clearApiCache('cyborg');
    clearApiCache();
  }

  const results = await Promise.allSettled(
    PORTFOLIO_QUERY_KEYS.flatMap(key => [
      queryClient.invalidateQueries({ queryKey: [...key] }),
      queryClient.refetchQueries({ queryKey: [...key], type: 'active' }),
    ]),
  );

  const failures = results
    .map((result, index) => ({ result, index }))
    .filter(entry => entry.result.status === 'rejected')
    .map(entry => diagnoseCyborgFailure((entry.result as PromiseRejectedResult).reason));

  if (failures.length > 0) {
    const reason = failures[0] ?? 'Portfolio data refresh failed';
    logCyborgDiagnostic(`fetchPortfolioData: partial failure — ${reason}`, failures);
    throw new Error(reason);
  }

  logCyborgDiagnostic('fetchPortfolioData: complete');
}

export interface InitializeCyborgEngineOptions {
  force?: boolean;
  onMarketRefresh?: () => void | Promise<void>;
}

/** Boot HCD autonomous engine — always attempts fresh portfolio load when force=true. */
export async function initializeCyborgEngine(
  queryClient: QueryClient,
  opts: InitializeCyborgEngineOptions = {},
): Promise<void> {
  const force = opts.force ?? engineState.forceReload;

  try {
    setCyborgEnginePhase('loading');
    logCyborgDiagnostic('initializeCyborgEngine: start', { force, restartCount: engineState.restartCount });

    await fetchPortfolioData(queryClient, force);

    if (opts.onMarketRefresh) {
      try {
        await opts.onMarketRefresh();
      } catch (error) {
        const reason = diagnoseCyborgFailure(error);
        logCyborgDiagnostic(`market refresh failed — ${reason}`, error);
      }
    }

    engineState = { ...engineState, forceReload: false };
    setCyborgEnginePhase('ready');
    logCyborgDiagnostic('initializeCyborgEngine: ready');
  } catch (error) {
    const reason = diagnoseCyborgFailure(error);
    logCyborgDiagnostic(`initializeCyborgEngine failed (background) — ${reason}`, error);
    setCyborgEnginePhase('idle');
  }
}

export function reportSilentTrackerFailure(error: unknown): void {
  const reason = diagnoseCyborgFailure(error);
  logCyborgDiagnostic(`SilentTracker background failure — ${reason}`, error);
  // UI is decoupled — never persist error/fallback phase for rendering.
  if (engineState.phase !== 'ready') {
    setCyborgEnginePhase('idle');
  }
}

export function reportSilentTrackerSuccess(): void {
  if (engineState.phase === 'loading') {
    setCyborgEnginePhase('ready');
  }
}
