import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ChainFilter = 'all' | 'eth' | 'btc' | 'sol';

interface ChainFilterContextValue {
  chain: ChainFilter;
  setChain: (c: ChainFilter) => void;
}

const ChainFilterContext = createContext<ChainFilterContextValue | undefined>(undefined);

const STORAGE_KEY = 'chain-filter';

export function ChainFilterProvider({ children }: { children: ReactNode }) {
  const [chain, setChainState] = useState<ChainFilter>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === 'all' || v === 'eth' || v === 'btc' || v === 'sol') return v;
    } catch { /* ignore */ }
    return 'all';
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, chain); } catch { /* ignore */ }
  }, [chain]);

  return (
    <ChainFilterContext.Provider value={{ chain, setChain: setChainState }}>
      {children}
    </ChainFilterContext.Provider>
  );
}

export function useChainFilter(): ChainFilterContextValue {
  const ctx = useContext(ChainFilterContext);
  if (!ctx) throw new Error('useChainFilter must be used within ChainFilterProvider');
  return ctx;
}

/** Map ChainFilter to token symbols that should be visible */
export function chainTokens(chain: ChainFilter): string[] {
  switch (chain) {
    case 'eth': return ['ETH'];
    case 'btc': return ['BTC'];
    case 'sol': return ['SOL'];
    case 'all': return ['BTC', 'ETH', 'SOL', 'HYPE'];
  }
}

/** Test if a token symbol passes the current chain filter */
export function passesChainFilter(symbol: string, chain: ChainFilter): boolean {
  if (chain === 'all') return true;
  return chainTokens(chain).includes(symbol.toUpperCase());
}
