import { TOKENS } from '@/lib/crypto';
import {
  computePortfolioTotalValue,
  livePricesFromMap,
} from '@/lib/portfolioTotalValue';

export type PortfolioSymbol = 'BTC' | 'ETH' | 'SOL';

export interface UserHoldingRow {
  tokenAmount: number;
  averageBuyPrice: number;
  investedUsd: number;
}

export type UserHoldings = Record<PortfolioSymbol, UserHoldingRow>;

export interface LiveHoldingMetric {
  symbol: PortfolioSymbol;
  coingeckoId: string;
  holdings: number;
  avgBuyPrice: number;
  invested: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPct: number;
  actualPct: number;
  targetPct: number;
  deviationPct: number;
}

export interface PortfolioDashboardMetrics {
  assets: LiveHoldingMetric[];
  totalValue: number;
  totalInvested: number;
  totalPnl: number;
  totalPnlPct: number;
}

export const PORTFOLIO_REAL_HOLDINGS_KEY = 'portfolio_real_holdings';
export const PORTFOLIO_HOLDINGS_UPDATED_EVENT = 'portfolio-holdings-updated';

/** Legacy key — no longer written; cleared on first load. */
const LEGACY_HOLDINGS_KEY = 'smart-alloc-holdings';

export type HoldingsRecord = Partial<Record<'btc' | 'eth' | 'sol', number>>;

const COIN_KEY_TO_SYMBOL: Record<'btc' | 'eth' | 'sol', PortfolioSymbol> = {
  btc: 'BTC',
  eth: 'ETH',
  sol: 'SOL',
};

export function coinKeyToSymbol(key: 'btc' | 'eth' | 'sol'): PortfolioSymbol {
  return COIN_KEY_TO_SYMBOL[key];
}

export function holdingsRecordFromUserHoldings(holdings: UserHoldings): HoldingsRecord {
  return {
    btc: holdings.BTC.tokenAmount,
    eth: holdings.ETH.tokenAmount,
    sol: holdings.SOL.tokenAmount,
  };
}

export function investedRecordFromUserHoldings(holdings: UserHoldings): HoldingsRecord {
  return {
    btc: holdings.BTC.investedUsd,
    eth: holdings.ETH.investedUsd,
    sol: holdings.SOL.investedUsd,
  };
}

/** One-time cleanup: drop legacy mock storage so balances stay at zero until user input. */
function clearLegacyHoldingsStorage(): void {
  try {
    localStorage.removeItem(LEGACY_HOLDINGS_KEY);
  } catch {
    /* quota */
  }
}

let legacyCleared = false;
function ensureLegacyCleared(): void {
  if (legacyCleared) return;
  legacyCleared = true;
  clearLegacyHoldingsStorage();
}

export function loadHoldingsRecord(): HoldingsRecord {
  ensureLegacyCleared();
  return holdingsRecordFromUserHoldings(loadUserHoldings());
}

export function dispatchHoldingsUpdated(): void {
  window.dispatchEvent(new Event(PORTFOLIO_HOLDINGS_UPDATED_EVENT));
  window.dispatchEvent(new Event('portfolio-updated'));
}

export function saveUserHoldings(holdings: UserHoldings): void {
  localStorage.setItem(PORTFOLIO_REAL_HOLDINGS_KEY, JSON.stringify(holdings));
  dispatchHoldingsUpdated();
}

/** Update token amounts only (preserves cost basis fields). */
export function saveHoldingsRecord(record: HoldingsRecord): void {
  const current = loadUserHoldings();
  const next: UserHoldings = {
    BTC: { ...current.BTC, tokenAmount: Number(record.btc ?? 0) || 0 },
    ETH: { ...current.ETH, tokenAmount: Number(record.eth ?? 0) || 0 },
    SOL: { ...current.SOL, tokenAmount: Number(record.sol ?? 0) || 0 },
  };
  saveUserHoldings(next);
}

export function applyUserHoldingsRow(
  holdings: UserHoldings,
  symbol: PortfolioSymbol,
  row: Partial<UserHoldingRow>,
): UserHoldings {
  return {
    ...holdings,
    [symbol]: {
      tokenAmount: Number(row.tokenAmount ?? holdings[symbol].tokenAmount) || 0,
      averageBuyPrice: Number(row.averageBuyPrice ?? holdings[symbol].averageBuyPrice) || 0,
      investedUsd: Number(row.investedUsd ?? holdings[symbol].investedUsd) || 0,
    },
  };
}

export function adjustTokenAmount(
  key: 'btc' | 'eth' | 'sol',
  delta: number,
): UserHoldings {
  const holdings = loadUserHoldings();
  const symbol = coinKeyToSymbol(key);
  const next = applyUserHoldingsRow(holdings, symbol, {
    tokenAmount: Math.max(0, holdings[symbol].tokenAmount + delta),
  });
  saveUserHoldings(next);
  return next;
}

