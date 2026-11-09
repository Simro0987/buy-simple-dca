// Yield Tokens — 3rd pillar of Master Dynamic Allocation.
// Zdieľajú rovnakú matematiku ako BTC/ETH/SOL, len sú v samostatnom type-namespace,
// pretože backend (dca-execute, dca_executions, wallet-balance-*) ich nevie.

export type YieldNetwork = 'ARB' | 'SOL' | 'HYPERLIQUID';

export interface YieldToken {
  id: string;                 // interná stabilná ID
  symbol: string;             // display
  coingeckoId: string;        // pre CoinGecko proxy
  network: YieldNetwork;      // sieťový tag
  /** Fundamentálne skóre 0..100 — reálne protokolové poplatky / revenue kvalita. */
  fundamentalYield: number;
  /** Krátky dôvod pre UI (prečo tento fundamentálny rating). */
  fundamentalNote: string;
}

export const YIELD_TOKENS: YieldToken[] = [
  { id: 'link',   symbol: 'LINK',   coingeckoId: 'chainlink',                network: 'ARB',         fundamentalYield: 75, fundamentalNote: 'Oracle fees + CCIP revenue' },
  { id: 'hype',   symbol: 'HYPE',   coingeckoId: 'hyperliquid',              network: 'HYPERLIQUID', fundamentalYield: 82, fundamentalNote: 'Perp DEX fees → buyback' },
  
  { id: 'aave',   symbol: 'AAVE',   coingeckoId: 'aave',                     network: 'ARB',         fundamentalYield: 85, fundamentalNote: 'Lending fees + safety module' },
];

export const NETWORK_STYLE: Record<YieldNetwork, { label: string; chip: string }> = {
  ARB:         { label: 'ARB',  chip: 'bg-sky-500/15 text-sky-300 border-sky-500/40' },
  SOL:         { label: 'SOL',  chip: 'bg-violet-500/15 text-violet-300 border-violet-500/40' },
  HYPERLIQUID: { label: 'HYPE', chip: 'bg-teal-500/15 text-teal-300 border-teal-500/40' },
};
