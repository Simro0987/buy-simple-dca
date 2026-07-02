import { describe, it, expect } from 'vitest';
import {
  realYieldIndex,
  ryiFromApy,
  ryiAllocationShiftPp,
  selectEthStakingApy,
  selectSolStakingApy,
  RYI_SHIFT_PP_PER_PCT,
  type LlamaPool,
} from './realYieldIndex';

describe('realYieldIndex', () => {
  it('computes RYI = APY − inflation', () => {
    expect(realYieldIndex({ grossApyPct: 8, inflationPct: 3 })).toBe(5);
    expect(realYieldIndex({ grossApyPct: 3.5, inflationPct: 0.5 })).toBe(3);
  });

  it('can be negative when inflation exceeds APY', () => {
    expect(realYieldIndex({ grossApyPct: 2, inflationPct: 5 })).toBe(-3);
  });
});

describe('ryiAllocationShiftPp', () => {
  it('shifts 2 pp per 1% RYI difference', () => {
    expect(ryiAllocationShiftPp(4, 3)).toBe(1 * RYI_SHIFT_PP_PER_PCT); // +2 pp toward ETH
  });

  it('shifts 10 pp for a 5% difference', () => {
    expect(ryiAllocationShiftPp(2, 7)).toBe(-5 * RYI_SHIFT_PP_PER_PCT); // −10 pp → toward SOL
  });

  it('is zero when RYI is equal', () => {
    expect(ryiAllocationShiftPp(3, 3)).toBe(0);
  });

  it('is signed toward the higher-yield token', () => {
    expect(ryiAllocationShiftPp(5, 3)).toBeGreaterThan(0); // ETH higher → toward ETH
    expect(ryiAllocationShiftPp(3, 5)).toBeLessThan(0);    // SOL higher → toward SOL
  });
});

describe('ryiFromApy', () => {
  it('combines a live APY with a base inflation rate', () => {
    expect(ryiFromApy(3.2, 0.5)).toBeCloseTo(2.7, 5);
    expect(ryiFromApy(8.1, 5)).toBeCloseTo(3.1, 5);
  });
});

describe('DefiLlama staking-APY selectors', () => {
  const pools: LlamaPool[] = [
    { chain: 'Ethereum', project: 'lido', symbol: 'STETH', apy: 3.4, apyBase: 3.1 },
    { chain: 'Ethereum', project: 'aave-v3', symbol: 'WETH', apy: 1.9, apyBase: 1.9 },
    { chain: 'Solana', project: 'jito-liquid-staking', symbol: 'JITOSOL', apy: 8.6, apyBase: 8.2 },
    { chain: 'Solana', project: 'marinade-liquid-staking', symbol: 'MSOL', apy: 7.9, apyBase: 7.5 },
  ];

  it('selects Lido stETH apyBase for ETH', () => {
    expect(selectEthStakingApy(pools)).toBe(3.1);
  });

  it('prefers Jito for SOL and uses apyBase', () => {
    expect(selectSolStakingApy(pools)).toBe(8.2);
  });

  it('falls back to Marinade when Jito is absent', () => {
    const noJito = pools.filter(p => !(p.project ?? '').includes('jito'));
    expect(selectSolStakingApy(noJito)).toBe(7.5);
  });

  it('returns null when no canonical pool is present', () => {
    expect(selectEthStakingApy([])).toBeNull();
    expect(selectSolStakingApy([{ chain: 'Ethereum', project: 'lido', symbol: 'STETH', apy: 3 }])).toBeNull();
  });

  it('ignores implausible APY values (>100%) and non-positive', () => {
    expect(selectEthStakingApy([{ chain: 'Ethereum', project: 'lido', symbol: 'STETH', apy: 999, apyBase: 999 }])).toBeNull();
    expect(selectSolStakingApy([{ chain: 'Solana', project: 'jito-liquid-staking', symbol: 'JITOSOL', apy: 0, apyBase: 0 }])).toBeNull();
  });
});
