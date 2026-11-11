import { useMemo } from 'react';
import { Bitcoin } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { usePrices } from '@/hooks/usePrices';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Lang } from '@/lib/i18n';
import { BentoCard, BentoStat } from '@/components/portfolio/ui/BentoCard';

interface Props { lang: Lang; }

const GOAL_BTC = 1;

export function BtcGoalTracker({ lang }: Props) {
  const sk = lang === 'sk';
  const { metrics } = usePortfolio();
  const { data: prices } = usePrices();
  const { data: settings } = useAppSettings();

  const data = useMemo(() => {
    const btcPrice = prices?.bitcoin?.usd ?? 0;
    if (btcPrice <= 0) return null;
    const totalBtcEquivalent = metrics.totalValue / btcPrice;
    const btcAsset = metrics.assets.find(a => a.symbol === 'BTC');
    const directBtc = btcAsset?.holdings ?? 0;
    const fromOthers = Math.max(0, totalBtcEquivalent - directBtc);

    const weeklyUsd = Number(settings?.default_amount ?? 0);
    const remainingBtc = Math.max(0, GOAL_BTC - totalBtcEquivalent);
    const weeklyBtc = btcPrice > 0 ? weeklyUsd / btcPrice : 0;
    const weeksToGoal = weeklyBtc > 0 ? Math.ceil(remainingBtc / weeklyBtc) : null;

    return {
      btcPrice, totalBtcEquivalent, directBtc, fromOthers,
      remainingBtc, weeksToGoal,
      progress: Math.min(100, (totalBtcEquivalent / GOAL_BTC) * 100),
    };
  }, [metrics, prices, settings]);

  if (!data) return null;

  return (
    <BentoCard accentColor="#F7931A" padding="md" className="space-y-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bitcoin className="w-4 h-4 text-[#F7931A]" />
          <span className="text-sm font-semibold text-white">
            {sk ? 'Cesta k 1 BTC' : 'Path to 1 BTC'}
          </span>
        </div>
        <span className="font-mono text-xs font-bold tabular-nums text-[#F7931A]">
          {data.totalBtcEquivalent.toFixed(4)} ₿
        </span>
      </div>

      <div className="space-y-1.5">
        <div className="w-full bg-white/[0.06] rounded-full h-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${data.progress}%`, backgroundColor: '#F7931A' }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-white/35 font-mono">
          <span>0 ₿</span>
          <span className="font-semibold text-white/70">{data.progress.toFixed(1)}%</span>
          <span>1 ₿</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <BentoStat label={sk ? 'Priame BTC' : 'Direct BTC'} value={data.directBtc.toFixed(4)} />
        <BentoStat label={sk ? 'Z ETH/SOL' : 'From others'} value={data.fromOthers.toFixed(4)} />
        <BentoStat label={sk ? 'Chýba' : 'Remaining'} value={data.remainingBtc.toFixed(4)} />
      </div>

      {data.weeksToGoal !== null && data.remainingBtc > 0 && (
        <p className="text-[10px] text-center text-white/35">
          {sk ? 'ETA pri aktuálnom DCA tempe: ' : 'ETA at current DCA pace: '}
          <span className="text-white/70 font-semibold">
            ~{data.weeksToGoal} {sk ? 'týždňov' : 'weeks'}
            {data.weeksToGoal >= 52 && ` (~${(data.weeksToGoal / 52).toFixed(1)} ${sk ? 'rokov' : 'years'})`}
          </span>
        </p>
      )}
    </BentoCard>
  );
}
