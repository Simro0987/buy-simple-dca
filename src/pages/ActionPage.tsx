import { useState } from 'react';
import { calculateDCA, formatUsd, formatPrice, formatQuantity } from '@/lib/crypto';
import { CopyButton } from '@/components/CopyButton';
import { usePrices } from '@/hooks/usePrices';
import { Lang, t } from '@/lib/i18n';
import { Zap } from 'lucide-react';

interface Props { lang: Lang; }

export function ActionPage({ lang }: Props) {
  const { data: prices } = usePrices();
  const budget = Number(localStorage.getItem('dca-budget')) || 100;
  const results = prices ? calculateDCA(budget, prices) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Zap className="w-5 h-5 text-primary" />
        <h1 className="text-xl font-bold text-foreground">{t('executionInstructions', lang)}</h1>
      </div>

      {results.map(r => (
        <div key={r.token.id} className="glass-card p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ backgroundColor: r.token.color + '20', color: r.token.color }}
            >
              {r.token.symbol.slice(0, 2)}
            </div>
            <span className="font-bold text-foreground">{r.token.symbol}</span>
          </div>

          {/* Market order instruction */}
          <div className="bg-secondary rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-gain font-semibold" style={{ color: 'hsl(var(--background))' }}>
                {t('marketOrder', lang)}
              </span>
            </div>
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">{t('whatToBuy', lang)}:</span> <span className="font-semibold text-foreground">{r.token.symbol}</span></p>
              <p><span className="text-muted-foreground">{t('usdAmount', lang)}:</span> <span className="font-semibold text-foreground">{formatUsd(r.marketUsd)}</span></p>
              <p><span className="text-muted-foreground">{t('quantity', lang)}:</span> <span className="font-semibold text-foreground">{formatQuantity(r.marketQuantity, r.token.symbol)}</span></p>
              <p><span className="text-muted-foreground">{t('orderType', lang)}:</span> <span className="font-semibold text-gain">{t('buyNow', lang)}</span></p>
            </div>
            <div className="flex gap-2 pt-1">
              <CopyButton text={`${r.token.symbol} Market Buy ${formatUsd(r.marketUsd)} (${formatQuantity(r.marketQuantity, r.token.symbol)} ${r.token.symbol})`} label={t('copy', lang)} />
            </div>
          </div>

          {/* Limit order instruction */}
          <div className="bg-secondary rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning font-semibold" style={{ color: 'hsl(var(--background))' }}>
                {t('limitOrder', lang)}
              </span>
            </div>
            <div className="space-y-1 text-sm">
              <p><span className="text-muted-foreground">{t('whatToBuy', lang)}:</span> <span className="font-semibold text-foreground">{r.token.symbol}</span></p>
              <p><span className="text-muted-foreground">{t('usdAmount', lang)}:</span> <span className="font-semibold text-foreground">{formatUsd(r.limitUsd)}</span></p>
              <p><span className="text-muted-foreground">{t('quantity', lang)}:</span> <span className="font-semibold text-foreground">{formatQuantity(r.limitQuantity, r.token.symbol)}</span></p>
              <p><span className="text-muted-foreground">{t('atPrice', lang)}:</span> <span className="font-semibold text-warning">{formatPrice(r.limitPrice)}</span></p>
              <p><span className="text-muted-foreground">{t('orderType', lang)}:</span> <span className="font-semibold text-warning">{t('setLimitAt', lang)} {formatPrice(r.limitPrice)}</span></p>
            </div>
            <div className="flex gap-2 pt-1">
              <CopyButton text={`${r.token.symbol} Limit Buy ${formatUsd(r.limitUsd)} @ ${formatPrice(r.limitPrice)} (${formatQuantity(r.limitQuantity, r.token.symbol)} ${r.token.symbol})`} label={t('copy', lang)} />
              <CopyButton text={r.limitPrice.toFixed(2)} label={t('limitPrice', lang)} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
