import { Layers } from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { ensurePortfolioData, getAggregatedPortfolioTotals } from '@/lib/portfolioData';

interface Props {
  lang: Lang;
  notice?: string;
}

/** Minimal portfolio view when the full HCD panel fails — balances always visible. */
export function StakePortfolioFallback({ lang, notice }: Props) {
  const sk = lang === 'sk';
  const { portfolioData } = usePortfolio();
  const safe = ensurePortfolioData(portfolioData);
  const aggregated = getAggregatedPortfolioTotals(safe);
  const motor = safe.activeMotor;

  return (
    <div className="glass-card p-3 sm:p-4 space-y-3 border border-violet-500/25">
      <div className="flex items-center gap-2">
        <Layers className="w-4 h-4 text-violet-300" />
        <h2 className="text-sm font-bold text-foreground">
          {sk ? 'Zostatky portfólia (záložné zobrazenie)' : 'Portfolio balances (fallback view)'}
        </h2>
      </div>

      {notice && (
        <p className="text-[10px] text-amber-300/90 leading-snug">{notice}</p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-border/50 bg-background/40 p-2.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">ETH</p>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {aggregated.ethQty.toFixed(4)} ETH
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{formatUsd(aggregated.ethUsd)}</p>
          {(motor?.rEth?.qty ?? 0) > 0 && (
            <p className="text-[9px] text-emerald-400/90 mt-1 tabular-nums">
              rETH {motor.rEth.qty.toFixed(4)}
            </p>
          )}
          {(safe.alchemixReserve?.eth?.qty ?? 0) > 0 && (
            <p className="text-[9px] text-sky-400/90 tabular-nums">
              Alchemix {safe.alchemixReserve.eth.qty.toFixed(4)}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-border/50 bg-background/40 p-2.5">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">SOL</p>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {aggregated.solQty.toFixed(2)} SOL
          </p>
          <p className="text-[10px] text-muted-foreground tabular-nums">{formatUsd(aggregated.solUsd)}</p>
          {(motor?.mSol?.qty ?? 0) > 0 && (
            <p className="text-[9px] text-emerald-400/90 mt-1 tabular-nums">
              mSOL {motor.mSol.qty.toFixed(2)}
            </p>
          )}
        </div>
      </div>

      <p className="text-[9px] text-muted-foreground leading-snug">
        {sk
          ? 'Agregovaný zostatok z Portfólia · HCD panel sa obnoví po ďalšom načítaní.'
          : 'Aggregated balance from Portfolio · HCD panel will recover on next load.'}
      </p>
    </div>
  );
}
