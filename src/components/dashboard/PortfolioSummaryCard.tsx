import { Wallet } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';
import type { PortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { Skeleton } from '@/components/ui/skeleton';
import { BentoCard, BentoStat } from '@/components/portfolio/ui/BentoCard';
import { MoneyLabel, MoneyValue } from '@/components/portfolio/ui/MoneyValue';
import { motion } from 'framer-motion';

interface Props {
  metrics: PortfolioMetrics;
  weeklyCapital: number;
  cashReserve: number;
}

export function PortfolioSummaryCard({ metrics, weeklyCapital, cashReserve }: Props) {
  if (metrics.loading) {
    return (
      <BentoCard padding="lg" className="space-y-3">
        <Skeleton className="h-4 w-32 bg-white/10" />
        <Skeleton className="h-12 w-48 bg-white/10" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-14 bg-white/10" />
          <Skeleton className="h-14 bg-white/10" />
          <Skeleton className="h-14 bg-white/10" />
        </div>
      </BentoCard>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <BentoCard padding="lg">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-3.5 h-3.5 text-neon-green" />
          <MoneyLabel>Hodnota portfólia · USD</MoneyLabel>
        </div>

        <MoneyValue size="hero" className="block">
          {formatUsd(metrics.totalValue)}
        </MoneyValue>

        <div className="grid grid-cols-3 gap-2 mt-5">
          <BentoStat label="Investované" value={formatUsd(metrics.totalInvested)} />
          <BentoStat label="Týž. kapitál" value={formatUsd(weeklyCapital)} />
          <BentoStat label="Hot. rezerva" value={formatUsd(cashReserve)} />
        </div>
      </BentoCard>
    </motion.div>
  );
}
