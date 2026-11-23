import { useCallback, useEffect, useState } from 'react';
import { Server, RefreshCw, ShieldCheck, ShieldAlert, PauseCircle } from 'lucide-react';
import { runtimeEnv } from '@/lib/runtimeConfig';
import { formatShortAddress } from '@/lib/safeWalletGuard';

/**
 * Read-only view of the server-side agent runner (second Flux component).
 * The browser never sees agent keys; it only GETs the public, secret-free /status JSON.
 */
interface RunnerTrade {
  at: string;
  agentId: string;
  status: string;
  reason: string;
  usd?: number;
  txHash?: string;
}
interface RunnerAgent {
  id: string;
  name: string;
  enabled: boolean;
  strategy: string;
  agentAddress: string | null;
  module: string;
  amountUsd: number;
  intervalMinutes: number;
  preflight: { ok: boolean; problems?: string[] } | null;
  nextRunAt?: string;
  lastResult?: RunnerTrade;
  totals: { runs: number; trades: number; usdBought: number };
}
export interface RunnerStatus {
  network: string;
  chainId: number;
  testnet: boolean;
  dryRun: boolean;
  killSwitch: boolean;
  safe: string;
  agents: RunnerAgent[];
  trades: RunnerTrade[];
}

function agentStatusUrl(): string {
  return runtimeEnv('VITE_AGENT_STATUS_URL') || './agent-api/status';
}

export function AgentRunnerStatusCard({ lang }: { lang: 'sk' | 'en' | string }) {
  const sk = lang === 'sk';
  const [data, setData] = useState<RunnerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(agentStatusUrl(), { headers: { Accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // On hosts without the runner (e.g. a static mirror) the SPA fallback returns index.html.
      if (!(res.headers.get('content-type') ?? '').includes('application/json')) throw new Error('not configured');
      const json = (await res.json()) as RunnerStatus;
      if (!json || !Array.isArray(json.agents)) throw new Error('unexpected response');
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-[#14F195]" />
          <h2 className="text-sm font-semibold">
            {sk ? 'Serverový agent runner (Flux)' : 'Server agent runner (Flux)'}
          </h2>
        </div>
        <button type="button" onClick={() => void load()} className="text-muted-foreground hover:text-foreground" aria-label="refresh">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && !data && (
        <p className="text-[11px] text-muted-foreground">
          {sk
            ? `Runner nie je dostupný (${error}). Na Flux pridaj komponent "runner" a nastav AGENT_STATUS_UPSTREAM vo web komponente.`
            : `Runner not reachable (${error}). Add the "runner" Flux component and set AGENT_STATUS_UPSTREAM on the web component.`}
        </p>
      )}

      {data && (
        <>
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            <span className={`px-1.5 py-0.5 rounded border ${data.testnet ? 'border-sky-500/40 text-sky-400' : 'border-red-500/50 text-red-400'}`}>
              {data.network} {data.testnet ? '(testnet)' : '(MAINNET)'}
            </span>
            <span className={`px-1.5 py-0.5 rounded border ${data.dryRun ? 'border-amber-500/40 text-amber-400' : 'border-[#14F195]/40 text-[#14F195]'}`}>
              {data.dryRun ? (sk ? 'DRY-RUN (bez obchodov)' : 'DRY-RUN (no trades)') : (sk ? 'LIVE obchodovanie' : 'LIVE trading')}
            </span>
            {data.killSwitch && (
              <span className="px-1.5 py-0.5 rounded border border-red-500/50 text-red-400 inline-flex items-center gap-1">
                <PauseCircle className="w-3 h-3" /> KILL SWITCH
              </span>
            )}
            <span className="px-1.5 py-0.5 rounded border border-border text-muted-foreground">Safe {formatShortAddress(data.safe)}</span>
          </div>

          <ul className="space-y-1.5">
            {data.agents.map((a) => (
              <li key={a.id} className="rounded-lg border border-border/60 p-2 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {a.name} <span className="text-muted-foreground">· {a.strategy} · ${a.amountUsd}</span>
                  </span>
                  {a.preflight?.ok ? (
                    <ShieldCheck className="w-4 h-4 text-[#14F195]" />
                  ) : (
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                  )}
                </div>
                <div className="text-muted-foreground">
                  {sk ? 'Agent' : 'Agent'} {a.agentAddress ? formatShortAddress(a.agentAddress) : '—'} · {sk ? 'modul' : 'module'} {formatShortAddress(a.module)}
                  {!a.enabled && (sk ? ' · vypnutý' : ' · disabled')}
                </div>
                {a.preflight && !a.preflight.ok && a.preflight.problems?.length ? (
                  <div className="text-amber-400">{a.preflight.problems.join('; ')}</div>
                ) : null}
                <div className="text-muted-foreground">
                  {sk ? 'Obchody' : 'Trades'}: {a.totals.trades} · ${a.totals.usdBought.toFixed(2)}
                  {a.nextRunAt && ` · ${sk ? 'ďalší' : 'next'}: ${new Date(a.nextRunAt).toLocaleString()}`}
                </div>
                {a.lastResult && (
                  <div className="text-muted-foreground truncate">
                    {sk ? 'Posledné' : 'Last'}: {a.lastResult.status} — {a.lastResult.reason}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[10px] text-muted-foreground">
            {sk
              ? 'Len na čítanie. Agent môže iba swapovať cez AgentSwapModule naspäť do tvojho Safe — výber na inú adresu je nemožný.'
              : 'Read-only. The agent can only swap via AgentSwapModule back into your Safe — withdrawals elsewhere are impossible.'}
          </p>
        </>
      )}
    </div>
  );
}
