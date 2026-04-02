import { BarChart3, Calculator, Zap, PieChart, Settings, Target, Sparkles } from 'lucide-react';
import { Lang } from '@/lib/i18n';

export type TabId = 'overview' | 'dca' | 'action' | 'smart' | 'execution' | 'portfolio' | 'settings';

interface BottomNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  lang: Lang;
}

const tabs: { id: TabId; labelSk: string; labelEn: string; icon: typeof BarChart3 }[] = [
  { id: 'overview', labelSk: 'Prehľad', labelEn: 'Overview', icon: BarChart3 },
  { id: 'dca', labelSk: 'DCA', labelEn: 'DCA', icon: Calculator },
  { id: 'action', labelSk: 'Akcia', labelEn: 'Action', icon: Zap },
  { id: 'smart', labelSk: 'Smart', labelEn: 'Smart', icon: Sparkles },
  { id: 'execution', labelSk: 'Exekúcia', labelEn: 'Execution', icon: Target },
  { id: 'portfolio', labelSk: 'Portfólio', labelEn: 'Portfolio', icon: PieChart },
  { id: 'settings', labelSk: 'Nastav.', labelEn: 'Settings', icon: Settings },
];

export function BottomNav({ active, onChange, lang }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-nav-bg border-t border-border nav-safe-bottom z-50">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
        {tabs.map(({ id, labelSk, labelEn, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                isActive ? 'text-nav-active' : 'text-nav-inactive'
              }`}
            >
              <Icon className="w-4 h-4" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[9px] font-medium leading-tight">{lang === 'sk' ? labelSk : labelEn}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
