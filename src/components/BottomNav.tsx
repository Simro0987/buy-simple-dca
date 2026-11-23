import { Lang } from '@/lib/i18n';
import { NAV_ITEMS, type TabId } from '@/lib/navItems';

export type { TabId } from '@/lib/navItems';

interface BottomNavProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  lang: Lang;
  unreadNewsCount?: number;
}

/** Mobile navigation: the same items as the desktop sidebar, horizontally scrollable. */
export function BottomNav({ active, onChange, lang, unreadNewsCount = 0 }: BottomNavProps) {
  return (
    <nav
      aria-label="Navigácia"
      className="fixed bottom-0 left-0 right-0 nav-safe-bottom z-50 border-t border-white/[0.06] bg-black/80 backdrop-blur-xl"
    >
      <div className="flex items-stretch h-[58px] overflow-x-auto scrollbar-hide">
        {NAV_ITEMS.filter((n) => n.mobile).map(({ id, sk, en, icon: Icon }) => {
          const isActive = active === id;
          const showBadge = id === 'overview' && unreadNewsCount > 0;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              aria-current={isActive ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 shrink-0 min-w-[64px] h-full px-1 ${
                isActive ? 'text-primary' : 'text-white/40'
              }`}
            >
              {isActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[2px] rounded-b-full bg-primary" />}
              <span className="relative">
                <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2.2 : 1.6} />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-rose-500 text-white text-[8px] font-bold px-1">
                    {unreadNewsCount > 9 ? '9+' : unreadNewsCount}
                  </span>
                )}
              </span>
              <span className="text-[10px] font-medium leading-none whitespace-nowrap">{lang === 'sk' ? sk : en}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
