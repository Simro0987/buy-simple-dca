import { AlertTriangle, Fuel } from 'lucide-react';
import { evaluateGasGuard, GAS_RATIO_LIMIT } from '@/lib/gasProfitGuard';

interface Props {
  amountUsd: number;
  apyPct: number;
  gasUsd: number;
  horizonDays?: number;
  /** Popis akcie (Stake / Transfer / Borrow / Repay) */
  action?: string;
  /** Popis toho, čo sa porovnáva (napr. "L1 Bridge + L2 Gas vs Projected Yield") */
  comparisonLabel?: string;
}

/** Fee-protection badge pre manuálne akčné karty (Stake · Transfer · Borrow · Repay). */
export function GasGuardBadge({ amountUsd, apyPct, gasUsd, horizonDays, action, comparisonLabel }: Props) {
  const g = evaluateGasGuard({ amountUsd, apyPct, gasUsd, horizonDays });
  if (amountUsd <= 0 || gasUsd <= 0) return null;

  const pct = Number.isFinite(g.ratio) ? (g.ratio * 100).toFixed(1) : '∞';
  const prefix = comparisonLabel ? `${comparisonLabel} · ` : action ? `${action} · ` : '';


  if (g.blocked) {
    return (
      <div className="flex items-start gap-1.5 rounded-lg border-2 border-red-500/50 bg-red-500/10 px-3 py-2 text-[11px] font-medium text-red-100">
        <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-red-300" />
        <div>
          <div className="font-bold text-red-200">⚠️ Presun sa neoplatí: Poplatok za plyn zmaže výnos. Počkaj.</div>
          <div className="mt-0.5 font-mono text-[10px] text-red-200/80">
            {action ? `${action} · ` : ''}gas ${g.gasUsd.toFixed(2)} = {pct} % z výnosu ${g.projectedYieldUsd.toFixed(2)} (limit {(GAS_RATIO_LIMIT * 100).toFixed(0)} %)
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-1.5 text-[10px] font-mono text-emerald-200/80">
      <Fuel className="h-3 w-3 shrink-0" />
      <span>
        {comparisonLabel ? `${comparisonLabel} · ` : ''}gas ${g.gasUsd.toFixed(2)} = {pct} % z výnosu ${g.projectedYieldUsd.toFixed(2)} · presun sa oplatí
      </span>

    </div>
  );
}
