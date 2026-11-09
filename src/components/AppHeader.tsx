import { RefreshCw, LogOut } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';
import { NetworkSwitcher } from '@/components/NetworkSwitcher';
import { EmergencyPauseButton } from '@/components/EmergencyPauseButton';
import { Label, Money } from '@/components/deep-space/primitives';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { syncNow, useDataSyncState } from '@/lib/dataSync';

interface AppHeaderProps {
  now: Date;
  totalValue: number;
  isFetching: boolean;
  onRefresh: () => void;
}

export function AppHeader({ now, totalValue, isFetching, onRefresh }: AppHeaderProps) {
  const { signOut, user } = useAuth();
  const qc = useQueryClient();
  const { lastSyncAt, syncing } = useDataSyncState();
  const busy = isFetching || syncing;
  const syncLabel = syncing ? 'Synchronizujem…' : lastSyncAt
    ? `Ceny: ${new Date(lastSyncAt).toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' })}`
    : 'Načítavam...';
  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#050505]/90 backdrop-blur-xl">
      <div className="max-w-lg mx-auto px-4 py-3 md:pl-[52px] space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-sm font-black text-white truncate tracking-tight">
              Edge Trader Terminal
            </h1>
            <p className="text-[10px] text-white/35 font-mono mt-0.5">
              {now.toLocaleDateString('sk', { weekday: 'short', day: 'numeric', month: 'short' })}
              {' · '}
              {now.toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' })}
              {' · '}<span className={syncing ? 'text-amber-300/80' : 'text-emerald-300/70'}>{syncLabel}</span>
              {user?.email && <span className="text-white/25"> · {user.email}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <Label className="!text-[9px]">Portfólio</Label>
              <Money size="sm" className="!text-base block">
                {totalValue > 0 ? formatUsd(totalValue) : '—'}
              </Money>
            </div>
            <EmergencyPauseButton />
            <button
              onClick={() => { onRefresh(); void syncNow(qc); }}
              disabled={busy}
              aria-label="Obnoviť teraz"
              title="Obnoviť teraz"
              className="p-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-white/50 ${busy ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => void signOut()}
              aria-label="Odhlásiť"
              className="p-2 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-white/50" />
            </button>
          </div>
        </div>
        <NetworkSwitcher />
      </div>
    </header>
  );
}
