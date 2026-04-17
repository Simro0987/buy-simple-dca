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

/** DCA purchase record stored in localStorage */
export interface DcaPurchase {
  date: string;       // ISO date
  tokenId: string;
  quantity: number;
  priceUsd: number;
  totalUsd: number;
  type: 'market' | 'limit';
}

const PURCHASES_KEY = 'dca-purchases';

export function getDcaPurchases(): DcaPurchase[] {
  try {
    return JSON.parse(localStorage.getItem(PURCHASES_KEY) || '[]');
  } catch { return []; }
}

export function saveDcaPurchases(purchases: DcaPurchase[]) {
  localStorage.setItem(PURCHASES_KEY, JSON.stringify(purchases));
}

export function addDcaPurchase(purchase: Omit<DcaPurchase, 'date'>) {
  const all = getDcaPurchases();
  all.push({ ...purchase, date: new Date().toISOString() });
  saveDcaPurchases(all);

  // Auto-recalculate avg cost
  const tokenPurchases = all.filter(p => p.tokenId === purchase.tokenId);
  const totalQty = tokenPurchases.reduce((s, p) => s + p.quantity, 0);
  const totalCost = tokenPurchases.reduce((s, p) => s + p.totalUsd, 0);
  if (totalQty > 0) {
    const basis = getAvgCostBasis();
    basis[purchase.tokenId] = totalCost / totalQty;
    setAvgCostBasis(basis);
  }
}

/** Recalculate all avg costs from purchase history */
export function recalcAllAvgCosts(): Record<string, number> {
  const purchases = getDcaPurchases();
  const basis: Record<string, number> = {};
  const grouped: Record<string, DcaPurchase[]> = {};

  for (const p of purchases) {
    if (!grouped[p.tokenId]) grouped[p.tokenId] = [];
    grouped[p.tokenId].push(p);
  }

  for (const [tokenId, tPurchases] of Object.entries(grouped)) {
    const totalQty = tPurchases.reduce((s, p) => s + p.quantity, 0);
    const totalCost = tPurchases.reduce((s, p) => s + p.totalUsd, 0);
    if (totalQty > 0) basis[tokenId] = totalCost / totalQty;
  }

  setAvgCostBasis(basis);
  return basis;
}

/** Import cost basis from execution history (one-time migration) */
export function importFromExecutionHistory(prices: Record<string, { usd: number }>): number {
  const MIGRATED_KEY = 'dca-purchases-migrated';
  if (localStorage.getItem(MIGRATED_KEY)) return 0;

  try {
    const history = JSON.parse(localStorage.getItem('execution_history') || '[]');
    const budget = Number(localStorage.getItem('dca-budget') || '100');
    let imported = 0;

    for (const week of history) {
      if (!week.dcaExecuted) continue;

      for (const token of TOKENS) {
        const allocUsd = budget * token.allocation;
        const marketUsd = allocUsd * 0.60;
        const price = prices[token.coingeckoId]?.usd ?? 0;
        if (price <= 0) continue;

        // Market buy always executed with DCA
        addDcaPurchase({
          tokenId: token.id,
          quantity: marketUsd / price,
          priceUsd: price,
          totalUsd: marketUsd,
          type: 'market',
        });
        imported++;

        // Check if limit was filled
        const limit = week.limits?.find((l: any) => l.symbol === token.symbol);
        if (limit?.filled) {
          const limitUsd = allocUsd * 0.40;
          const limitPrice = limit.limitPrice || price * token.limitDiscount;
          addDcaPurchase({
            tokenId: token.id,
            quantity: limitUsd / limitPrice,
            priceUsd: limitPrice,
            totalUsd: limitUsd,
            type: 'limit',
          });
          imported++;
        }
      }
    }

    localStorage.setItem(MIGRATED_KEY, '1');
    return imported;
  } catch { return 0; }
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
