import { describe, it, expect } from 'vitest';
import { anchoredBorrow, whitelistBorrows, boostPlan, boostGate, semaforPhase, UNWIND_LADDER, whitelistCollateral } from './btcSmartTurbo';
import type { YieldRoute } from '@/hooks/useYieldScanner';

const r = (protocol: string, chain: string, symbol: string, borrowApy: number | null, supplyApy = 0.1): YieldRoute => ({ protocol, chain, symbol, borrowApy, supplyApy, tvlUsd: 1 });

describe('btcSmartTurbo', () => {
  it('whitelist keeps only Aave V3 on Arbitrum/Base/Optimism', () => {
    const routes = [r('Aave V3', 'Arbitrum', 'USDC', 5), r('Compound V3', 'Arbitrum', 'USDC', 3), r('Aave V3', 'Ethereum', 'USDT', 2), r('Aave V3', 'Base', 'USDT', 4.5)];
    expect(whitelistBorrows(routes).map(x => x.chain)).toEqual(['Base', 'Arbitrum']);
    expect(whitelistCollateral([r('Morpho', 'Base', 'cbBTC', null), r('Aave V3', 'Base', 'cbBTC', null)])).toHaveLength(1);
  });
  it('anchor: switch only when cheaper by more than 2.0 %', () => {
    const b = [r('Aave V3', 'Base', 'USDT', 3), r('Aave V3', 'Arbitrum', 'USDC', 4.9)];
    expect(anchoredBorrow(b, 'Arbitrum').switchSuggested).toBe(false);
    const c = [r('Aave V3', 'Base', 'USDT', 2.8), r('Aave V3', 'Arbitrum', 'USDC', 4.9)];
    expect(anchoredBorrow(c, 'Arbitrum').switchSuggested).toBe(true);
  });
  it('Boost 1.40x: collateral ×1.4, debt = 40 % of deposit, LTV ≈ 28.57 %, liq at 78 %', () => {
    const p = boostPlan({ depositBtc: 0.01, price: 100_000, existingCollBtc: 0, existingDebtUsd: 0, enabled: true });
    expect(p.boostedCollBtc).toBeCloseTo(0.014);
    expect(p.newDebtUsd).toBeCloseTo(400);
    expect(p.ltv).toBeCloseTo(0.2857, 3);
    expect(p.liqPrice!).toBeCloseTo(400 / (0.014 * 0.78), 2);
  });
  it('Boost blocked below 200D SMA, green when RSI < 35', () => {
    expect(boostGate(70_000, 73_000, 30)).toEqual({ allowed: false, belowSma: true, rsiGreen: true });
    expect(boostGate(76_000, 73_000, 40).allowed).toBe(true);
  });
  it('static ladder from ATH $73 750', () => {
    expect(UNWIND_LADDER.map(s => s.price)).toEqual([95_875, 110_625, 132_750]);
  });
  it('semafor phases', () => {
    expect(semaforPhase(65, 2)).toBe(0);
    expect(semaforPhase(72, 1.6)).toBe(1);
    expect(semaforPhase(79, 2.3)).toBe(2);
    expect(semaforPhase(50, 3.1)).toBe(3);
    expect(semaforPhase(83, 1)).toBe(3);
    expect(semaforPhase(75, 1.4)).toBe(0); // Z-Score < 1.5 → zelená aj pri F&G 75
  });
});
