import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { BentoCard } from '@/components/portfolio/ui/BentoCard';
import { MoneyLabel, MoneyValue } from '@/components/portfolio/ui/MoneyValue';
import { motion } from 'framer-motion';

interface Props { lang: Lang; }

const scrollToRouter = () => {
  const el = document.getElementById('yield-profit-router');
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('ring-2', 'ring-neon-green', 'rounded-3xl');
    setTimeout(() => el.classList.remove('ring-2', 'ring-neon-green', 'rounded-3xl'), 2000);
  }
};

export function PnLOverviewCard({ lang }: Props) {
  const sk = lang === 'sk';
  const { metrics } = usePortfolio();
  const { totalPnl, totalPnlPct, totalInvested, totalValue, assets } = metrics;

  const isGain = totalPnl >= 0;
  const TotalIcon = isGain ? TrendingUp : TrendingDown;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
      <BentoCard padding="lg" className="overflow-hidden">
        <div className={`h-0.5 ${isGain ? 'bg-gradient-to-r from-neon-green to-emerald-400' : 'bg-gradient-to-r from-red-500 to-rose-400'}`} />

        <div className="flex items-center justify-between mt-4 mb-4">
          <div className="flex items-center gap-2">
            <TotalIcon className={`w-4 h-4 ${isGain ? 'text-gain' : 'text-loss'}`} />
            <span className="text-sm font-semibold text-white">
              {sk ? 'Zisk / Strata portfólia' : 'Portfolio P/L'}
            </span>
          </div>
          <span className="text-[10px] text-white/35">
            {sk ? 'vs. priemerná nákupná cena' : 'vs. avg cost'}
          </span>
        </div>

        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 space-y-3">
          <MoneyLabel>{sk ? 'Celkové P/L' : 'Total P/L'}</MoneyLabel>
          <div className="flex items-baseline justify-between gap-2">
            <MoneyValue size="xl" positive={isGain} negative={!isGain}>
              {isGain ? '+' : ''}{formatUsd(totalPnl)}
            </MoneyValue>
            <MoneyValue size="md" positive={isGain} negative={!isGain}>
              {isGain ? '+' : ''}{totalPnlPct.toFixed(2)}%
            </MoneyValue>
          </div>
          <div className="flex items-center justify-between text-[10px] text-white/40 pt-2 border-t border-white/[0.06]">
            <span>{sk ? 'Investované' : 'Invested'}: <span className="font-mono text-white/70">{formatUsd(totalInvested)}</span></span>
            <span>{sk ? 'Hodnota' : 'Value'}: <span className="font-mono text-white/70">{formatUsd(totalValue)}</span></span>
          </div>
          {isGain && totalPnl > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="w-full h-9 text-[11px] border-neon-green/30 text-neon-green hover:bg-neon-green/10 bg-transparent rounded-xl"
              onClick={scrollToRouter}
            >
              {sk ? 'Presunúť celkový zisk → Yield Profit Router' : 'Move total profit → Yield Profit Router'}
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          )}
        </div>

        <div className="space-y-2 mt-4">
          <MoneyLabel>{sk ? 'Podľa tokenu' : 'By token'}</MoneyLabel>
          {assets.map(a => {
            const aGain = a.pnl >= 0;
            const hasInvest = a.invested > 0;
            const sellTokens = aGain && a.currentPrice > 0 ? a.pnl / a.currentPrice : 0;
            const tokenDecimals = a.symbol === 'BTC' ? 6 : a.symbol === 'ETH' ? 5 : 3;
            return (
              <div
                key={a.symbol}
                className="rounded-2xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5 space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-white w-9">{a.symbol}</span>
                    {hasInvest ? (
                      <span className="text-[10px] text-white/40 font-mono">
                        {sk ? 'Inv' : 'Inv'} {formatUsd(a.invested)} → {formatUsd(a.value)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-white/40">
                        {sk ? 'bez nákupnej ceny' : 'no cost basis'}
                      </span>
                    )}
                  </div>
                  {hasInvest ? (
                    <div className="text-right">
                      <MoneyValue size="sm" positive={aGain} negative={!aGain} className="text-xs">
                        {aGain ? '+' : ''}{formatUsd(a.pnl)}
                      </MoneyValue>
                      <p className={`text-[10px] font-mono tabular-nums ${aGain ? 'text-gain' : 'text-loss'}`}>
                        {aGain ? '+' : ''}{a.pnlPct.toFixed(2)}%
                      </p>
                    </div>
                  ) : (
                    <span className="text-[10px] text-white/40">—</span>
                  )}
                </div>
                {hasInvest && aGain && a.pnl > 0 && sellTokens > 0 && (
                  <div className="rounded-xl bg-neon-green/10 border border-neon-green/20 px-2.5 py-2 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-white/40">
                      {sk ? 'Predaj na zafixovanie zisku' : 'Sell to lock profit'}
                    </span>
                    <div className="text-right">
                      <p className="text-xs font-mono font-bold tabular-nums text-gain">
                        {sellTokens.toFixed(tokenDecimals)} {a.symbol}
                      </p>
                      <p className="text-[10px] font-mono tabular-nums text-gain/80">
                        ≈ {formatUsd(a.pnl)} @ {formatUsd(a.currentPrice)}
                      </p>
                    </div>
                  </div>
                )}
                {hasInvest && aGain && a.pnl > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full h-7 text-[10px] text-neon-green hover:bg-neon-green/10 hover:text-neon-green rounded-xl"
                    onClick={scrollToRouter}
                  >
                    {sk ? `Presunúť zisk z ${a.symbol} do Yield Profit Router` : `Move ${a.symbol} profit to Yield Profit Router`}
                    <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-white/30 text-center mt-3">
          {sk
            ? 'P/L = aktuálna hodnota − investované (DCA + počiatočná nákupná cena).'
            : 'P/L = current value − invested (DCA + initial cost basis).'}
        </p>
      </BentoCard>
    </motion.div>
  );
}
