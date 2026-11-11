import { describe, it, expect } from 'vitest';
import { sumBtcCollateral } from './multiProtocolBtc';
import { computeRoboAction } from './roboAdvisorEngine';

describe('multi-protocol BTC collateral', () => {
  it('sums BTC deposits across all protocols', () => {
    const total = sumBtcCollateral([
      { protocol: 'Aave V3', chain: 'Arbitrum', asset: 'WBTC', amountBtc: 0.01 },
      { protocol: 'Compound V3', chain: 'Base', asset: 'cbBTC', amountBtc: 0.02 },
      { protocol: 'Morpho', chain: 'Ethereum', asset: 'WBTC', amountBtc: 0.005 },
    ]);
    expect(total).toBeCloseTo(0.035);
  });
  it('remaining space = 25% pool − deposits from all protocols', () => {
    const r = computeRoboAction({ totalBtc: 1, currentDepositedWbtc: 0.035, currentDebt: 0, weeklyBudget: 0, fearAndGreed: 40, borrowApy: 5, btcPrice: 100000 });
    expect(r.remainingSpaceBtc).toBeCloseTo(0.215);
  });
});

import { classifyAsset, sumStableDebtUsd, multiProtocolLtv } from './multiProtocolBtc';
describe('universal asset recognition', () => {
  const refs = { btcUsd: 100000, eurUsd: 1.1 };
  it('accepts any BTC-named token pegged 1:1 to BTC', () => {
    expect(classifyAsset('tBTC', 99500, refs)).toBe('BTC');
    expect(classifyAsset('solvBTC', 100800, refs)).toBe('BTC');
  });
  it('rejects a BTC-named token that is not pegged', () => expect(classifyAsset('fakeBTC', 50000, refs)).toBeNull());
  it('recognises USD and EUR stables by oracle peg', () => {
    expect(classifyAsset('LUSD', 1.0, refs)).toBe('USD');
    expect(classifyAsset('EURC', 1.1, refs)).toBe('EUR');
    expect(classifyAsset('USDX', 0.6, refs)).toBeNull();
  });
  it('total debt and LTV use all protocols', () => {
    const debt = sumStableDebtUsd([
      { protocol: 'Aave V3', chain: 'Base', asset: 'USDC', peg: 'USD', amount: 1000, amountUsd: 1000 },
      { protocol: 'Morpho', chain: 'Ethereum', asset: 'EURC', peg: 'EUR', amount: 1000, amountUsd: 1100 },
    ]);
    expect(debt).toBe(2100);
    expect(multiProtocolLtv(0.1, 100000, debt)).toBeCloseTo(0.21);
  });
});

describe('universal stable debt recognition', () => {
  const refs = { btcUsd: 100000, eurUsd: 1.08 };
  it('recognises any USD stable by pattern when oracle ~1', () => {
    for (const s of ['LUSD', 'FRAX', 'GHO', 'USDS', 'crvUSD', 'PYUSD', 'DOLA', 'USDe']) expect(classifyAsset(s, 1.0, refs)).toBe('USD');
  });
  it('recognises EUR stables when oracle ~EURUSD', () => {
    for (const s of ['EURC', 'EURS', 'AEUR', 'agEUR', 'eEUR']) expect(classifyAsset(s, 1.08, refs)).toBe('EUR');
  });
  it('rejects a depegged stable', () => { expect(classifyAsset('USDX', 0.8, refs)).toBeNull(); });
  it('accepts an unnamed liability only by a tight oracle peg', () => {
    expect(classifyAsset('XYZ', 1.003, refs)).toBe('USD');
    expect(classifyAsset('WETH', 3500, refs)).toBeNull();
  });
});

describe('universal BTC collateral recognition', () => {
  const refs = { btcUsd: 100000, eurUsd: 1.08 };
  it('accepts any BTC-named token priced ~1:1 with BTC', () => {
    for (const s of ['WBTC', 'cbBTC', 'tBTC', 'LBTC', 'uniBTC', 'solvBTC', 'FBTC']) expect(classifyAsset(s, 99500, refs)).toBe('BTC');
  });
  it('ignores broken or unpriced BTC derivatives', () => {
    expect(classifyAsset('xBTC', 60000, refs)).toBeNull();
    expect(classifyAsset('yBTC', 0, refs)).toBeNull();
  });
});

describe('ETH recognition', () => {
  const refs = { btcUsd: 100000, eurUsd: 1.1, ethUsd: 3000 };
  it('accepts ETH-family tokens incl. LSTs, rejects depegged', async () => {
    const { classifyAsset } = await import('./multiProtocolBtc');
    expect(classifyAsset('WETH', 3000, refs)).toBe('ETH');
    expect(classifyAsset('wstETH', 3600, refs)).toBe('ETH');
    expect(classifyAsset('cbETH', 3300, refs)).toBe('ETH');
    expect(classifyAsset('fakeETH', 100, refs)).toBeNull();
  });
});
