import { useState, useMemo } from 'react';
import { Wallet, RefreshCw, TrendingUp, Shield, Landmark, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { TOKENS, formatUsd, PriceData } from '@/lib/crypto';
import { usePrices, useAthData } from '@/hooks/usePrices';
import { useDefiApys } from '@/hooks/useDefiApys';
import { usePortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Lang } from '@/lib/i18n';
import { STAKING_CONFIG } from '@/lib/wallets';
import { PortfolioHistoryChart } from '@/components/PortfolioHistoryChart';
import { RebalanceCard } from '@/components/RebalanceCard';
import { Card, CardContent } from '@/components/ui/card';
import { ConcentrationWarnings } from '@/components/decision/ConcentrationWarnings';
import { PortfolioSummaryCard } from '@/components/dashboard/PortfolioSummaryCard';
import { AllocationDonut } from '@/components/dashboard/AllocationDonut';
import { InitialHoldingsCard } from '@/components/settings/InitialHoldingsCard';
import { AIYieldProfitRouter } from '@/components/portfolio/AIYieldProfitRouter';
import { PortfolioProvider, usePortfolio } from '@/contexts/PortfolioContext';
import { StickyPortfolioHeader } from '@/components/portfolio/StickyPortfolioHeader';
import { BtcGoalTracker } from '@/components/portfolio/BtcGoalTracker';
import { HealthScoreCard } from '@/components/portfolio/HealthScoreCard';
import { NextActionBanner } from '@/components/portfolio/NextActionBanner';
import { WhatIfSimulator } from '@/components/portfolio/WhatIfSimulator';
import { YieldEarnedCard } from '@/components/portfolio/YieldEarnedCard';

interface Props { lang: Lang; }

function loadHoldings(): Record<string, number> {
  try {
    const raw = localStorage.getItem('smart-alloc-holdings');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function typeIcon(type: string) {
  switch (type) {
    case 'staking': return TrendingUp;
    case 'lending': return Landmark;
    default: return Shield;
  }
}

function typeColor(type: string) {
  switch (type) {
    case 'staking': return 'text-green-400';
    case 'lending': return 'text-yellow-400';
    default: return 'text-blue-400';
  }
}

export function PortfolioPage({ lang }: Props) {
  return (
    <PortfolioProvider>
      <PortfolioPageInner lang={lang} />
    </PortfolioProvider>
  );
}

function PortfolioPageInner({ lang }: Props) {
  const { selected, toggleSelected } = usePortfolio();
  const sk = lang === 'sk';
  const { data: prices, refetch, isFetching } = usePrices();
  const { data: athData } = useAthData();
  const { data: apys } = useDefiApys();
  const { data: settings } = useAppSettings();
  const metrics = usePortfolioMetrics(prices);
  const weeklyCapital = Number(settings?.default_amount ?? 0);
  const cashReserve = Math.max(0, Number(settings?.total_capital ?? 0) - metrics.totalInvested);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const holdings = useMemo(() => loadHoldings(), []);

  const tokenData = useMemo(() => {
    if (!prices) return [];
    return TOKENS.map(token => {
      const key = token.symbol.toLowerCase();
      const qty = holdings[key] || 0;
      const price = prices[token.coingeckoId]?.usd ?? 0;
      const change24h = prices[token.coingeckoId]?.usd_24h_change ?? 0;
      const valueUsd = qty * price;
      const ath = athData?.[token.coingeckoId]?.ath ?? 0;
      const athDrop = ath > 0 ? ((price - ath) / ath) * 100 : 0;
      const config = STAKING_CONFIG.find(c => c.symbol === token.symbol);
      return { ...token, qty, price, change24h, valueUsd, ath, athDrop, config };
    });
  }, [prices, athData, holdings]);

  const totalValue = tokenData.reduce((sum, t) => sum + t.valueUsd, 0);
  const hasHoldings = totalValue > 0;

  // Actual allocation percentages
  const actualAlloc = tokenData.map(t => ({
    symbol: t.symbol,
    actual: totalValue > 0 ? (t.valueUsd / totalValue) * 100 : 0,
    target: t.allocation * 100,
  }));

  return (
    <div className="space-y-4">
      <StickyPortfolioHeader lang={lang} />

      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">
          {sk ? 'Portfólio' : 'Portfolio'}
        </h1>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg bg-secondary text-secondary-foreground"
          disabled={isFetching}
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Next action banner */}
      <NextActionBanner lang={lang} />

      {/* Cesta k 1 BTC — strategická priorita */}
      <BtcGoalTracker lang={lang} />

      {/* Synced summary from Home */}
      <PortfolioSummaryCard metrics={metrics} weeklyCapital={weeklyCapital} cashReserve={cashReserve} />

      {/* Zdravie portfólia (drift, diverzifikácia, stake, P/L) */}
      <HealthScoreCard lang={lang} />

      <AllocationDonut metrics={metrics} selected={selected} onSelect={(s) => toggleSelected(s as 'BTC' | 'ETH' | 'SOL')} />

      {/* Concentration warnings */}
      <ConcentrationWarnings />

      {/* Rebalancing suggestions */}
      <RebalanceCard lang={lang} prices={prices} selected={selected} />

      {/* AI Yield Profit Router */}
      <AIYieldProfitRouter lang={lang} />

      {/* Yield zarobený zo stakingu */}
      <YieldEarnedCard lang={lang} />

      {/* History chart */}
      <PortfolioHistoryChart lang={lang} prices={prices} selected={selected} />

      {/* What-if simulátor */}
      <WhatIfSimulator lang={lang} />

      {/* Per-token cards */}
      {tokenData.map(t => {
        const isExpanded = expandedToken === t.symbol;
        const positions = t.config?.positions || [];
        const dimmed = selected !== null && selected !== t.symbol;

        return (
          <Card
            key={t.id}
            className={`border-border bg-card overflow-hidden transition-opacity ${dimmed ? 'opacity-40' : ''} ${selected === t.symbol ? 'ring-2 ring-primary' : ''}`}
          >
            <div className="h-0.5" style={{ backgroundColor: t.color }} />
            <CardContent className="p-0">
              {/* Token header - clickable */}
              <button
                onClick={() => {
                  setExpandedToken(isExpanded ? null : t.symbol);
                  toggleSelected(t.symbol as 'BTC' | 'ETH' | 'SOL');
                }}
                className="w-full p-4 flex items-center gap-3"
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                  style={{ backgroundColor: t.color + '20', color: t.color }}
                >
                  {t.symbol.slice(0, 2)}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{t.symbol}</span>
                    <span className="text-sm font-bold text-foreground">
                      {t.qty > 0 ? formatUsd(t.valueUsd) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {formatUsd(t.price)}
                    </span>
                    <div className="flex items-center gap-2">
                      {t.qty > 0 && (
                        <span className="text-xs text-muted-foreground">
                          {t.symbol === 'BTC' ? t.qty.toFixed(8) : t.qty >= 100 ? t.qty.toFixed(2) : t.qty.toFixed(4)} {t.symbol}
                        </span>
                      )}
                      <span className={`text-xs font-medium ${t.change24h >= 0 ? 'text-gain' : 'text-loss'}`}>
                        {t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
                {t.qty > 0 && (
                  isExpanded
                    ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
              </button>

              {/* Expanded: ATH + staking positions */}
              {isExpanded && t.qty > 0 && (
                <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                  {/* ATH info */}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">ATH</span>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground">{formatUsd(t.ath)}</span>
                      <span className="text-loss">{t.athDrop.toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* Staking positions */}
                  {positions.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-foreground">
                        {sk ? 'Rozdelenie pozícií' : 'Position Breakdown'}
                      </p>
                      {positions.map((pos, i) => {
                        const Icon = typeIcon(pos.type);
                        const amount = t.qty * (pos.percentage / 100);
                        const amountUsd = amount * t.price;

                        // Get live APY
                        let liveApy = pos.apy ?? null;
                        if (apys) {
                          if (pos.protocol === 'Rocket Pool') liveApy = apys.rocketPool;
                          else if (pos.label.includes('wstETH') && pos.type !== 'lending') liveApy = apys.lido;
                          else if (pos.protocol === 'Aave V3') liveApy = apys.aaveEth;
                          else if (pos.protocol === 'Jito') liveApy = apys.jito;
                          else if (pos.protocol === 'Kamino') liveApy = apys.kaminoSol;
                        }

                        return (
                          <div key={i} className="flex items-center gap-2 bg-secondary/30 rounded-lg px-3 py-2">
                            <Icon className={`w-4 h-4 shrink-0 ${typeColor(pos.type)}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-foreground">{pos.label}</span>
                                <span className="text-xs font-bold text-foreground">
                                  {formatUsd(amountUsd)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between mt-0.5">
                                <span className="text-[10px] text-muted-foreground">
                                  {t.symbol === 'BTC' ? amount.toFixed(8) : amount >= 100 ? amount.toFixed(2) : amount.toFixed(4)} {t.symbol}
                                  {pos.protocol ? ` · ${pos.protocol}` : ''}
                                </span>
                                {liveApy != null && (
                                  <span className="text-[10px] text-green-400 font-medium">
                                    {liveApy.toFixed(1)}% APY
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {/* Position bar */}
                      <div className="flex h-1.5 rounded-full overflow-hidden bg-secondary">
                        {positions.map((pos, i) => {
                          const barColors: Record<string, string> = {
                            hold: 'bg-blue-400/60',
                            staking: 'bg-green-400/80',
                            lending: 'bg-yellow-400/70',
                          };
                          return (
                            <div
                              key={i}
                              className={barColors[pos.type] || 'bg-muted'}
                              style={{ width: `${pos.percentage}%` }}
                            />
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Manuálne držby & cost basis (pod per-token kartami) */}
      <InitialHoldingsCard />
    </div>
  );
}
