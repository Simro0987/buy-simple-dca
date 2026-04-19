import { RefreshCw } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';

interface AppHeaderProps {
  now: Date;
  totalValue: number;
  isFetching: boolean;
  onRefresh: () => void;
}

export function AppHeader({ now, totalValue, isFetching, onRefresh }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-sm font-bold text-foreground truncate">Môj Crypto Dashboard</h1>
          <p className="text-[10px] text-muted-foreground">
            {now.toLocaleDateString('sk', { weekday: 'short', day: 'numeric', month: 'short' })} · {now.toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Portfólio</p>
            <p className="text-sm font-bold text-foreground">{totalValue > 0 ? formatUsd(totalValue) : '—'}</p>
          </div>
          <button
            onClick={onRefresh}
            disabled={isFetching}
            aria-label="Obnoviť ceny"
            className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
}
