import { describe, expect, it } from 'vitest';
import { formatYieldLine, resolveYieldEntry, type YieldEntry } from './useLlamaStakingApy';

const lp: YieldEntry = { apy: 22, project: 'DEX', strategy: 'DEX LP', chain: 'Ethereum', tvl: 9_000_000, estimated: false };

describe('safe yield fallback', () => {
  it('keeps BTC in cold storage without yield', () => {
    expect(formatYieldLine(resolveYieldEntry('BTC', lp)!)).toBe('Ledger Nano - Cold Storage : 0% APY');
  });

  it.each([
    ['ETH', 3.2], ['SOL', 7.5], ['NEAR', 8.5], ['TAO', 16],
    ['INJ', 14], ['HNT', 6], ['HYPE', 12],
  ])('uses the requested fallback for %s', (symbol, apy) => {
    expect(resolveYieldEntry(symbol, lp)?.apy).toBe(apy);
    expect(formatYieldLine(resolveYieldEntry(symbol)!)).toContain(`~${apy.toLocaleString('sk-SK', { minimumFractionDigits: 1 })}% APY`);
  });

  it.each([
    ['AAVE', 'Safety Module - sAAVE Staking : ~6,0% APY'],
    ['UNI', 'Self-Custody - Governance Hold : 0% APY'],
    ['ENA', 'Ethena - sENA Staking : ~15,0% APY'],
    ['PENDLE', 'Pendle - vePENDLE Lock : ~10,0% APY'],
    ['XMR', 'Cake Wallet / Ledger - Privacy Hold : 0% APY'],
    ['PUMP', 'Self-Custody - Speculative Hold : 0% APY'],
    ['HYPE', 'Kinetiq - Staking : ~12,0% APY'],
  ])('never selects LP for %s', (symbol, expected) => {
    expect(formatYieldLine(resolveYieldEntry(symbol, lp)!)).toBe(expected);
    expect(formatYieldLine(resolveYieldEntry(symbol)!)).toBe(expected);
  });

  it('retains a valid live single-sided strategy for non-fixed assets', () => {
    const live = { ...lp, strategy: 'Lending' as const };
    expect(resolveYieldEntry('AAVE', live)).toBe(live);
  });
});