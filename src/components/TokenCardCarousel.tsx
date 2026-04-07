import useEmblaCarousel from 'embla-carousel-react';
import { TOKENS, formatPrice, type PriceData, type AthData, type SparklineData } from '@/lib/crypto';
import { STAKING_CONFIG } from '@/lib/wallets';
import { Lang, t } from '@/lib/i18n';
import { Sparkline } from '@/components/Sparkline';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  prices: PriceData | undefined;
  athData: AthData | undefined;
  sparklines: SparklineData | undefined;
  lang: Lang;
}

export function TokenCardCarousel({ prices, athData, sparklines, lang }: Props) {
  const [emblaRef] = useEmblaCarousel({ loop: false, align: 'center' });

  return (
    <div className="space-y-2">
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex gap-3">
          {TOKENS.map((token, idx) => {
            const price = prices?.[token.coingeckoId]?.usd ?? 0;
            const change = prices?.[token.coingeckoId]?.usd_24h_change;
            const ath = athData?.[token.coingeckoId];
            const sparklineData = sparklines?.[token.coingeckoId];
            const stakingConfig = STAKING_CONFIG.find(s => s.symbol === token.symbol);
            const isPositive = (change ?? 0) >= 0;

            return (
              <div
                key={token.id}
                className="token-card p-5 min-w-[85%] flex-shrink-0 space-y-4 animate-fade-in-up transition-transform duration-200 active:scale-[0.98]"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                {/* Glow accent */}
                <div
                  className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl animate-pulse-glow pointer-events-none"
                  style={{ backgroundColor: token.color + '15' }}
                />

                {/* Header */}
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-sm font-extrabold shadow-lg transition-transform duration-200 hover:scale-110"
                      style={{
                        background: `linear-gradient(135deg, ${token.color}30, ${token.color}60)`,
                        color: token.color,
                        boxShadow: `0 4px 14px ${token.color}25`,
                      }}
                    >
                      {token.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-extrabold text-foreground text-lg tracking-tight">{token.symbol}</p>
                      <p className="text-xs text-muted-foreground font-medium">
                        {(token.allocation * 100).toFixed(0)}% {t('allocation', lang)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground text-lg tabular-nums">{formatPrice(price)}</p>
                    {change !== undefined && (
                      <div className={`flex items-center justify-end gap-1 text-xs font-semibold ${isPositive ? 'text-gain' : 'text-loss'}`}>
                        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isPositive ? '+' : ''}{change.toFixed(2)}%
                      </div>
                    )}
                  </div>
                </div>

                {/* Sparkline */}
                {sparklineData && sparklineData.length > 1 && (
                  <div className="px-1 relative z-10">
                    <div className="rounded-xl bg-secondary/30 p-2">
                      <Sparkline data={sparklineData} height={52} />
                    </div>
                    <p className="text-[9px] text-muted-foreground text-right mt-1 font-medium">7d</p>
                  </div>
                )}

                {/* ATH Distance */}
                {ath && (
                  <div className="relative z-10 rounded-xl bg-secondary/40 px-4 py-3 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">{t('athPrice', lang)}</span>
                    <span className="text-foreground font-semibold tabular-nums">{formatPrice(ath.ath)}</span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded-md text-[11px] ${
                        ath.ath_change_percentage >= -10
                          ? 'bg-gain/15 text-gain'
                          : 'bg-loss/15 text-loss'
                      }`}
                    >
                      {ath.ath_change_percentage.toFixed(1)}%
                    </span>
                  </div>
                )}

                {/* Allocation Breakdown Bar */}
                {stakingConfig && (
                  <div className="space-y-2 relative z-10">
                    <div className="flex rounded-full overflow-hidden h-2.5 bg-secondary/30">
                      {stakingConfig.positions.map((pos, i) => (
                        <div
                          key={i}
                          className="h-full transition-all duration-500 first:rounded-l-full last:rounded-r-full"
                          style={{
                            width: `${pos.percentage}%`,
                            backgroundColor: pos.type === 'hold'
                              ? token.color + '40'
                              : pos.type === 'staking'
                                ? token.color + 'AA'
                                : token.color,
                          }}
                        />
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      {stakingConfig.positions.map((pos, i) => (
                        <span key={i} className="flex items-center gap-1.5 font-medium">
                          <span
                            className="w-2 h-2 rounded-full inline-block ring-1 ring-border"
                            style={{
                              backgroundColor: pos.type === 'hold'
                                ? token.color + '40'
                                : pos.type === 'staking'
                                  ? token.color + 'AA'
                                  : token.color,
                            }}
                          />
                          {pos.label} {pos.percentage}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground text-center font-medium">{t('swipeHint', lang)}</p>
    </div>
  );
}
