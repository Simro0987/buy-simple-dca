import { useState } from 'react';
import {
  PieChart, Calculator, Shield, Activity, BarChart3,
  DollarSign, Coins, Settings, Wallet,
} from 'lucide-react';
import { TabId } from '@/components/BottomNav';
import { AssetCardsRow } from '@/components/dashboard/AssetCardsRow';
import { PerformanceLineChart } from '@/components/dashboard/PerformanceLineChart';
import { ConfluenceOctagon } from '@/components/ConfluenceOctagon';
import { MacroNewsTicker } from '@/components/MacroNewsTicker';
import { LiquidationAlertBanner } from '@/components/LiquidationAlertBanner';
import { FlashAlertBanner } from '@/components/FlashAlertBanner';
import { usePrices } from '@/hooks/usePrices';
import { usePortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { Lang } from '@/lib/i18n';
import type { OctToken } from '@/hooks/useConfluenceMetrics';

interface Props {
  onNavigate: (tab: TabId) => void;
  lang: Lang;
}

interface Module {
  id: TabId;
  label: string;
  icon: typeof PieChart;
}

const MODULES: Module[] = [
  { id: 'portfolio', label: 'Portfólio',  icon: PieChart    },
  { id: 'dca',       label: 'DCA',        icon: Calculator  },
  { id: 'risk',      label: 'Riziko',     icon: Shield      },
  { id: 'analysis',  label: 'Analýza',    icon: Activity    },
  { id: 'market',    label: 'Trh',        icon: BarChart3   },
  { id: 'profit',    label: 'Zisky',      icon: DollarSign  },
  { id: 'staking',   label: 'Staking',    icon: Coins       },
  { id: 'wallets',   label: 'Wallety',    icon: Wallet      },
  { id: 'settings',  label: 'Nastav.',    icon: Settings    },
];

export function HomePage({ onNavigate, lang }: Props) {
  const { data: prices } = usePrices();
  const metrics = usePortfolioMetrics(prices);
  const [octagonToken, setOctagonToken] = useState<OctToken>('BTC');

  return (
    <div className="space-y-2.5">
      {/* Alert banners — Flash Alert sits at the very top */}
      <FlashAlertBanner lang={lang} />
      <LiquidationAlertBanner lang={lang} />


      {/* ── Asset price strip ───────────────────────────────────────────── */}
      <AssetCardsRow metrics={metrics} prices={prices} />

      {/* ── Main radar + news ────────────────────────────────────────────── */}
      <ConfluenceOctagon
        activeToken={octagonToken}
        onTokenChange={setOctagonToken}
      />
      <MacroNewsTicker activeToken={octagonToken} />

      {/* ── Performance chart ───────────────────────────────────────────── */}
      <PerformanceLineChart metrics={metrics} prices={prices} />

      {/* ── Module navigation grid ──────────────────────────────────────── */}
      <div>
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 mb-1.5 px-0.5">
          Moduly
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {MODULES.map(mod => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.id}
                onClick={() => onNavigate(mod.id)}
                className="terminal-btn"
              >
                <Icon className="w-4 h-4" />
                <span className="text-[9px] font-semibold leading-none">{mod.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
