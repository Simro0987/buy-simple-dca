import { PieChart, Calculator, Shield, Activity, BarChart3, DollarSign, Coins, Settings, Wallet } from 'lucide-react';
import { TabId } from '@/components/BottomNav';
import { AssetCardsRow } from '@/components/dashboard/AssetCardsRow';
import { PerformanceLineChart } from '@/components/dashboard/PerformanceLineChart';
import { usePrices } from '@/hooks/usePrices';
import { usePortfolioMetrics } from '@/hooks/usePortfolioMetrics';
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
  { id: 'risk', label: 'Riziko', desc: 'BUY/HOLD/EXIT', icon: Shield, gradient: 'from-rose-500/20 to-rose-500/5' },
  { id: 'analysis', label: 'Analýza', desc: 'Technická analýza', icon: Activity, gradient: 'from-indigo-500/20 to-indigo-500/5' },
  { id: 'market', label: 'Trh', desc: 'Cyklus & sentiment', icon: BarChart3, gradient: 'from-teal-500/20 to-teal-500/5' },
  { id: 'profit', label: 'Zisky', desc: 'PnL & profit-taking', icon: DollarSign, gradient: 'from-emerald-500/20 to-emerald-500/5' },
  { id: 'staking', label: 'Staking', desc: 'ETH & SOL výnosy', icon: Coins, gradient: 'from-yellow-500/20 to-yellow-500/5' },
  { id: 'wallets', label: 'Wallety', desc: 'On-chain balance', icon: Wallet, gradient: 'from-orange-500/20 to-orange-500/5' },
  { id: 'allocator', label: 'Alokátor', desc: 'Hold/Stake/Lend', icon: Calculator, gradient: 'from-fuchsia-500/20 to-fuchsia-500/5' },
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
      <AssetCardsRow metrics={metrics} prices={prices} />
      <PerformanceLineChart metrics={metrics} prices={prices} />

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
