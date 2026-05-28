import { Lang } from '@/lib/i18n';
import { TOKENS, PriceData, AthData, formatPrice } from '@/lib/crypto';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { Shield, TrendingDown, TrendingUp, AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { LiquidationLevelsCard } from '@/components/risk/LiquidationLevelsCard';
import { useLiquidationLevels, evaluateLiquidations, type LiqSymbol } from '@/lib/liquidationLevels';

interface Props {
  lang: Lang;
  prices?: PriceData;
  athData?: AthData;
  cycleResult?: MarketCycleResult | null;
}

function getSignal(score: number, sk: boolean): { label: string; color: string; icon: typeof TrendingUp } {
  if (score <= 20) return { label: sk ? '🟢 NAKUPUJ' : '🟢 BUY', color: 'text-gain', icon: TrendingUp };
  if (score <= 40) return { label: sk ? '🔵 DCA' : '🔵 DCA', color: 'text-accent', icon: TrendingUp };
  if (score <= 60) return { label: sk ? '⚪ DRŽI' : '⚪ HOLD', color: 'text-foreground', icon: Shield };
  if (score <= 80) return { label: sk ? '🟡 OPATRNOSŤ' : '🟡 CAUTION', color: 'text-warning', icon: AlertTriangle };
  return { label: sk ? '🔴 ZVÁŽ VÝBER' : '🔴 CONSIDER EXIT', color: 'text-loss', icon: TrendingDown };
}

function getMaxDownside(athPct: number): number {
  // Estimate max downside based on ATH distance
  // If already far from ATH, less additional downside expected
  const dist = Math.abs(athPct);
  if (dist < 10) return -60; // Near ATH, big risk
  if (dist < 30) return -40;
  if (dist < 50) return -25;
  if (dist < 70) return -15;
  return -10; // Already very low
}

export function RiskDashboard({ lang, prices, athData, cycleResult }: Props) {
  const sk = lang === 'sk';
  const signal = cycleResult ? getSignal(cycleResult.score, sk) : null;

  const isLoading = !prices || Object.keys(prices).length === 0;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">
        <Shield className="w-5 h-5 inline mr-2" />
        {sk ? 'Riziko & Cyklus' : 'Risk & Cycle'}
      </h1>

      {isLoading ? (
        <div className="space-y-4">
          {/* Signal skeleton */}
          <div className="glass-card p-5 space-y-3">
            <Skeleton className="h-3 w-24 mx-auto" />
            <Skeleton className="h-9 w-48 mx-auto" />
            <Skeleton className="h-4 w-64 mx-auto" />
            <Skeleton className="h-4 w-40 mx-auto" />
          </div>

          {/* Token skeletons */}
          <Skeleton className="h-4 w-32" />
          {TOKENS.map(token => (
            <div key={token.symbol} className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <div className="space-y-1">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </div>
                <Skeleton className="h-4 w-14" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="bg-secondary/50 rounded-lg p-2 flex flex-col items-center gap-1">
                    <Skeleton className="h-2 w-10" />
                    <Skeleton className="h-4 w-12" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>

      {/* Main Signal */}
      {signal && cycleResult && (
        <div className="glass-card p-5 text-center space-y-2">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">
            {sk ? 'Akčný signál' : 'Action Signal'}
          </p>
          <p className={`text-3xl font-extrabold ${signal.color}`}>
            {signal.label}
          </p>
          <p className="text-sm text-muted-foreground">{cycleResult.interpretation}</p>
          <p className="text-sm font-medium text-foreground">{cycleResult.guidance}</p>
          <div className="flex items-center justify-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground">Market Cycle Score:</span>
            <span className={`text-lg font-bold ${signal.color}`}>{cycleResult.score}/100</span>
          </div>
        </div>
      )}

      {/* Token Risk Cards */}
      <div className="space-y-2">
        <h2 className="font-semibold text-foreground text-sm">
          {sk ? 'Riziko podľa tokenu' : 'Risk by Token'}
        </h2>

        {TOKENS.map(token => {
          const price = prices?.[token.coingeckoId]?.usd ?? 0;
          const ath = athData?.[token.coingeckoId];
          const athPct = ath?.ath_change_percentage ?? 0;
          const athPrice = ath?.ath ?? 0;
          const change24h = prices?.[token.coingeckoId]?.usd_24h_change ?? 0;
          const maxDownside = getMaxDownside(athPct);
          const uptoPotential = athPrice > 0 && price > 0 ? ((athPrice / price - 1) * 100) : 0;

          return (
            <div key={token.symbol} className="glass-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ backgroundColor: token.color + '20', color: token.color }}
                  >
                    {token.symbol.slice(0, 2)}
                  </div>
                  <div>
                    <span className="font-bold text-foreground">{token.symbol}</span>
                    <p className="text-xs text-muted-foreground">{formatPrice(price)}</p>
                  </div>
                </div>
                <span className={`text-sm font-medium ${change24h >= 0 ? 'text-gain' : 'text-loss'}`}>
                  {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
                </span>
              </div>

              {/* ATH distance bar */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{sk ? 'Od ATH' : 'From ATH'}</span>
                  <span className="text-loss font-medium">{athPct.toFixed(1)}%</span>
                </div>
                <div className="h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(5, 100 + athPct)}%`,
                      backgroundColor: token.color,
                    }}
                  />
                </div>
              </div>

              {/* Risk metrics */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-secondary/50 rounded-lg p-2">
                  <p className="text-[9px] text-muted-foreground">{sk ? 'Do ATH' : 'To ATH'}</p>
                  <p className="text-sm font-bold text-gain flex items-center justify-center gap-0.5">
                    <ArrowUp className="w-3 h-3" />
                    +{uptoPotential.toFixed(0)}%
                  </p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2">
                  <p className="text-[9px] text-muted-foreground">{sk ? 'Max pád' : 'Max Drop'}</p>
                  <p className="text-sm font-bold text-loss flex items-center justify-center gap-0.5">
                    <ArrowDown className="w-3 h-3" />
                    {maxDownside}%
                  </p>
                </div>
                <div className="bg-secondary/50 rounded-lg p-2">
                  <p className="text-[9px] text-muted-foreground">{sk ? 'ATH cena' : 'ATH Price'}</p>
                  <p className="text-xs font-bold text-foreground">{formatPrice(athPrice)}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cycle Indicators */}
      {cycleResult && (
        <div className="glass-card p-4 space-y-2">
          <h2 className="font-semibold text-foreground text-sm">
            {sk ? 'Cyklové indikátory' : 'Cycle Indicators'}
          </h2>
          {cycleResult.indicators.map((ind, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0">
              <span className="text-xs text-muted-foreground">{ind.name}</span>
              <div className="flex items-center gap-2">
                <div className="w-16 h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${ind.score}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-foreground w-8 text-right">{ind.score}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
