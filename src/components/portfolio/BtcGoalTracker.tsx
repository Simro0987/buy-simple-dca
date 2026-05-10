import { useMemo } from 'react';
import { Bitcoin } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { usePortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { usePrices } from '@/hooks/usePrices';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Lang } from '@/lib/i18n';

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
    <div className="glass-card p-4 space-y-3" style={{ borderLeft: '3px solid #F7931A' }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bitcoin className="w-4 h-4" style={{ color: '#F7931A' }} />
          <span className="text-sm font-semibold text-foreground">
            {sk ? 'Cesta k 1 BTC' : 'Path to 1 BTC'}
          </span>
        </div>
        <span className="text-xs font-bold tabular-nums" style={{ color: '#F7931A' }}>
          {data.totalBtcEquivalent.toFixed(4)} ₿
        </span>
      </div>

      <div className="space-y-1">
        <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${data.progress}%`, backgroundColor: '#F7931A' }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>0 ₿</span>
          <span className="font-semibold text-foreground">{data.progress.toFixed(1)}%</span>
          <span>1 ₿</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-secondary/40 rounded-md p-2">
          <p className="text-[9px] uppercase text-muted-foreground">{sk ? 'Priame BTC' : 'Direct BTC'}</p>
          <p className="text-xs font-bold text-foreground tabular-nums">{data.directBtc.toFixed(4)}</p>
        </div>
        <div className="bg-secondary/40 rounded-md p-2">
          <p className="text-[9px] uppercase text-muted-foreground">{sk ? 'Z ETH/SOL' : 'From others'}</p>
          <p className="text-xs font-bold text-foreground tabular-nums">{data.fromOthers.toFixed(4)}</p>
        </div>
        <div className="bg-secondary/40 rounded-md p-2">
          <p className="text-[9px] uppercase text-muted-foreground">{sk ? 'Chýba' : 'Remaining'}</p>
          <p className="text-xs font-bold text-foreground tabular-nums">{data.remainingBtc.toFixed(4)}</p>
        </div>
      </div>

      {data.weeksToGoal !== null && data.remainingBtc > 0 && (
        <p className="text-[10px] text-center text-muted-foreground">
          {sk ? 'ETA pri aktuálnom DCA tempe: ' : 'ETA at current DCA pace: '}
          <span className="text-foreground font-semibold">
            ~{data.weeksToGoal} {sk ? 'týždňov' : 'weeks'}
            {data.weeksToGoal >= 52 && ` (~${(data.weeksToGoal / 52).toFixed(1)} ${sk ? 'rokov' : 'years'})`}
          </span>
        </p>
      )}
    </div>
  );
}
