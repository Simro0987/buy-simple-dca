import { ExternalLink, TrendingUp, TrendingDown, Coins } from 'lucide-react';

export type CTAKey = 'optimize_staking' | 'reduce_exposure' | 'move_to_yield';

const META: Record<CTAKey, { label: string; icon: typeof Coins; href: string; tone: string }> = {
  optimize_staking: {
    label: 'Optimalizovať staking',
    icon: Coins,
    href: 'https://stake.lido.fi/',
    tone: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 hover:bg-emerald-500/20',
  },
  reduce_exposure: {
    label: 'Znížiť expozíciu',
    icon: TrendingDown,
    href: 'https://www.binance.com/en/trade/BTC_USDT',
    tone: 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20',
  },
  move_to_yield: {
    label: 'Presunúť do yield',
    icon: TrendingUp,
    href: 'https://app.aave.com/',
    tone: 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20',
  },
};

interface Props { actions: CTAKey[]; }

export function ContextCTAs({ actions }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5">
      {actions.map(key => {
        const m = META[key];
        const Icon = m.icon;
        return (
          <a
            key={key}
            href={m.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center justify-between gap-2 px-3 py-2 rounded-md border text-xs font-medium transition-colors ${m.tone}`}
          >
            <span className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" />
              {m.label}
            </span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
        );
      })}
    </div>
  );
}
