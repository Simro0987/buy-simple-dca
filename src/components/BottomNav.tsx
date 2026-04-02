import { BarChart3, Calculator, Zap, PieChart, Settings } from 'lucide-react';
import { Lang, t } from '@/lib/i18n';

export type TabId = 'overview' | 'dca' | 'action' | 'portfolio' | 'settings';

interface BottomNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  lang: Lang;
}

const tabs: { id: TabId; key: 'overview' | 'dca' | 'action' | 'portfolio' | 'settings'; icon: typeof BarChart3 }[] = [
  { id: 'overview', key: 'overview', icon: BarChart3 },
  { id: 'dca', key: 'dca', icon: Calculator },
  { id: 'action', key: 'action', icon: Zap },
  { id: 'portfolio', key: 'portfolio', icon: PieChart },
  { id: 'settings', key: 'settings', icon: Settings },
];

export function BottomNav({ active, onChange, lang }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-nav-bg border-t border-border nav-safe-bottom z-50">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map(({ id, key, icon: Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                isActive ? 'text-nav-active' : 'text-nav-inactive'
              }`}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{t(key, lang)}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
