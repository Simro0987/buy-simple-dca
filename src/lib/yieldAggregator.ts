import type { DefiApyData } from '@/hooks/useDefiApys';
import type { StakedEntry } from '@/lib/stakingLedger';
import { safeQty } from '@/lib/positionOverview';

export interface YieldPosition {
  protocol: string;
  symbol: 'BTC' | 'ETH' | 'SOL';
  amount: number;
  priceUsd: number;
}

export interface YieldApyRates {
  rocketPool: number;
  marinade: number;
  aaveEth: number;
  kaminoSol: number;
  alchemixVault: number;
  etherFi: number;
  lbtcSupply: number;
  btcLst: number;
  btcStake: number;
}

export interface YieldCalculationResult {
  weightedApyPct: number;
  dailyPassiveIncomeUsd: number;
  activePositionCount: number;
  totalStakedUsd: number;
}

const EMPTY_RESULT: YieldCalculationResult = {
  weightedApyPct: 0,
  dailyPassiveIncomeUsd: 0,
  activePositionCount: 0,
  totalStakedUsd: 0,
};

function safeApy(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function buildYieldApyRates(
  defiApys?: DefiApyData | null,
  extras?: { lbtcSupply?: number | null },
): YieldApyRates {
  return {
    rocketPool: safeApy(defiApys?.rocketPool ?? 0),
    marinade: safeApy(defiApys?.marinade ?? 0),
    aaveEth: safeApy(defiApys?.aaveEth ?? 0),
    kaminoSol: safeApy(defiApys?.kaminoSol ?? 0),
    alchemixVault: safeApy(defiApys?.alchemixVault ?? 0),
    etherFi: safeApy(defiApys?.etherFi ?? 0),
    lbtcSupply: safeApy(extras?.lbtcSupply ?? 0),
    btcLst: safeApy(defiApys?.jito ?? 0),
    btcStake: 6.4,
  };
}

export function resolveProtocolApyPct(
  protocol: string | null | undefined,
  symbol: string | null | undefined,
  rates?: YieldApyRates | null,
): number {
  if (!rates) return 0;
  const p = String(protocol ?? '').toLowerCase();
  const sym = String(symbol ?? '').toUpperCase();

  if (/rocket|reth/i.test(p)) return rates.rocketPool;
  if (/marinade|msol/i.test(p)) return rates.marinade;
  if (/aave|morpho/i.test(p)) return rates.aaveEth;
  if (/kamino/i.test(p)) return rates.kaminoSol;
  if (/alchemix/i.test(p)) return rates.alchemixVault;
  if (/lombard|lbtc/i.test(p)) return rates.lbtcSupply > 0 ? rates.lbtcSupply : rates.btcLst;
  if (/babylon/i.test(p)) return rates.btcStake;
  if (/ether|weeth/i.test(p)) return rates.etherFi;
  if (/kiln/i.test(p)) return rates.rocketPool;

  if (sym === 'BTC') return rates.btcLst;
  if (sym === 'ETH') return rates.rocketPool;
  if (sym === 'SOL') return rates.marinade;
  return 0;
}

export function buildYieldPositionsFromEntries(
  entries: StakedEntry[] | null | undefined,
  prices?: { btc?: number; eth?: number; sol?: number } | null,
): YieldPosition[] {
  if (!entries?.length) return [];

  const priceBySymbol: Record<'BTC' | 'ETH' | 'SOL', number> = {
    BTC: safeQty(prices?.btc ?? 0),
    ETH: safeQty(prices?.eth ?? 0),
    SOL: safeQty(prices?.sol ?? 0),
  };

  return entries
    .map(entry => ({
      protocol: String(entry?.protocol ?? ''),
      symbol: entry?.symbol ?? 'ETH',
      amount: safeQty(entry?.amount ?? 0),
      priceUsd: priceBySymbol[entry?.symbol ?? 'ETH'] ?? 0,
    }))
    .filter(pos => pos.amount > 0 && pos.priceUsd > 0);
}

export function calculateYield(
  positions: YieldPosition[] | null | undefined,
  apyRates: YieldApyRates | null | undefined,
): YieldCalculationResult {
  if (!positions?.length || !apyRates) return { ...EMPTY_RESULT };

  let totalStakedUsd = 0;
  let annualYieldUsd = 0;
  let activePositionCount = 0;

  for (const raw of positions) {
    const amount = safeQty(raw?.amount ?? 0);
    const priceUsd = safeQty(raw?.priceUsd ?? 0);
    if (amount <= 0 || priceUsd <= 0) continue;

    const usd = amount * priceUsd;
    const apyPct = resolveProtocolApyPct(raw?.protocol, raw?.symbol, apyRates);
    if (usd <= 0) continue;

    totalStakedUsd += usd;
    annualYieldUsd += usd * (apyPct / 100);
    activePositionCount += 1;
  }

  if (totalStakedUsd <= 0 || !Number.isFinite(totalStakedUsd)) {
    return { ...EMPTY_RESULT };
  }

  const weightedApyPct = (annualYieldUsd / totalStakedUsd) * 100;
  const dailyPassiveIncomeUsd = annualYieldUsd / 365;

  return {
    weightedApyPct: Number.isFinite(weightedApyPct) ? weightedApyPct : 0,
    dailyPassiveIncomeUsd: Number.isFinite(dailyPassiveIncomeUsd) ? dailyPassiveIncomeUsd : 0,
    activePositionCount,
    totalStakedUsd,
  };
}

export type YieldIncomePeriod = 'day' | 'month' | 'year';

export const YIELD_INCOME_PERIOD_MULTIPLIER: Record<YieldIncomePeriod, number> = {
  day: 1,
  month: 30,
  year: 365,
};

export function projectPassiveIncomeUsd(
  dailyUsd: number,
  period: YieldIncomePeriod,
): number {
  const daily = safeQty(dailyUsd ?? 0);
  const multiplier = YIELD_INCOME_PERIOD_MULTIPLIER[period] ?? 1;
  const projected = daily * multiplier;
  return Number.isFinite(projected) ? projected : 0;
}
