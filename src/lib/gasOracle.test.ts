import { describe, it, expect } from 'vitest';
import { netProfitUsd, priorityGasUsd } from './gasOracle';
import { bestNetRoute, refinancingSaving } from './smartYieldRoutes';
import type { YieldRoute } from '@/hooks/useYieldScanner';

const r = (protocol: string, chain: string, symbol: string, supplyApy: number, borrowApy: number | null): YieldRoute =>
  ({ protocol, chain, symbol, supplyApy, borrowApy, tvlUsd: 1_000_000 });

describe('netProfitUsd', () => {
  it('subtracts gas from the 1-year yield', () => {
    expect(netProfitUsd(1000, 5, 12)).toBeCloseTo(38);
  });
  it('missing gas data counts as zero cost', () => {
    expect(netProfitUsd(1000, 5, undefined)).toBeCloseTo(50);
  });
});

describe('priorityGasUsd', () => {
  it('applies the 1.5× emergency multiplier', () => {
    expect(priorityGasUsd(2)).toBeCloseTo(3);
  });
  it('stays undefined without gas data', () => {
    expect(priorityGasUsd(undefined)).toBeUndefined();
  });
});

describe('bestNetRoute — gas-aware winning route', () => {
  const routes = [
    r('Aave V3', 'Ethereum', 'WBTC', 1.0, null),
    r('Aave V3', 'Ethereum', 'USDC', 4.0, 5.0),
    r('Aave V3', 'Arbitrum', 'WBTC', 0.8, null),
    r('Aave V3', 'Arbitrum', 'USDC', 3.5, 4.5),
  ];
  it('picks the cheap L2 over a higher-APY L1 for a micro-transaction', () => {
    const best = bestNetRoute(routes, 'BTC', 0.25, 27, { Ethereum: 8, Arbitrum: 0.05 });
    expect(best?.collateral.chain).toBe('Arbitrum');
  });
  it('allows the L1 route when gas is exceptionally cheap', () => {
    const best = bestNetRoute(routes, 'BTC', 0.25, 100_000, { Ethereum: 0.01, Arbitrum: 0.05 });
    expect(best?.collateral.chain).toBe('Ethereum');
  });
  it('keeps collateral and borrow on the exact same protocol and chain', () => {
    const best = bestNetRoute(routes, 'BTC', 0.25, 27, { Ethereum: 8, Arbitrum: 0.05 });
    expect(best).not.toBeNull();
    expect(best!.borrow.chain).toBe(best!.collateral.chain);
    expect(best!.borrow.protocol).toBe(best!.collateral.protocol);
  });
});

describe('refinancingSaving', () => {
  const cheap = r('Compound V3', 'Base', 'USDC', 3, 2.0);
  it('alerts when yearly saving beats the gas cost', () => {
    const out = refinancingSaving(10_000, 6, cheap, { Base: 0.2 });
    expect(out).not.toBeNull();
    expect(out!.savingUsd).toBeCloseTo(10_000 * 0.04 - 0.2);
  });
  it('stays silent when gas eats the saving', () => {
    expect(refinancingSaving(50, 6, cheap, { Base: 5 })).toBeNull();
  });
  it('stays silent without debt or a route', () => {
    expect(refinancingSaving(0, 6, cheap, {})).toBeNull();
    expect(refinancingSaving(10_000, 6, null, {})).toBeNull();
  });
});
