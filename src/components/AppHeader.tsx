import { RefreshCw } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';
import { NetworkSwitcher } from '@/components/NetworkSwitcher';
import { EmergencyPauseButton } from '@/components/EmergencyPauseButton';

interface AppHeaderProps {
  now: Date;
  totalValue: number;
  isFetching: boolean;
  onRefresh: () => void;
}

export function AppHeader({ now, totalValue, isFetching, onRefresh }: AppHeaderProps) {
  return (
    <header
      className="sticky top-0 z-30 border-b"
      style={{
        background: 'rgba(11,14,20,0.92)',
        borderBottomColor: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      <div className="max-w-lg mx-auto px-4 py-2 md:pl-[52px] space-y-2">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate tracking-tight">Edge Trader Terminal</h1>
            <p className="text-[10px] text-muted-foreground font-mono">
              {now.toLocaleDateString('sk', { weekday: 'short', day: 'numeric', month: 'short' })} · {now.toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Portfólio</p>
              <p className="text-sm font-bold text-foreground tabular-nums">{totalValue > 0 ? formatUsd(totalValue) : '—'}</p>
            </div>
            <EmergencyPauseButton />
            <button
              onClick={onRefresh}
              disabled={isFetching}
              aria-label="Obnoviť ceny"
              className="p-1.5 rounded border transition-colors"
              style={{ borderColor: 'rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)' }}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        <NetworkSwitcher />
      </div>
    </header>
  );
}
