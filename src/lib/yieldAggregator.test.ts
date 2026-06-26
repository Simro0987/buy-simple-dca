import { describe, expect, it } from 'vitest';
import {
  buildYieldApyRates,
  buildYieldPositionsFromEntries,
  calculateYield,
  projectPassiveIncomeUsd,
  resolveProtocolApyPct,
} from '@/lib/yieldAggregator';

const rates = buildYieldApyRates({
  rocketPool: 3,
  etherFi: 4,
  aaveEth: 2,
  marinade: 7,
  sanctumInf: 8,
  kaminoSol: 5,
  alchemixVault: 2.5,
  lido: 3.4,
  jito: 7.5,
}, { lbtcSupply: 4 });

describe('yieldAggregator', () => {
  it('returns zeros for empty or undefined input', () => {
    expect(calculateYield(undefined, rates)).toEqual({
      weightedApyPct: 0,
      dailyPassiveIncomeUsd: 0,
      activePositionCount: 0,
      totalStakedUsd: 0,
    });
    expect(calculateYield([], rates)).toEqual({
      weightedApyPct: 0,
      dailyPassiveIncomeUsd: 0,
      activePositionCount: 0,
      totalStakedUsd: 0,
    });
  });

  it('ignores zero-balance positions', () => {
    const result = calculateYield([
      { protocol: 'Rocket Pool (rETH)', symbol: 'ETH', amount: 0, priceUsd: 3000 },
      { protocol: 'Marinade Native (mSOL)', symbol: 'SOL', amount: 2, priceUsd: 150 },
    ], rates);
    expect(result.activePositionCount).toBe(1);
    expect(result.weightedApyPct).toBeCloseTo(7, 5);
  });

  it('computes weighted APY and daily passive income', () => {
    const result = calculateYield([
      { protocol: 'Rocket Pool (rETH)', symbol: 'ETH', amount: 1, priceUsd: 3000 },
      { protocol: 'Aave V3 Lending', symbol: 'ETH', amount: 0.5, priceUsd: 3000 },
    ], rates);
    expect(result.totalStakedUsd).toBe(4500);
    expect(result.weightedApyPct).toBeCloseTo(2.6667, 3);
    expect(result.dailyPassiveIncomeUsd).toBeCloseTo((4500 * 0.026667) / 365, 4);
  });

  it('resolves protocol APY by name', () => {
    expect(resolveProtocolApyPct('Rocket Pool (rETH)', 'ETH', rates)).toBe(3);
    expect(resolveProtocolApyPct('Kamino Autopilot', 'SOL', rates)).toBe(5);
    expect(resolveProtocolApyPct('Alchemix Vault (ETH)', 'ETH', rates)).toBe(2.5);
  });

  it('builds positions from ledger entries', () => {
    const positions = buildYieldPositionsFromEntries([
      { symbol: 'ETH', protocol: 'Rocket Pool (rETH)', amount: 1 },
      { symbol: 'SOL', protocol: 'Marinade Native (mSOL)', amount: 0 },
    ], { eth: 3000, sol: 150, btc: 60000 });
    expect(positions).toHaveLength(1);
    expect(positions[0].priceUsd).toBe(3000);
  });

  it('projects passive income by period', () => {
    expect(projectPassiveIncomeUsd(10, 'day')).toBe(10);
    expect(projectPassiveIncomeUsd(10, 'month')).toBe(300);
    expect(projectPassiveIncomeUsd(10, 'year')).toBe(3650);
  });
});
