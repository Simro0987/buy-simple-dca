import { BarChart3, Calculator, Zap, ClipboardList, Shield, Target, Settings, Sparkles, Activity, PieChart, DollarSign, Coins, Wallet, Home, Repeat, Bot } from 'lucide-react';
import { Lang } from '@/lib/i18n';

export type TabId = 'home' | 'overview' | 'portfolio' | 'dca' | 'swap' | 'risk' | 'analysis' | 'market' | 'profit' | 'staking' | 'wallets' | 'agent' | 'settings';

interface BottomNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  lang: Lang;
  unreadNewsCount?: number;
}

const tabs: { id: TabId; labelSk: string; labelEn: string; icon: typeof BarChart3 }[] = [
  { id: 'home', labelSk: 'Domov', labelEn: 'Home', icon: Home },
  { id: 'overview', labelSk: 'Noviny', labelEn: 'Noviny', icon: BarChart3 },
  { id: 'portfolio', labelSk: 'Portfólio', labelEn: 'Portfolio', icon: PieChart },
  { id: 'dca', labelSk: 'DCA', labelEn: 'DCA', icon: Calculator },
  { id: 'swap', labelSk: 'Swap', labelEn: 'Swap', icon: Repeat },
  { id: 'analysis', labelSk: 'Analýza & Riziko', labelEn: 'Analysis & Risk', icon: Activity },
  { id: 'staking', labelSk: 'Stake', labelEn: 'Stake', icon: Coins },
  { id: 'wallets', labelSk: 'Wallet', labelEn: 'Wallet', icon: Wallet },
  { id: 'agent', labelSk: 'AI Agent', labelEn: 'AI Agent', icon: Bot },
  { id: 'settings', labelSk: 'Nastav.', labelEn: 'Settings', icon: Settings },
];

export function BottomNav({ active, onChange, lang, unreadNewsCount = 0 }: BottomNavProps) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 nav-safe-bottom z-50"
      style={{
        background: 'rgba(0, 0, 0, 0.55)',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
      }}
    >
      <div className="flex items-stretch h-[58px] max-w-lg mx-auto overflow-x-auto scrollbar-hide">
        {tabs.map(({ id, labelSk, labelEn, icon: Icon }) => {
          const isActive = active === id;
          const showBadge = id === 'home' && unreadNewsCount > 0;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className="relative flex flex-col items-center justify-center gap-[3px] shrink-0 min-w-[52px] h-full px-1 transition-all duration-200"
              style={{ color: isActive ? '#14F195' : 'rgba(255,255,255,0.30)' }}
            >
              {/* Active top-line indicator */}
              {isActive && (
                <span
                  className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-b-full"
                  style={{ background: '#14F195', boxShadow: '0 0 8px 2px #14F19580' }}
                />
              )}

              {/* Icon */}
              <div className="relative">
                <Icon
                  className="transition-all duration-200"
                  style={{
                    width: isActive ? 17 : 15,
                    height: isActive ? 17 : 15,
                    strokeWidth: isActive ? 2.2 : 1.6,
                    filter: isActive ? 'drop-shadow(0 0 6px #14F19560)' : 'none',
                  }}
                />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-rose-500 text-white text-[8px] font-bold px-1">
                    {unreadNewsCount > 9 ? '9+' : unreadNewsCount}
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                className="text-[8px] font-semibold leading-none tracking-wide transition-all duration-200"
                style={{ opacity: isActive ? 1 : 0.45, letterSpacing: isActive ? '0.03em' : '0.01em' }}
              >
                {lang === 'sk' ? labelSk : labelEn}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
