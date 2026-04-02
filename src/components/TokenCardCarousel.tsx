import useEmblaCarousel from 'embla-carousel-react';
import { TOKENS, formatPrice, formatUsd, type PriceData, type AthData, type SparklineData } from '@/lib/crypto';
import { STAKING_CONFIG } from '@/lib/wallets';
import { Lang, t } from '@/lib/i18n';
import { Sparkline } from '@/components/Sparkline';

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
          {TOKENS.map(token => {
            const price = prices?.[token.coingeckoId]?.usd ?? 0;
            const change = prices?.[token.coingeckoId]?.usd_24h_change;
            const ath = athData?.[token.coingeckoId];
            const sparklineData = sparklines?.[token.coingeckoId];
            const stakingConfig = STAKING_CONFIG.find(s => s.symbol === token.symbol);
            const isPositive = (change ?? 0) >= 0;

            return (
              <div
                key={token.id}
                className="glass-card p-4 min-w-[85%] flex-shrink-0 space-y-3"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold"
                      style={{ backgroundColor: token.color + '20', color: token.color }}
                    >
                      {token.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-bold text-foreground text-lg">{token.symbol}</p>
                      <p className="text-xs text-muted-foreground">{(token.allocation * 100).toFixed(0)}% {t('allocation', lang)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-foreground">{formatPrice(price)}</p>
                    {change !== undefined && (
                      <p className={`text-xs font-medium ${isPositive ? 'text-gain' : 'text-loss'}`}>
                        {isPositive ? '+' : ''}{change.toFixed(2)}%
                      </p>
                    )}
                  </div>
                </div>

                {/* Sparkline */}
                {sparklineData && sparklineData.length > 1 && (
                  <div className="px-1">
                    <Sparkline data={sparklineData} height={48} />
                    <p className="text-[9px] text-muted-foreground text-right mt-0.5">7d</p>
                  </div>
                )}

                {/* ATH Distance */}
                {ath && (
                  <div className="flex items-center justify-between text-xs bg-secondary/50 rounded-lg px-3 py-2">
                    <span className="text-muted-foreground">{t('athPrice', lang)}</span>
                    <span className="text-foreground font-medium">{formatPrice(ath.ath)}</span>
                    <span className={`font-bold ${ath.ath_change_percentage >= -10 ? 'text-gain' : 'text-loss'}`}>
                      {ath.ath_change_percentage.toFixed(1)}%
                    </span>
                  </div>
                )}

                {/* Allocation Breakdown Bar */}
                {stakingConfig && (
                  <div className="space-y-1.5">
                    <div className="flex rounded-full overflow-hidden h-2">
                      {stakingConfig.positions.map((pos, i) => (
                        <div
                          key={i}
                          className="h-full"
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
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      {stakingConfig.positions.map((pos, i) => (
                        <span key={i} className="flex items-center gap-1">
                          <span
                            className="w-1.5 h-1.5 rounded-full inline-block"
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
      <p className="text-[10px] text-muted-foreground text-center">{t('swipeHint', lang)}</p>
    </div>
  );
}
