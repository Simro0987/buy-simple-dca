import { useMemo } from 'react';
import { Lang } from '@/lib/i18n';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useStablesByNetwork } from '@/hooks/useStablesByNetwork';
import {
  buildPositionOverview,
  formatPositionQty,
  type PositionOverviewMode,
} from '@/lib/positionOverview';

export interface PositionOverviewPanelProps {
  lang: Lang;
  mode: PositionOverviewMode;
  symbol: 'ETH' | 'SOL';
  tokenLabel?: string;
  usdcDebt?: number;
  decimals?: number;
}

function sumStables(stables: {
  ethereum?: number;
  arbitrum?: number;
  base?: number;
  solana?: number;
} | null | undefined): number {
  return (stables?.ethereum ?? 0)
    + (stables?.arbitrum ?? 0)
    + (stables?.base ?? 0)
    + (stables?.solana ?? 0);
}

export function PositionOverviewPanel({
  lang,
  mode,
  symbol,
  tokenLabel,
  usdcDebt,
  decimals,
}: PositionOverviewPanelProps) {
  const sk = lang === 'sk';
  const { portfolioData, cyborgUsdcDebt } = usePortfolio();
  const stables = useStablesByNetwork();

  const overview = useMemo(() => {
    try {
      return buildPositionOverview({
        mode,
        symbol,
        tokenLabel,
        portfolio: portfolioData ?? null,
        usdcDebt: usdcDebt ?? cyborgUsdcDebt ?? 0,
        stablesTotalUsd: sumStables(stables),
        decimals,
      });
    } catch {
      return buildPositionOverview({ mode, symbol, tokenLabel, decimals });
    }
  }, [
    mode,
    symbol,
    tokenLabel,
    portfolioData,
    usdcDebt,
    cyborgUsdcDebt,
    stables,
    decimals,
  ]);

  const rows: { icon: string; labelSk: string; labelEn: string; qty: number; token: string; show: boolean }[] = [
    {
      icon: '👛',
      labelSk: 'V peňaženke',
      labelEn: 'In wallet',
      qty: overview.walletQty,
      token: overview.tokenSymbol,
      show: overview.showWallet,
    },
    {
      icon: '🥩',
      labelSk: 'Staked',
      labelEn: 'Staked',
      qty: overview.stakedQty,
      token: overview.tokenSymbol,
      show: overview.showStaked,
    },
    {
      icon: '🏦',
      labelSk: 'Kolaterál (Supply)',
      labelEn: 'Collateral (Supply)',
      qty: overview.collateralQty,
      token: overview.tokenSymbol,
      show: overview.showCollateral,
    },
    {
      icon: '💸',
      labelSk: 'Dlh (Borrow)',
      labelEn: 'Debt (Borrow)',
      qty: overview.borrowQty,
      token: overview.borrowSymbol,
      show: overview.showBorrow,
    },
  ];

  const visibleRows = rows.filter(r => r.show);
  if (visibleRows.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/40 bg-muted/25 px-2.5 py-2 space-y-1.5">
      <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
        {sk ? 'Position Overview' : 'Position Overview'}
        <span className="ml-1.5 font-normal normal-case text-muted-foreground/80">
          · {sk ? 'iba na čítanie' : 'read-only'}
        </span>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1">
        {visibleRows.map(row => (
          <p key={row.labelEn} className="text-[10px] text-muted-foreground leading-snug tabular-nums">
            <span className="mr-1">{row.icon}</span>
            {sk ? row.labelSk : row.labelEn}:{' '}
            <span className="font-mono font-semibold text-foreground">
              {formatPositionQty(row.qty, overview.decimals)}
            </span>
            {' '}
            {row.token}
          </p>
        ))}
      </div>
    </div>
  );
}
