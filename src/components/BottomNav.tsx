import { BarChart3, Calculator, Zap, ClipboardList, Shield, Target, Settings, Sparkles, Activity, PieChart, DollarSign, Coins, Wallet, Home, Calculator as CalcIcon } from 'lucide-react';
import { Lang } from '@/lib/i18n';

export type TabId = 'home' | 'overview' | 'portfolio' | 'dca' | 'risk' | 'analysis' | 'market' | 'profit' | 'staking' | 'wallets' | 'allocator' | 'settings';

interface BottomNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  lang: Lang;
  unreadNewsCount?: number;
}

const tabs: { id: TabId; labelSk: string; labelEn: string; icon: typeof BarChart3 }[] = [
  { id: 'home', labelSk: 'Domov', labelEn: 'Home', icon: Home },
  { id: 'overview', labelSk: 'Prehľad', labelEn: 'Overview', icon: BarChart3 },
  { id: 'portfolio', labelSk: 'Portfólio', labelEn: 'Portfolio', icon: PieChart },
  { id: 'dca', labelSk: 'DCA', labelEn: 'DCA', icon: Calculator },
  { id: 'risk', labelSk: 'Riziko', labelEn: 'Risk', icon: Shield },
  { id: 'analysis', labelSk: 'Analýza', labelEn: 'Analysis', icon: Activity },
  { id: 'market', labelSk: 'Trh', labelEn: 'Market', icon: BarChart3 },
  { id: 'profit', labelSk: 'Zisky', labelEn: 'Profit', icon: DollarSign },
  { id: 'staking', labelSk: 'Stake', labelEn: 'Stake', icon: Coins },
  { id: 'wallets', labelSk: 'Wallet', labelEn: 'Wallet', icon: Wallet },
  { id: 'allocator', labelSk: 'Alokátor', labelEn: 'Allocator', icon: CalcIcon },
  { id: 'settings', labelSk: 'Nastav.', labelEn: 'Settings', icon: Settings },
];

export function BottomNav({ active, onChange, lang, unreadNewsCount = 0 }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-nav-bg border-t border-border nav-safe-bottom z-50">
      <div className="flex items-center h-14 max-w-lg mx-auto overflow-x-auto scrollbar-hide">
        {tabs.map(({ id, labelSk, labelEn, icon: Icon }) => {
          const isActive = active === id;
          const showBadge = id === 'home' && unreadNewsCount > 0;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`relative flex flex-col items-center justify-center gap-0.5 shrink-0 min-w-[52px] h-full px-1.5 transition-colors ${
                isActive ? 'text-nav-active' : 'text-nav-inactive'
              }`}
            >
              <div className="relative">
                <Icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold px-1 animate-in zoom-in-50 duration-200">
                    {unreadNewsCount > 9 ? '9+' : unreadNewsCount}
                  </span>
                )}
              </div>
              <span className="text-[9px] font-medium leading-tight">{lang === 'sk' ? labelSk : labelEn}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
