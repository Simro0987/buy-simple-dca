import { useEffect, useState } from 'react';
import { DollarSign } from 'lucide-react';
import { formatUsd } from '@/lib/crypto';
import { useExternalCapital } from '@/hooks/useExternalCapital';
import { useDcaCycleCountdown } from '@/hooks/useDcaCycleCountdown';

interface Props {
  capital: number;
  onCapitalChange: (n: number) => void;
  investableUsd?: number;
  reservedUsd?: number;
  allocationPct?: number;
  budgetWhy?: string;
  tokenSplit?: { btc: number; eth: number; sol: number };
  tokenWhy?: string;
}

const QUICK = [50, 100, 200, 500, 1000];

/**
 * Part 5/5a — Single weekly investment input.
 * Total capital + horizon are managed globally (Settings); user only picks how much to deploy this week.
 */
export function CapitalInputCard({
  capital, onCapitalChange, investableUsd, reservedUsd, allocationPct,
  budgetWhy, tokenSplit, tokenWhy,
}: Props) {
  const [weekly, setWeekly] = useState<number>(capital || 100);
  const { total: walletCapital } = useExternalCapital();
  const { label: cycleLabel } = useDcaCycleCountdown();

  // Keep local state in sync if outer changes (e.g., reset)
  useEffect(() => {
    if (capital && capital !== weekly) setWeekly(capital);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capital]);

  const apply = (val: number) => {
    setWeekly(val);
    onCapitalChange(val);
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">Weekly Investment</h2>
      </div>

      <label className="block">
        <span className="text-[10px] uppercase text-muted-foreground tracking-wide">
          Týždenná suma na DCA (USD)
        </span>
        <input
          type="number"
          inputMode="decimal"
          value={weekly}
          onChange={e => {
            const v = Number(e.target.value) || 0;
            setWeekly(v);
            onCapitalChange(v); // live update — breakdown 64/25/11 prepočíta okamžite
          }}
          className="mt-1 w-full bg-secondary border border-border rounded-lg px-3 py-2 text-lg font-semibold text-foreground tabular-nums focus:outline-none focus:border-primary"
        />
      </label>

      <p className="text-[11px] text-muted-foreground font-mono tabular-nums -mt-1">
        Ďalší cyklus: <span className="text-foreground font-semibold">{cycleLabel}</span>
      </p>

      {walletCapital > 0 && (
        <p className="text-[11px] text-muted-foreground leading-snug -mt-1">
          {(() => {
            const weeks = weekly > 0 ? Math.floor(walletCapital / weekly) : 0;
            const weeksWord = weeks === 1 ? 'týždeň' : weeks >= 2 && weeks <= 4 ? 'týždne' : 'týždňov';
            return (
              <>
                Disponibilný kapitál na peňaženkách:{' '}
                <span className="font-semibold text-foreground tabular-nums">
                  {formatUsd(walletCapital)}
                </span>
                {weekly > 0 && (
                  <>
                    {' '}
                    <span className="text-muted-foreground">
                      (Zostane vám cash na{' '}
                      <span className="text-foreground font-semibold tabular-nums">{weeks}</span>{' '}
                      {weeksWord} nákupov)
                    </span>
                  </>
                )}
              </>
            );
          })()}
        </p>
      )}

      <div className="flex items-center justify-between text-[10px] tabular-nums">
        <span className="text-muted-foreground uppercase tracking-wide">Token split</span>
        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold border border-primary/30">
          {tokenSplit
            ? `BTC ${tokenSplit.btc.toFixed(0)}% · ETH ${tokenSplit.eth.toFixed(0)}% · SOL ${tokenSplit.sol.toFixed(0)}%`
            : 'BTC 64% · ETH 25% · SOL 11%'}
        </span>
      </div>

      {(investableUsd != null && reservedUsd != null) && (
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2">
            <p className="text-muted-foreground uppercase text-[9px]">Alokované</p>
            <p className="font-bold text-emerald-300 tabular-nums">{formatUsd(investableUsd)}</p>
            {allocationPct != null && (
              <p className="text-[9px] text-muted-foreground">{allocationPct.toFixed(1)} % rozpočtu</p>
            )}
          </div>
          <div className="bg-secondary/60 border border-border rounded-lg p-2">
            <p className="text-muted-foreground uppercase text-[9px]">Cash Reserve</p>
            <p className="font-bold text-foreground tabular-nums">{formatUsd(reservedUsd)}</p>
          </div>
        </div>
      )}

      {budgetWhy && (
        <p className="text-[10px] text-muted-foreground leading-relaxed border-l-2 border-primary/30 pl-2">
          {budgetWhy}
        </p>
      )}
      {tokenWhy && (
        <p className="text-[10px] text-muted-foreground leading-relaxed border-l-2 border-violet-500/30 pl-2">
          {tokenWhy}
        </p>
      )}

      <div className="flex gap-1 flex-wrap">
        {QUICK.map(v => (
          <button
            key={v}
            onClick={() => apply(v)}
            className={`px-3 py-1.5 rounded-md text-[11px] font-semibold tabular-nums ${
              weekly === v ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground hover:bg-secondary/80'
            }`}
          >
            ${v.toLocaleString()}
          </button>
        ))}
      </div>

      <div className="bg-secondary/60 rounded-lg p-3">
        <p className="text-[10px] uppercase text-muted-foreground tracking-wide">Týždenný kapitál</p>
        <p className="text-2xl font-bold text-foreground tabular-nums">{formatUsd(weekly)}</p>
        <p className="text-[10px] text-muted-foreground mt-1">
          DCA horizont a celkový kapitál spravuj v Nastaveniach.
        </p>
      </div>
    </div>
  );
}
