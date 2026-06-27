import { describe, expect, it } from 'vitest';
import { generatePortfolioRiskInsight } from './portfolioRiskAnalysis';
import { buildMockLiveMetrics } from './mockPortfolioHoldings';

describe('generatePortfolioRiskInsight', () => {
  it('suggests taking profits when market is greedy and portfolio is up', () => {
    const text = generatePortfolioRiskInsight({
      fearGreedValue: 75,
      fearGreedLabel: 'Greed',
      totalPnlPct: 12.5,
      lang: 'en',
    });
    expect(text).toContain('Greed');
    expect(text).toContain('75');
    expect(text).toContain('up');
    expect(text).toContain('take some profits');
  });

  it('suggests waiting for dip when market is greedy and portfolio is down', () => {
    const text = generatePortfolioRiskInsight({
      fearGreedValue: 72,
      fearGreedLabel: 'Greed',
      totalPnlPct: -4.2,
      lang: 'en',
    });
    expect(text).toContain('down');
    expect(text).toContain('wait for a better entry');
  });

  it('renders Slovak copy', () => {
    const text = generatePortfolioRiskInsight({
      fearGreedValue: 30,
      fearGreedLabel: 'Fear',
      totalPnlPct: -8,
      lang: 'sk',
    });
    expect(text).toContain('Fear');
    expect(text).toContain('v mínuse');
  });
});

describe('buildMockLiveMetrics', () => {
  it('computes live value and pnl from mock holdings', () => {
    const result = buildMockLiveMetrics({
      bitcoin: 100_000,
      ethereum: 4_000,
      solana: 200,
    });
    expect(result.totalValue).toBeGreaterThan(0);
    expect(result.assets).toHaveLength(3);
    expect(result.totalPnl).toBe(result.totalValue - result.totalInvested);
    const btc = result.assets.find(a => a.symbol === 'BTC')!;
    expect(btc.value).toBeCloseTo(btc.holdings * 100_000, 2);
  });
});
