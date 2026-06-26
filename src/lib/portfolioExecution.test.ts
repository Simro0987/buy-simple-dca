import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadCyborgUsdcDebt,
  loadCyborgUsdcWallet,
} from '@/lib/cyborgPortfolio';
import { getLedger } from '@/lib/stakingLedger';
import {
  applyExecutionPayload,
  buildExecutionPayload,
  revertExecutionPayload,
} from '@/lib/portfolioExecution';

describe('portfolioExecution', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('core-stake moves amount into Rocket Pool / Marinade ledger', () => {
    const payload = buildExecutionPayload({
      layer: 'core-stake',
      actionType: 'stake',
      amount: 0.5,
      symbol: 'ETH',
    });
    expect(payload.update.rEthQty).toBe(0.5);
    expect(payload.ethProtocol).toBe('Rocket Pool (rETH)');

    applyExecutionPayload(payload);
    expect(getLedger()).toEqual([
      { symbol: 'ETH', protocol: 'Rocket Pool (rETH)', amount: 0.5 },
    ]);

    revertExecutionPayload(payload);
    expect(getLedger()).toEqual([]);
  });

  it('tactical-supply uses Aave / Kamino protocols', () => {
    const ethPayload = buildExecutionPayload({
      layer: 'tactical-supply',
      actionType: 'supply-collateral',
      amount: 1.2,
      symbol: 'ETH',
    });
    expect(ethPayload.ethProtocol).toBe('Aave V3 Lending');

    applyExecutionPayload(ethPayload);
    expect(getLedger()[0].protocol).toBe('Aave V3 Lending');

    const solPayload = buildExecutionPayload({
      layer: 'tactical-supply',
      actionType: 'supply-collateral',
      amount: 3,
      symbol: 'SOL',
    });
    applyExecutionPayload(solPayload);
    expect(getLedger().find(e => e.symbol === 'SOL')?.protocol).toBe('Kamino Autopilot');
  });

  it('tactical-borrow increases debt and USDC wallet', () => {
    const payload = buildExecutionPayload({
      layer: 'tactical-borrow',
      actionType: 'borrow',
      amount: 500,
      symbol: 'ETH',
    });
    expect(payload.update.usdcBorrowed).toBe(500);
    expect(payload.update.usdcWalletDelta).toBe(500);

    applyExecutionPayload(payload);
    expect(loadCyborgUsdcDebt()).toBe(500);
    expect(loadCyborgUsdcWallet()).toBe(500);

    revertExecutionPayload(payload);
    expect(loadCyborgUsdcDebt()).toBe(0);
    expect(loadCyborgUsdcWallet()).toBe(0);
  });

  it('alchemix-supply adds to Alchemix vault ledger', () => {
    const payload = buildExecutionPayload({
      layer: 'alchemix-supply',
      actionType: 'supply-collateral',
      amount: 0.25,
      symbol: 'ETH',
    });
    applyExecutionPayload(payload);
    expect(getLedger()).toEqual([
      { symbol: 'ETH', protocol: 'Alchemix Vault (ETH)', amount: 0.25 },
    ]);
    revertExecutionPayload(payload);
    expect(getLedger()).toEqual([]);
  });

  it('clamps invalid amounts to zero', () => {
    const payload = buildExecutionPayload({
      layer: 'core-stake',
      actionType: 'stake',
      amount: -1,
      symbol: 'ETH',
    });
    expect(payload.update.rEthQty).toBe(0);
    applyExecutionPayload(payload);
    expect(getLedger()).toEqual([]);
  });
});
