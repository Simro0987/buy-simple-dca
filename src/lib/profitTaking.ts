import { TOKENS } from '@/lib/crypto';

export interface ProfitLevel {
  profitPct: number;   // e.g. 20 means +20%
  sellPct: number;     // e.g. 3 means sell 3%
  btcPct: number;      // % of proceeds to BTC (rest to stable)
}

export interface TokenProfitConfig {
  id: string;
  symbol: string;
  color: string;
  levels: ProfitLevel[];
}

export const PROFIT_CONFIGS: TokenProfitConfig[] = [
  {
    id: 'btc', symbol: 'BTC', color: '#F7931A',
    levels: [
      { profitPct: 20,  sellPct: 3,  btcPct: 70 },
      { profitPct: 35,  sellPct: 4,  btcPct: 70 },
      { profitPct: 50,  sellPct: 5,  btcPct: 70 },
      { profitPct: 80,  sellPct: 5,  btcPct: 70 },
      { profitPct: 120, sellPct: 5,  btcPct: 0 },
    ],
  },
  {
    id: 'eth', symbol: 'ETH', color: '#627EEA',
    levels: [
      { profitPct: 15,  sellPct: 5,  btcPct: 70 },
      { profitPct: 25,  sellPct: 7,  btcPct: 70 },
      { profitPct: 40,  sellPct: 8,  btcPct: 70 },
      { profitPct: 60,  sellPct: 10, btcPct: 70 },
      { profitPct: 100, sellPct: 10, btcPct: 70 },
    ],
  },
  {
    id: 'sol', symbol: 'SOL', color: '#9945FF',
    levels: [
      { profitPct: 15,  sellPct: 7,  btcPct: 70 },
      { profitPct: 25,  sellPct: 8,  btcPct: 70 },
      { profitPct: 40,  sellPct: 10, btcPct: 70 },
      { profitPct: 60,  sellPct: 12, btcPct: 70 },
      { profitPct: 100, sellPct: 12, btcPct: 70 },
    ],
  },
  {
    id: 'hype', symbol: 'HYPE', color: '#00D4AA',
    levels: [
      { profitPct: 15,  sellPct: 10, btcPct: 70 },
      { profitPct: 25,  sellPct: 12, btcPct: 70 },
      { profitPct: 40,  sellPct: 15, btcPct: 70 },
      { profitPct: 60,  sellPct: 15, btcPct: 70 },
      { profitPct: 100, sellPct: 20, btcPct: 70 },
    ],
  },
];

const EXECUTED_KEY = 'profit-levels-executed';

export interface ExecutedLevel {
  tokenId: string;
  profitPct: number;
  executedAt: string;
}

export function getExecutedLevels(): ExecutedLevel[] {
  try {
    return JSON.parse(localStorage.getItem(EXECUTED_KEY) || '[]');
  } catch { return []; }
}

export function markLevelExecuted(tokenId: string, profitPct: number) {
  const executed = getExecutedLevels();
  if (executed.some(e => e.tokenId === tokenId && e.profitPct === profitPct)) return;
  executed.push({ tokenId, profitPct, executedAt: new Date().toISOString() });
  localStorage.setItem(EXECUTED_KEY, JSON.stringify(executed));
}

export function isLevelExecuted(tokenId: string, profitPct: number): boolean {
  return getExecutedLevels().some(e => e.tokenId === tokenId && e.profitPct === profitPct);
}

export function getAvgCostBasis(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem('avg-cost-basis') || '{}');
  } catch { return {}; }
}

export function setAvgCostBasis(basis: Record<string, number>) {
  localStorage.setItem('avg-cost-basis', JSON.stringify(basis));
}

export function computeProfitPct(currentPrice: number, avgCost: number): number {
  if (avgCost <= 0) return 0;
  return ((currentPrice - avgCost) / avgCost) * 100;
}

export function getTotalSoldPct(tokenId: string): number {
  const executed = getExecutedLevels().filter(e => e.tokenId === tokenId);
  const config = PROFIT_CONFIGS.find(c => c.id === tokenId);
  if (!config) return 0;
  let total = 0;
  for (const ex of executed) {
    const level = config.levels.find(l => l.profitPct === ex.profitPct);
    if (level) total += level.sellPct;
  }
  return total;
}
