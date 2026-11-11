import { describe, expect, it } from 'vitest';
import { BTC_CONFIG, ETH_CONFIG, borrowPlan, borrowPillars, currentLtv, liquidationPrice, weeklyDepositBoost, dynamicNativeSplit, STAKE_LAYER_COUNTS } from './leverageEngine';
import { candidateRoutes, winningRoute, bestStableSupply } from './smartYieldRoutes';
import type { YieldRoute } from '@/hooks/useYieldScanner';
import { unwindPlan, dissolvedValue, riskLevel } from './leverageEngine';
import { useStakeOperationsStore } from '@/stores/stakeOperationsStore';

describe('asset-specific risk limits', () => {
  it('BTC hardcap is exactly 33%', () => { expect(BTC_CONFIG.maxLtv).toBe(0.33); });
  it('ETH hardcap is exactly 25%', () => { expect(ETH_CONFIG.maxLtv).toBe(0.25); });
  it('SOL has only two layers', () => { expect(STAKE_LAYER_COUNTS.SOL).toBe(2); });
  it('BTC has five layers', () => { expect(STAKE_LAYER_COUNTS.BTC).toBe(5); });
  it('ETH has five layers', () => { expect(STAKE_LAYER_COUNTS.ETH).toBe(5); });
  it('existing debt reduces new borrow', () => { expect(borrowPlan(1, 100, 20, BTC_CONFIG).additionalDebt).toBe(5); });
  it('does not borrow above the hardcap', () => { expect(borrowPlan(1, 100, 34, BTC_CONFIG).additionalDebt).toBe(0); });
  it('real LTV rises as price falls without resetting debt', () => { expect(currentLtv(1, 50, 20)).toBe(0.4); });
  it('zero debt is zero LTV', () => { expect(currentLtv(1, 100, 0)).toBe(0); });
  it('liquidation derives from debt and collateral', () => { expect(liquidationPrice(2, 1600, 0.8)).toBe(1000); });
  it('rejects borrowing without a live price', () => { expect(borrowPlan(1, undefined, 0, BTC_CONFIG).additionalDebt).toBe(0); });
});

describe('weekly-deposit-only boost', () => {
  it('price alone cannot boost without a deposit', () => { expect(weeklyDepositBoost(0, 100000, BTC_CONFIG, true)).toBe(0); });
  it('a weekly deposit scales the target borrow', () => { expect(weeklyDepositBoost(0.01, 100000, BTC_CONFIG, true)).toBe(250); });
  it('a disabled boost remains zero', () => { expect(weeklyDepositBoost(0.01, 100000, BTC_CONFIG, false)).toBe(0); });
});

describe('three isolated pillars', () => {
  it('conserves all borrowed USDC across extreme indicators', () => {
    for (const vol of [0, 50, 100]) for (const fg of [0, 50, 100]) {
      const a = borrowPillars(1234.56, vol, fg);
      expect(a.stablePct + a.nativePct + a.cashPct).toBe(100);
      expect(a.stableUsd + a.nativeUsd + a.cashUsd).toBeCloseTo(1234.56, 8);
    }
  });
  it('native supply has collateral explicitly disabled', () => { expect(borrowPillars(100, 50, 50).nativeCollateralEnabled).toBe(false); });
  it('volatility increases the cash buffer', () => { expect(borrowPillars(100, 100, 50).cashPct).toBeGreaterThan(borrowPillars(100, 0, 50).cashPct); });
  it('poor DeFi yields favor native ETH staking', () => { expect(dynamicNativeSplit(ETH_CONFIG, 0.01, 3.2).nativePct).toBeGreaterThan(ETH_CONFIG.nativeStakePct); });
});

describe('live L2 route selection', () => {
  const route = (protocol: string, chain: string, symbol: string, supplyApy: number): YieldRoute => ({ protocol, chain, symbol, supplyApy, tvlUsd: 10000000, borrowApy: null });
  it('highest L2 APY wins', () => { expect(winningRoute([route('Aave V3', 'Arbitrum', 'WBTC', 1), route('Morpho', 'Base', 'CBBTC', 2)], 'BTC')?.protocol).toBe('Morpho'); });
  it('ignores unsupported chains', () => { expect(candidateRoutes([route('Morpho', 'Polygon', 'CBBTC', 10)], 'BTC')).toEqual([]); });
  it('USDT cannot replace USDC supply', () => { expect(bestStableSupply([route('Morpho', 'Base', 'USDT', 10), route('Aave V3', 'Base', 'USDC', 1)])?.symbol).toBe('USDC'); });
});

describe('two-way position management', () => {
  it('repays exactly enough USDC to reach safe BTC LTV', () => {
    const plan = unwindPlan(1, 100, 40, 100, BTC_CONFIG);
    expect(plan.repay).toBeCloseTo(25, 10);
    expect(plan.postRepayLtv).toBeCloseTo(0.15, 10);
  });
  it('repay cannot exceed dissolved Layer 5 USDC', () => {
    const plan = unwindPlan(1, 100, 40, 10, BTC_CONFIG);
    expect(plan.repay).toBe(10);
    expect(plan.shortfall).toBeCloseTo(15, 10);
    expect(plan.withdrawable).toBe(0);
  });
  it('ETH withdrawal preserves safe LTV with remaining debt', () => {
    const plan = unwindPlan(2, 1000, 80, 0, ETH_CONFIG);
    expect(plan.withdrawable).toBeCloseTo(1, 10);
    expect(currentLtv(2 - plan.withdrawable, 1000, 80)).toBeCloseTo(0.08, 10);
  });
  it('fully repaid debt allows the entire collateral withdrawal', () => {
    expect(unwindPlan(2, 1000, 0, 0, ETH_CONFIG).withdrawable).toBe(2);
  });
  it('missing live prices block repayment and withdrawals', () => {
    const plan = unwindPlan(2, undefined, 80, 100, ETH_CONFIG);
    expect(plan.repay).toBe(0);
    expect(plan.withdrawable).toBe(0);
  });
  it('dissolution marks native supply to live price', () => {
    expect(dissolvedValue({ stableUsdc: 50, nativeQty: 2, cashUsdc: 10 }, 20)).toBe(100);
  });
  it('near-liquidation LTV triggers a danger warning', () => {
    expect(riskLevel(0.8 * BTC_CONFIG.liqThreshold, BTC_CONFIG.maxLtv, BTC_CONFIG.liqThreshold)).toBe('DANGER');
  });
  it('keeps recovered funds separate and prevents double spending', () => {
    const store = useStakeOperationsStore;
    store.setState({ positions: {}, recovered: { BTC: 0, ETH: 0 } });
    expect(store.getState().deploy('BTC', { stableUsdc: 50, nativeQty: 2, cashUsdc: 10 })).toBe(true);
    expect(store.getState().dissolve('BTC', 20)).toBe(true);
    expect(store.getState().dissolve('BTC', 20)).toBe(false);
    expect(store.getState().consume('BTC', 25)).toBe(true);
    expect(store.getState().recovered.BTC).toBe(75);
    expect(store.getState().recovered.ETH).toBe(0);
    expect(store.getState().consume('BTC', 76)).toBe(false);
  });
});