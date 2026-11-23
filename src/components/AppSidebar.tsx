import { Lang } from '@/lib/i18n';
import { NAV_ITEMS, type TabId } from '@/lib/navItems';

interface Props {
  active: TabId;
  onChange: (tab: TabId) => void;
  lang: Lang;
}

/** Desktop navigation: icons on md, icons + labels on lg. Same items as the mobile bottom bar. */
export function AppSidebar({ active, onChange, lang }: Props) {
  return (
    <aside className="hidden md:flex flex-col fixed left-0 top-0 h-full z-40 py-3 gap-0.5 w-14 lg:w-48 bg-[#050505] border-r border-white/[0.06] overflow-y-auto scrollbar-hide">
      <div className="flex items-center gap-2 mb-3 px-3">
        <div className="w-8 h-8 shrink-0 rounded-xl flex items-center justify-center text-[10px] font-bold bg-primary/10 border border-primary/25 text-primary">
          DCA
        </div>
        <span className="hidden lg:block text-sm font-bold text-white truncate">Buy Simple DCA</span>
      </div>
      <div className="mx-2 mb-2 h-px bg-white/[0.06]" />
      <nav aria-label="Hlavná navigácia" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          const label = lang === 'sk' ? item.sk : item.en;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              title={label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex items-center gap-3 mx-2 px-2.5 py-2 rounded-xl border text-sm transition-colors justify-center lg:justify-start ${
                isActive
                  ? 'border-primary/30 bg-primary/10 text-primary'
                  : 'border-transparent text-white/45 hover:text-white/80 hover:bg-white/[0.04]'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" strokeWidth={isActive ? 2.4 : 1.8} />
              <span className="hidden lg:block truncate">{label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
