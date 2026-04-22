import { useChainFilter, ChainFilter } from '@/hooks/useChainFilter';

const OPTIONS: { id: ChainFilter; label: string; color: string }[] = [
  { id: 'all', label: 'Všetko', color: 'hsl(var(--primary))' },
  { id: 'btc', label: 'BTC', color: '#f7931a' },
  { id: 'eth', label: 'ETH', color: '#627eea' },
  { id: 'sol', label: 'SOL', color: '#14f195' },
];

export function NetworkSwitcher() {
  const { chain, setChain } = useChainFilter();
  return (
    <div className="flex items-center gap-1 bg-secondary/60 rounded-lg p-0.5">
      {OPTIONS.map(opt => {
        const active = chain === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setChain(opt.id)}
            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-all ${
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
            style={active ? { borderBottom: `2px solid ${opt.color}` } : undefined}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