const TARGET_PCT: Record<PortfolioSymbol, number> = {
  BTC: 0.64,
  ETH: 0.25,
  SOL: 0.11,
};

const CG_ID: Record<PortfolioSymbol, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
};

export const EMPTY_USER_HOLDINGS: UserHoldings = {
  BTC: { tokenAmount: 0, averageBuyPrice: 0, investedUsd: 0 },
  ETH: { tokenAmount: 0, averageBuyPrice: 0, investedUsd: 0 },
  SOL: { tokenAmount: 0, averageBuyPrice: 0, investedUsd: 0 },
};

function normalizeRow(row: Partial<UserHoldingRow> | undefined): UserHoldingRow {
  return {
    tokenAmount: Number(row?.tokenAmount ?? 0) || 0,
    averageBuyPrice: Number(row?.averageBuyPrice ?? 0) || 0,
    investedUsd: Number(row?.investedUsd ?? 0) || 0,
  };
}

/** Coerce any stored / partial shape into a safe UserHoldings object. */
export function normalizeUserHoldings(
  raw?: Partial<UserHoldings> | Record<string, unknown> | null,
): UserHoldings {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_USER_HOLDINGS };

  const legacy = raw as Record<string, unknown>;
  const hasLegacyFlat = 'btc' in legacy || 'eth' in legacy || 'sol' in legacy;
  if (hasLegacyFlat && !('BTC' in legacy)) {
    return {
      BTC: {
        tokenAmount: Number(legacy.btc ?? 0) || 0,
        averageBuyPrice: Number(legacy.btcAvg ?? legacy.btc_avg ?? 0) || 0,
        investedUsd: Number(legacy.btcInvested ?? legacy.btc_invested ?? 0) || 0,
      },
      ETH: {
        tokenAmount: Number(legacy.eth ?? 0) || 0,
        averageBuyPrice: Number(legacy.ethAvg ?? legacy.eth_avg ?? 0) || 0,
        investedUsd: Number(legacy.ethInvested ?? legacy.eth_invested ?? 0) || 0,
      },
      SOL: {
        tokenAmount: Number(legacy.sol ?? 0) || 0,
        averageBuyPrice: Number(legacy.solAvg ?? legacy.sol_avg ?? 0) || 0,
        investedUsd: Number(legacy.solInvested ?? legacy.sol_invested ?? 0) || 0,
      },
    };
  }

  const typed = raw as Partial<UserHoldings>;
  return {
    BTC: normalizeRow(typed.BTC),
    ETH: normalizeRow(typed.ETH),
    SOL: normalizeRow(typed.SOL),
  };
}

export function loadUserHoldings(): UserHoldings {
  ensureLegacyCleared();
  try {
    const raw = localStorage.getItem(PORTFOLIO_REAL_HOLDINGS_KEY);
    if (!raw) return { ...EMPTY_USER_HOLDINGS };
    const parsed = JSON.parse(raw) as Partial<UserHoldings> | Record<string, unknown>;
    return normalizeUserHoldings(parsed);
  } catch {
    return { ...EMPTY_USER_HOLDINGS };
  }
}


export function buildDashboardFromUserHoldings(
  userHoldings: UserHoldings | Partial<UserHoldings> | Record<string, unknown> | null | undefined,
  livePriceMap: { bitcoin?: number; ethereum?: number; solana?: number },
): PortfolioDashboardMetrics {
  const safeHoldings = normalizeUserHoldings(userHoldings);
  const { liveBtcPrice, liveEthPrice, liveSolPrice } = livePricesFromMap(livePriceMap);

  const totalValue = computePortfolioTotalValue(
    safeHoldings.BTC.tokenAmount,
    safeHoldings.ETH.tokenAmount,
    safeHoldings.SOL.tokenAmount,
    liveBtcPrice,
    liveEthPrice,
    liveSolPrice,
  );

  const priceBySymbol = {
    BTC: liveBtcPrice,
    ETH: liveEthPrice,
    SOL: liveSolPrice,
  } as const;

  const assets = (['BTC', 'ETH', 'SOL'] as PortfolioSymbol[]).map((symbol) => {
    const row = safeHoldings[symbol];
    const token = TOKENS.find(t => t.symbol === symbol)!;
    const currentPrice = priceBySymbol[symbol];
    const value = row.tokenAmount * currentPrice;
    const invested = row.investedUsd;
    const pnl = value - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    const actualPct = totalValue > 0 ? value / totalValue : 0;
    const targetPct = token.allocation;

    return {
      symbol,
      coingeckoId: CG_ID[symbol],
      holdings: row.tokenAmount,
      avgBuyPrice: row.averageBuyPrice,
      invested,
      currentPrice,
      value,
      pnl,
      pnlPct,
      actualPct,
      targetPct,
      deviationPct: (actualPct - targetPct) * 100,
    };
  });

  const totalInvested = assets.reduce((sum, asset) => sum + asset.invested, 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return { assets, totalValue, totalInvested, totalPnl, totalPnlPct };
}
