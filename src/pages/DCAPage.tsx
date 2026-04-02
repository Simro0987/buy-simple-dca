import { useState } from 'react';
import { calculateDCA, formatUsd, formatPrice, formatQuantity } from '@/lib/crypto';
import { CopyButton } from '@/components/CopyButton';
import { usePrices } from '@/hooks/usePrices';
import { Lang, t } from '@/lib/i18n';

interface Props { lang: Lang; }

export function DCAPage({ lang }: Props) {
  const [budget, setBudget] = useState(() => {
    return Number(localStorage.getItem('dca-budget')) || 100;
  });
  const { data: prices } = usePrices();

  const results = prices ? calculateDCA(budget, prices) : [];

  const handleBudgetChange = (val: number) => {
    setBudget(val);
    localStorage.setItem('dca-budget', String(val));
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">DCA {t('calculate', lang)}</h1>

      <div className="glass-card p-4">
        <label className="text-sm text-muted-foreground mb-2 block">
          {t('weeklyBudget', lang)} (USD)
        </label>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold text-foreground">$</span>
          <input
            type="number"
            value={budget}
            onChange={e => handleBudgetChange(Number(e.target.value))}
            className="flex-1 bg-secondary text-foreground text-2xl font-bold rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-ring"
            min={0}
            step={10}
          />
        </div>
        <div className="flex gap-2 mt-3">
          {[50, 100, 200, 500].map(v => (
            <button
              key={v}
              onClick={() => handleBudgetChange(v)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                budget === v ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              ${v}
            </button>
          ))}
        </div>
      </div>

      {results.map(r => (
        <div key={r.token.id} className="glass-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ backgroundColor: r.token.color + '20', color: r.token.color }}
              >
                {r.token.symbol.slice(0, 2)}
              </div>
              <div>
                <span className="font-semibold text-foreground">{r.token.symbol}</span>
                <span className="text-xs text-muted-foreground ml-2">{(r.token.allocation * 100)}%</span>
              </div>
            </div>
            <span className="font-bold text-foreground">{formatUsd(r.totalUsd)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{t('marketBuy', lang)} (60%)</p>
              <p className="font-semibold text-foreground">{formatUsd(r.marketUsd)}</p>
              <p className="text-xs text-muted-foreground">{formatQuantity(r.marketQuantity, r.token.symbol)} {r.token.symbol}</p>
            </div>
            <div className="bg-secondary rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{t('limitBuy', lang)} (40%)</p>
              <p className="font-semibold text-foreground">{formatUsd(r.limitUsd)}</p>
              <p className="text-xs text-muted-foreground">{formatQuantity(r.limitQuantity, r.token.symbol)} {r.token.symbol}</p>
            </div>
          </div>

          <div className="flex items-center justify-between bg-secondary rounded-lg p-3">
            <div>
              <p className="text-xs text-muted-foreground">{t('limitPrice', lang)}</p>
              <p className="font-semibold text-foreground">{formatPrice(r.limitPrice)}</p>
              <p className="text-[10px] text-muted-foreground">
                {t('livePrice', lang)}: {formatPrice(r.currentPrice)} × {r.token.limitDiscount}
              </p>
            </div>
            <CopyButton text={r.limitPrice.toFixed(2)} label={t('copy', lang)} />
          </div>
        </div>
      ))}
    </div>
  );
}
