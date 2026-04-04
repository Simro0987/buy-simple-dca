import { useState, useMemo } from 'react';
import { Wallet, RefreshCw, TrendingUp, Shield, Landmark, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { TOKENS, formatUsd, PriceData } from '@/lib/crypto';
import { usePrices, useAthData } from '@/hooks/usePrices';
import { useDefiApys } from '@/hooks/useDefiApys';
import { Lang } from '@/lib/i18n';
import { STAKING_CONFIG } from '@/lib/wallets';
import { PortfolioHistoryChart } from '@/components/PortfolioHistoryChart';
import { Card, CardContent } from '@/components/ui/card';

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
  const sk = lang === 'sk';
  const { data: prices, refetch, isFetching } = usePrices();
  const { data: athData } = useAthData();
  const { data: apys } = useDefiApys();
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

      {/* Total Value Card */}
      <Card className="border-border bg-card overflow-hidden">
        <div className="h-1 bg-primary" />
        <CardContent className="p-5">
          <p className="text-xs text-muted-foreground mb-1">
            {sk ? 'Celková hodnota portfólia' : 'Total Portfolio Value'}
          </p>
          <p className="text-3xl font-bold text-foreground">
            {hasHoldings ? formatUsd(totalValue) : '$0.00'}
          </p>
          {!hasHoldings && (
            <p className="text-xs text-muted-foreground mt-2">
              {sk
                ? 'Zadaj držby v záložke Smart pre zobrazenie portfólia'
                : 'Enter holdings in the Smart tab to see portfolio'}
            </p>
          )}

          {/* Allocation bar */}
          {hasHoldings && (
            <div className="mt-4 space-y-2">
              <div className="flex h-3 rounded-full overflow-hidden bg-secondary">
                {tokenData.map(t => {
                  const pct = (t.valueUsd / totalValue) * 100;
                  if (pct < 0.5) return null;
                  return (
                    <div
                      key={t.id}
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: t.color }}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-3">
                {actualAlloc.map(a => (
                  <div key={a.symbol} className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: TOKENS.find(t => t.symbol === a.symbol)?.color }}
                    />
                    <span className="text-[11px] text-foreground font-medium">{a.symbol}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {a.actual.toFixed(1)}%
                    </span>
                    {Math.abs(a.actual - a.target) > 3 && (
                      <span className="text-[10px] text-yellow-400">
                        (cieľ {a.target}%)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History chart */}
      <PortfolioHistoryChart lang={lang} prices={prices} />

      {/* Per-token cards */}
      {tokenData.map(t => {
        const isExpanded = expandedToken === t.symbol;
        const positions = t.config?.positions || [];

        return (
          <Card key={t.id} className="border-border bg-card overflow-hidden">
            <div className="h-0.5" style={{ backgroundColor: t.color }} />
            <CardContent className="p-0">
              {/* Token header - clickable */}
              <button
                onClick={() => setExpandedToken(isExpanded ? null : t.symbol)}
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
                          else if (pos.label === 'Native staking') liveApy = apys.hypeStaking;
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

      {/* Pie Chart */}
      {hasHoldings && (
        <Card className="border-border bg-card">
          <CardContent className="p-5 flex flex-col items-center">
            <p className="text-sm font-semibold text-foreground mb-3">
              {sk ? 'Cieľová vs. skutočná alokácia' : 'Target vs. Actual Allocation'}
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 w-full">
              {actualAlloc.map(a => {
                const diff = a.actual - a.target;
                const color = TOKENS.find(t => t.symbol === a.symbol)?.color;
                return (
                  <div key={a.symbol} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-xs text-foreground">{a.symbol}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">{a.actual.toFixed(1)}%</span>
                      <span className={`text-[10px] font-medium ${
                        Math.abs(diff) <= 3 ? 'text-muted-foreground' : diff > 0 ? 'text-yellow-400' : 'text-blue-400'
                      }`}>
                        ({diff >= 0 ? '+' : ''}{diff.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
