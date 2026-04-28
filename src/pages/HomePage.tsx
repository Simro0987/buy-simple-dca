import { PieChart, Calculator, Sparkles, Zap, ClipboardList, Target, Shield, Activity, BarChart3, DollarSign, Coins, Settings, Wallet } from 'lucide-react';
import { TabId } from '@/components/BottomNav';
import { PriorityDashboard } from '@/components/PriorityDashboard';
import { TopSignals } from '@/components/decision/TopSignals';
import { TodayDecisions } from '@/components/decision/TodayDecisions';
import { PortfolioSummaryCard } from '@/components/dashboard/PortfolioSummaryCard';
import { AssetCardsRow } from '@/components/dashboard/AssetCardsRow';
import { AllocationDonut } from '@/components/dashboard/AllocationDonut';
import { PerformanceLineChart } from '@/components/dashboard/PerformanceLineChart';
import { RebalanceCheckCard } from '@/components/dashboard/RebalanceCheckCard';
import { usePrices } from '@/hooks/usePrices';
import { usePortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Lang } from '@/lib/i18n';

interface Props {
  onNavigate: (tab: TabId) => void;
  lang: Lang;
}

interface HubCard {
  id: TabId;
  label: string;
  desc: string;
  icon: typeof PieChart;
  gradient: string;
}

const CARDS: HubCard[] = [
  { id: 'portfolio', label: 'Portfólio', desc: 'Hodnota & alokácia', icon: PieChart, gradient: 'from-primary/20 to-primary/5' },
  { id: 'dca', label: 'DCA', desc: 'Týždenný plán', icon: Calculator, gradient: 'from-emerald-500/20 to-emerald-500/5' },
  { id: 'smart', label: 'Smart Alloc', desc: 'Inteligentná alokácia', icon: Sparkles, gradient: 'from-violet-500/20 to-violet-500/5' },
  { id: 'action', label: 'Akcia', desc: 'Dnešné kroky', icon: Zap, gradient: 'from-amber-500/20 to-amber-500/5' },
  { id: 'checklist', label: 'Checklist', desc: 'Pondelková rutina', icon: ClipboardList, gradient: 'from-blue-500/20 to-blue-500/5' },
  { id: 'execution', label: 'Skóre', desc: 'Disciplína', icon: Target, gradient: 'from-cyan-500/20 to-cyan-500/5' },
  { id: 'risk', label: 'Riziko', desc: 'BUY/HOLD/EXIT', icon: Shield, gradient: 'from-rose-500/20 to-rose-500/5' },
  { id: 'analysis', label: 'Analýza', desc: 'Technická analýza', icon: Activity, gradient: 'from-indigo-500/20 to-indigo-500/5' },
  { id: 'market', label: 'Trh', desc: 'Cyklus & sentiment', icon: BarChart3, gradient: 'from-teal-500/20 to-teal-500/5' },
  { id: 'profit', label: 'Zisky', desc: 'PnL & profit-taking', icon: DollarSign, gradient: 'from-emerald-500/20 to-emerald-500/5' },
  { id: 'staking', label: 'Staking', desc: 'ETH & SOL výnosy', icon: Coins, gradient: 'from-yellow-500/20 to-yellow-500/5' },
  { id: 'wallets', label: 'Wallety', desc: 'On-chain balance', icon: Wallet, gradient: 'from-orange-500/20 to-orange-500/5' },
  { id: 'settings', label: 'Nastavenia', desc: 'Telegram & alerty', icon: Settings, gradient: 'from-muted to-muted/30' },
];

export function HomePage({ onNavigate, lang }: Props) {
  const { data: prices } = usePrices();
  const { data: settings } = useAppSettings();
  const metrics = usePortfolioMetrics(prices);
  const weeklyCapital = Number(settings?.default_amount ?? 0);
  const cashReserve = Math.max(0, Number(settings?.total_capital ?? 0) - metrics.totalInvested);

  return (
    <div className="space-y-3">
      <PortfolioSummaryCard metrics={metrics} weeklyCapital={weeklyCapital} cashReserve={cashReserve} />
      <AssetCardsRow metrics={metrics} prices={prices} />
      <div className="grid grid-cols-1 gap-3">
        <AllocationDonut metrics={metrics} />
        <PerformanceLineChart metrics={metrics} prices={prices} />
        <RebalanceCheckCard metrics={metrics} thresholdPct={Number(settings?.rebalance_threshold ?? 5)} />
      </div>

      <TopSignals lang={lang} />
      <PriorityDashboard />
      <TodayDecisions lang={lang} />

      <div>
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 px-1">Sekcie</h2>
        <div className="grid grid-cols-2 gap-2">
          {CARDS.map(card => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                onClick={() => onNavigate(card.id)}
                className={`group relative overflow-hidden glass-card p-3 text-left transition-all active:scale-[0.97] hover:border-primary/40 bg-gradient-to-br ${card.gradient}`}
              >
                <Icon className="w-5 h-5 text-foreground mb-2" />
                <p className="text-sm font-bold text-foreground leading-tight">{card.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{card.desc}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
