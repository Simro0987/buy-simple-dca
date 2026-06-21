import { Sparkles, X } from 'lucide-react';
import { motion } from 'framer-motion';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { formatUsd } from '@/lib/crypto';
import { TOKENS } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import { BentoCard } from '@/components/portfolio/ui/BentoCard';
import { MoneyLabel, MoneyValue } from '@/components/portfolio/ui/MoneyValue';

export function StickyPortfolioHeader({ lang }: { lang: Lang }) {
  const sk = lang === 'sk';
  const {
    metrics, totalStakedValue, blendedApy,
    profitAvailable, selected, setSelected, toggleSelected,
  } = usePortfolio();

  return (
    <div className="sticky top-0 z-30 -mx-4 px-4 py-2">
      <BentoCard padding="sm" className="backdrop-blur-xl bg-[#050505]/90 border-white/[0.08]">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <MoneyLabel>{sk ? 'Portfólio (vrátane stake)' : 'Portfolio (incl. staking)'}</MoneyLabel>
            <MoneyValue size="xl" className="mt-1 block">
              {formatUsd(metrics.totalValue)}
            </MoneyValue>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[10px] text-white/40">
              {sk ? 'Stake' : 'Staked'}
            </p>
            <p className="font-mono text-xs font-semibold text-white/70 tabular-nums">
              {formatUsd(totalStakedValue)}
            </p>
            <p className="text-[10px] text-neon-green font-mono">~{blendedApy.toFixed(1)}% APY</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 mt-3 overflow-x-auto scrollbar-hide">
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[10px] text-white/40 shrink-0 flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3 text-neon-green" />
            {sk ? 'Profit' : 'Profit'}:{' '}
            <span className="font-mono font-semibold text-white">{formatUsd(profitAvailable)}</span>
          </motion.span>
          <div className="flex-1" />
          {TOKENS.map(t => {
            const active = selected === t.symbol;
            return (
              <button
                key={t.symbol}
                onClick={() => toggleSelected(t.symbol as 'BTC' | 'ETH' | 'SOL')}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all shrink-0 ${
                  active
                    ? 'border-neon-green bg-neon-green/15 text-neon-green'
                    : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20'
                }`}
                style={!active ? { borderColor: t.color + '30' } : undefined}
              >
                {t.symbol}
              </button>
            );
          })}
          {selected && (
            <button
              onClick={() => setSelected(null)}
              className="text-white/40 p-1 shrink-0 hover:text-white/70"
              aria-label="Clear"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </BentoCard>
    </div>
  );
}
