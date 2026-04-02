import { Lang, t } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';

interface Props {
  btcPrice: number;
  lang: Lang;
}

export function BtcAccumulationCard({ btcPrice, lang }: Props) {
  // Read from localStorage for now (manual tracking)
  const totalBtc = parseFloat(localStorage.getItem('btc-total') || '0');
  const monthlyBtc = parseFloat(localStorage.getItem('btc-monthly') || '0');
  const yieldBtc = parseFloat(localStorage.getItem('btc-from-yields') || '0');

  const totalUsd = totalBtc * btcPrice;

  return (
    <div className="glass-card p-4 space-y-3" style={{ borderLeft: '3px solid #F7931A' }}>
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
          style={{ backgroundColor: '#F7931A20', color: '#F7931A' }}>₿</span>
        {t('btcAccumulation', lang)}
      </h3>

      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-[10px] text-muted-foreground">{t('totalBtc', lang)}</p>
          <p className="text-sm font-bold text-foreground">{totalBtc.toFixed(8)}</p>
          <p className="text-[10px] text-muted-foreground">{formatUsd(totalUsd)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">{t('thisMonth', lang)}</p>
          <p className="text-sm font-bold text-gain">+{monthlyBtc.toFixed(8)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground">{t('fromYields', lang)}</p>
          <p className="text-sm font-bold text-foreground">{yieldBtc.toFixed(8)}</p>
        </div>
      </div>

      {/* Simple accumulation progress bar */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0 BTC</span>
          <span>1 BTC</span>
        </div>
        <div className="w-full bg-secondary rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all"
            style={{
              width: `${Math.min(totalBtc * 100, 100)}%`,
              backgroundColor: '#F7931A',
            }}
          />
        </div>
      </div>
    </div>
  );
}
