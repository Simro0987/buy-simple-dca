import { useState } from 'react';
import { RefreshCw, LogOut, ShieldCheck, ShieldAlert } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';
import { NetworkSwitcher } from '@/components/NetworkSwitcher';
import { EmergencyPauseButton } from '@/components/EmergencyPauseButton';
import { Label, Money } from '@/components/deep-space/primitives';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { syncNow, useDataSyncState } from '@/lib/dataSync';
import { formatShortAddress } from '@/lib/safeWalletGuard';
import { SafeGlobalConnectCard } from '@/components/wallet/SafeGlobalConnectCard';

interface AppHeaderProps {
  now: Date;
  totalValue: number;
  isFetching: boolean;
  onRefresh: () => void;
}

export function AppHeader({ now, totalValue, isFetching, onRefresh }: AppHeaderProps) {
  const { signOut, user, safeSession } = useAuth();
  const qc = useQueryClient();
  const { lastSyncAt, syncing } = useDataSyncState();
  const [showSafeDrawer, setShowSafeDrawer] = useState(false);

  const busy = isFetching || syncing;
  const syncLabel = syncing ? 'Synchronizujem…' : lastSyncAt
    ? `Ceny: ${new Date(lastSyncAt).toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' })}`
    : 'Načítavam...';

  return (
    <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#050505]/90 backdrop-blur-xl">
      <div className="max-w-lg mx-auto px-4 py-3 md:pl-[52px] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-sm font-black text-white truncate tracking-tight">
              Edge Trader Terminal
            </h1>
            <p className="text-[10px] text-white/35 font-mono mt-0.5 truncate">
              {now.toLocaleDateString('sk', { weekday: 'short', day: 'numeric', month: 'short' })}
              {' · '}
              {now.toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' })}
              {' · '}<span className={syncing ? 'text-amber-300/80' : 'text-emerald-300/70'}>{syncLabel}</span>
              {user?.email && <span className="text-white/25"> · {user.email}</span>}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Safe Global WalletConnect Badge — always accessible even when signed in via Email */}
            <button
              type="button"
              onClick={() => setShowSafeDrawer((v) => !v)}
              className={`px-2 py-1.5 rounded-xl border text-[10px] font-bold flex items-center gap-1 transition-all ${
                safeSession
                  ? 'border-[#12FF80]/40 bg-[#12FF80]/15 text-[#12FF80]'
                  : 'border-amber-400/35 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20'
              }`}
              title={
                safeSession
                  ? `Safe Global pripojené (${safeSession.safeAddress}) · Zodiac Guard aktívny`
                  : 'Pripoj Safe Global peňaženku cez WalletConnect (dostupné aj pri e-mail prihlásení)'
              }
            >
              {safeSession ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-mono">{formatShortAddress(safeSession.safeAddress)}</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                  <span>Safe WC</span>
                </>
              )}
            </button>

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

        {showSafeDrawer && (
          <div className="pt-1 pb-2 animate-in fade-in slide-in-from-top-1">
            <SafeGlobalConnectCard lang="sk" compact onConnected={() => setShowSafeDrawer(false)} />
          </div>
        )}

        <NetworkSwitcher />
      </div>
    </header>
  );
}
