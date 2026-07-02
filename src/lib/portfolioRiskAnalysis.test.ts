import { describe, expect, it } from 'vitest';
import { generatePortfolioRiskInsight } from './portfolioRiskAnalysis';
import { buildDashboardFromUserHoldings } from './portfolioRealHoldings';

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

describe('buildDashboardFromUserHoldings', () => {
  it('computes live value and pnl from user holdings', () => {
    const result = buildDashboardFromUserHoldings(
      {
        BTC: { tokenAmount: 0.5, averageBuyPrice: 60_000, investedUsd: 30_000 },
        ETH: { tokenAmount: 0, averageBuyPrice: 0, investedUsd: 0 },
        SOL: { tokenAmount: 0, averageBuyPrice: 0, investedUsd: 0 },
      },
      { bitcoin: 100_000, ethereum: 4_000, solana: 200 },
    );
    expect(result.totalValue).toBe(50_000);
    expect(result.totalInvested).toBe(30_000);
    expect(result.totalPnl).toBe(20_000);
    expect(result.assets).toHaveLength(3);
    const btc = result.assets.find(a => a.symbol === 'BTC')!;
    expect(btc.value).toBeCloseTo(50_000, 2);
    expect(btc.pnl).toBeCloseTo(20_000, 2);
  });

  it('defaults to zero when holdings are empty', () => {
    const result = buildDashboardFromUserHoldings(
      {
        BTC: { tokenAmount: 0, averageBuyPrice: 0, investedUsd: 0 },
        ETH: { tokenAmount: 0, averageBuyPrice: 0, investedUsd: 0 },
        SOL: { tokenAmount: 0, averageBuyPrice: 0, investedUsd: 0 },
      },
      { bitcoin: 100_000, ethereum: 4_000, solana: 200 },
    );
    expect(result.totalValue).toBe(0);
    expect(result.totalInvested).toBe(0);
    expect(result.totalPnl).toBe(0);
    expect(result.totalPnlPct).toBe(0);
  });
});
