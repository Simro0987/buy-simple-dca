import { describe, expect, it, beforeEach } from 'vitest';
import {
  adjustDcaInvestableForMarketMode,
  computeCyborgMetrics,
  safeNum,
  useCyborgEngine,
  type MasterState,
} from '@/stores/cyborgEngine';

const baseState = (): MasterState => ({
  walletBalances: { BTC: 0.1, ETH: 1, SOL: 10, USDC: 500 },
  stakingPositions: [
    { id: 'eth-1', symbol: 'ETH', protocol: 'Rocket Pool (rETH)', amount: 0.5, apyPct: 3.1, layer: 'core' },
  ],
  dcaSchedules: null,
  marketMode: 'BALANCED',
  prices: { btc: 100_000, eth: 3_000, sol: 150 },
  actionLock: { active: false, source: null, messageSk: '', messageEn: '' },
  reasoningContext: {
    marketScore: 50,
    fearGreed: 50,
    regime: 'sideways',
    marketMode: 'BALANCED',
    stakedRatio: 0,
    totalBalanceUsd: 0,
    weightedApyPct: 0,
  },
  revision: 0,
});

describe('cyborgEngine store', () => {
  beforeEach(() => {
    useCyborgEngine.setState({
      ...baseState(),
      revision: 0,
    });
    localStorage.clear();
  });

  it('safeNum coerces undefined and invalid values to zero', () => {
    expect(safeNum(undefined)).toBe(0);
    expect(safeNum(null)).toBe(0);
    expect(safeNum('bad')).toBe(0);
    expect(safeNum(-5)).toBe(0);
    expect(safeNum(12.5)).toBe(12.5);
  });

  it('computes unified USD totals and yield metrics', () => {
    const computed = computeCyborgMetrics(baseState());
    expect(computed.totalWalletUsd).toBeGreaterThan(0);
    expect(computed.totalStakedUsd).toBe(0.5 * 3000);
    expect(computed.totalBalanceUsd).toBe(computed.totalWalletUsd + computed.totalStakedUsd);
    expect(Number.isFinite(computed.weightedApyPct)).toBe(true);
  });

  it('adjusts DCA investable by market mode', () => {
    expect(adjustDcaInvestableForMarketMode(1000, 'ACCUMULATION')).toBe(1000);
    expect(adjustDcaInvestableForMarketMode(1000, 'DEFENSIVE')).toBe(250);
    expect(adjustDcaInvestableForMarketMode(0, 'BALANCED')).toBe(0);
  });

  it('locks DCA when stake execution is active', () => {
    useCyborgEngine.getState().beginStakeExecution();
    const computed = useCyborgEngine.getState().getComputed();
    expect(computed.dcaPaused).toBe(true);
    expect(computed.dcaPauseMessageSk).toContain('Stake');
    useCyborgEngine.getState().endStakeExecution();
    expect(useCyborgEngine.getState().getComputed().dcaPaused).toBe(false);
  });

  it('applyStakeExecution moves wallet balance into staking positions', () => {
    useCyborgEngine.getState().syncFromSources({
      holdings: { btc: 0, eth: 2, sol: 0 },
      entries: [],
      prices: { btc: 100_000, eth: 3_000, sol: 150 },
    });
    const beforeEth = useCyborgEngine.getState().walletBalances.ETH;
    useCyborgEngine.getState().applyStakeExecution({ rEthQty: 0.4 }, 'Rocket Pool (rETH)');
    const after = useCyborgEngine.getState();
    expect(after.walletBalances.ETH).toBeCloseTo(beforeEth - 0.4, 5);
    expect(after.stakingPositions.some(p => p.protocol.includes('Rocket') && p.amount === 0.4)).toBe(true);
  });

  it('applyDcaPurchase persists holdings and syncs wallet', () => {
    useCyborgEngine.getState().applyDcaPurchase('BTC', 0.01);
    const holdings = JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}');
    expect(Number(holdings.btc ?? 0)).toBeCloseTo(0.01, 8);
    expect(useCyborgEngine.getState().walletBalances.BTC).toBeCloseTo(0.01, 8);
  });

  it('canAffordDcaUsd respects action lock', () => {
    useCyborgEngine.setState({
      ...baseState(),
      walletBalances: { BTC: 1, ETH: 1, SOL: 1, USDC: 10_000 },
    });
    useCyborgEngine.getState().beginStakeExecution();
    expect(useCyborgEngine.getState().canAffordDcaUsd(100)).toBe(false);
    useCyborgEngine.getState().endStakeExecution();
    expect(useCyborgEngine.getState().canAffordDcaUsd(100)).toBe(true);
  });

  it('getReason returns contextual explanation', () => {
    useCyborgEngine.getState().setReasoningContext({ marketScore: 19, fearGreed: 19 });
    const reason = useCyborgEngine.getState().getReason('stake_eth', 'sk');
    expect(reason).toContain('Prečo:');
    expect(reason).toContain('19/100');
  });
});
