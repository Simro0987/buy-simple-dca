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

const NEON = '#14F195';

export function AppSidebar({ active, onChange }: Props) {
  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full z-40 py-3 gap-0.5 w-[52px] bg-[#050505] border-r border-white/[0.06]">
      <div className="flex justify-center mb-3 px-1.5">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-bold"
          style={{
            background: 'rgba(20,241,149,0.10)',
            border: '1px solid rgba(20,241,149,0.25)',
            color: NEON,
          }}
        >
          ET
        </div>
      </div>

      <div className="mx-2 mb-2 h-px bg-white/[0.06]" />

      {ITEMS.map(item => {
        const Icon = item.icon;
        const isActive = active === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            title={item.labelSk}
            className="flex flex-col items-center justify-center gap-0.5 mx-1.5 py-2 rounded-xl transition-all"
            style={{
              border: isActive ? '1px solid rgba(20,241,149,0.30)' : '1px solid transparent',
              background: isActive ? 'rgba(20,241,149,0.08)' : 'transparent',
              color: isActive ? NEON : 'rgba(255,255,255,0.28)',
              boxShadow: isActive ? '0 0 16px -4px rgba(20,241,149,0.35)' : 'none',
            }}
          >
            <Icon className="w-[15px] h-[15px]" strokeWidth={isActive ? 2.5 : 1.8} />
            <span className="text-[6.5px] font-semibold leading-none truncate max-w-[44px] text-center opacity-70">
              {item.labelSk}
            </span>
          </button>
        );
      })}
    </aside>
  );
}
