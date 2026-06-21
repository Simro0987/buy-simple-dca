import { Home, Newspaper, PieChart, Calculator, Activity, Coins, Wallet, Settings, BarChart3, Shield, DollarSign } from 'lucide-react';
import { TabId } from '@/components/BottomNav';
import { Lang } from '@/lib/i18n';

interface SidebarItem {
  id: TabId;
  labelSk: string;
  icon: typeof Home;
}

const ITEMS: SidebarItem[] = [
  { id: 'home',      labelSk: 'Domov',    icon: Home       },
  { id: 'overview',  labelSk: 'Noviny',   icon: Newspaper  },
  { id: 'portfolio', labelSk: 'Portfólio', icon: PieChart  },
  { id: 'dca',       labelSk: 'DCA',      icon: Calculator },
  { id: 'risk',      labelSk: 'Riziko',   icon: Shield     },
  { id: 'analysis',  labelSk: 'Analýza',  icon: Activity   },
  { id: 'market',    labelSk: 'Trh',      icon: BarChart3  },
  { id: 'profit',    labelSk: 'Zisky',    icon: DollarSign },
  { id: 'staking',   labelSk: 'Staking',  icon: Coins      },
  { id: 'wallets',   labelSk: 'Wallety',  icon: Wallet     },
  { id: 'settings',  labelSk: 'Nastav.',  icon: Settings   },
];

interface Props {
  active: TabId;
  onChange: (tab: TabId) => void;
  lang: Lang;
}

export function AppSidebar({ active, onChange }: Props) {
  return (
    <aside
      className="hidden md:flex flex-col fixed left-0 top-0 h-full z-40 py-3 gap-0.5"
      style={{
        width: 52,
        backgroundColor: '#050508',
        borderRight: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Brand mark */}
      <div className="flex justify-center mb-3 px-1.5">
        <div
          className="w-8 h-8 rounded flex items-center justify-center text-[10px] font-bold"
          style={{
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.25)',
            color: 'hsl(142 65% 42%)',
          }}
        >
          ET
        </div>
      </div>

      {/* Thin divider */}
      <div className="mx-2 mb-2 h-px bg-white/5" />

      {/* Nav items */}
      {ITEMS.map(item => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            title={item.labelSk}
            className="flex flex-col items-center justify-center gap-0.5 mx-1.5 py-2 rounded transition-all"
            style={{
              border: isActive
                ? '1px solid rgba(34,197,94,0.28)'
                : '1px solid transparent',
              background: isActive
                ? 'rgba(34,197,94,0.10)'
                : 'transparent',
              color: isActive
                ? 'hsl(142 65% 42%)'
                : 'rgba(255,255,255,0.28)',
            }}
            onMouseEnter={e => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.65)';
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
              }
            }}
            onMouseLeave={e => {
              if (!isActive) {
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.28)';
                (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
              }
            }}
          >
            <Icon
              className="w-[15px] h-[15px]"
              strokeWidth={isActive ? 2.5 : 1.8}
            />
            <span
              className="text-[6.5px] font-semibold leading-none truncate max-w-[44px] text-center"
              style={{ opacity: 0.7 }}
            >
              {item.labelSk}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
