import { Sparkles, X } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { formatUsd } from '@/lib/crypto';
import { TOKENS } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';

export function StickyPortfolioHeader({ lang }: { lang: Lang }) {
  const sk = lang === 'sk';
  const {
    metrics, totalStakedValue, blendedApy,
    profitAvailable, selected, setSelected, toggleSelected,
  } = usePortfolio();

  return (
    <div className="sticky top-0 z-30 -mx-4 px-4 py-2 bg-background/85 backdrop-blur border-b border-border">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {sk ? 'Portfólio (vrátane stake)' : 'Portfolio (incl. staking)'}
          </p>
          <p className="text-base font-bold text-foreground leading-tight">
            {formatUsd(metrics.totalValue)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground">
            {sk ? 'Stake' : 'Staked'} {formatUsd(totalStakedValue)} · ~{blendedApy.toFixed(1)}% APY
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2 overflow-x-auto">
        <span className="text-[10px] text-muted-foreground shrink-0 mr-1">
          <Sparkles className="w-3 h-3 inline mr-0.5 text-primary" />
          {sk ? 'Profit' : 'Profit'}: <span className="text-foreground font-semibold">{formatUsd(profitAvailable)}</span>
        </span>
        <div className="flex-1" />
        {TOKENS.map(t => {
          const active = selected === t.symbol;
          return (
            <button
              key={t.symbol}
              onClick={() => toggleSelected(t.symbol as 'BTC' | 'ETH' | 'SOL')}
              className={`text-[10px] font-medium px-2 py-1 rounded-full border transition shrink-0 ${
                active
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground'
              }`}
              style={active ? undefined : { borderColor: t.color + '40' }}
            >
              {t.symbol}
            </button>
          );
        })}
        {selected && (
          <button
            onClick={() => setSelected(null)}
            className="text-[10px] text-muted-foreground p-1 shrink-0"
            aria-label="Clear"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
}
