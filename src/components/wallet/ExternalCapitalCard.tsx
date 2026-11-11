import { useState, useEffect } from 'react';
import { Wallet } from 'lucide-react';
import { useExternalCapital } from '@/hooks/useExternalCapital';
import { Lang } from '@/lib/i18n';
import { formatUsd } from '@/lib/crypto';

interface Props { lang: Lang; }

export function ExternalCapitalCard({ lang }: Props) {
  const { external, setExternal, fetchedStables, total } = useExternalCapital();
  const [draft, setDraft] = useState<string>(() => (external > 0 ? String(external) : ''));

  useEffect(() => {
    setDraft(external > 0 ? String(external) : '');
  }, [external]);

  const commit = (raw: string) => {
    const n = Number(raw);
    setExternal(Number.isFinite(n) && n >= 0 ? n : 0);
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-primary" />
        <p className="text-xs font-semibold text-foreground">
          {lang === 'sk' ? 'Mimopeňaženkový kapitál (Base USDC)' : 'External capital (Base USDC)'}
        </p>
      </div>

      <label className="block">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {lang === 'sk'
            ? 'Stablecoiny mimo sledovaných peňaženiek (cold storage / burza)'
            : 'Stablecoins outside tracked wallets (cold storage / exchange)'}
        </span>
        <div className="mt-1 relative">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={e => commit(e.target.value)}
            placeholder="0.00"
            className="w-full bg-secondary border border-border rounded-lg pl-7 pr-3 py-2 text-base font-semibold text-foreground tabular-nums focus:outline-none focus:border-primary"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
        </div>
      </label>

      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <Stat
          label={lang === 'sk' ? 'Sledované (SOL+EVM)' : 'Tracked (SOL+EVM)'}
          value={formatUsd(fetchedStables)}
        />
        <Stat
          label={lang === 'sk' ? 'Manuálne (Base)' : 'Manual (Base)'}
          value={formatUsd(external)}
        />
        <Stat
          label={lang === 'sk' ? 'Spolu USD' : 'Total USD'}
          value={formatUsd(total)}
          highlight
        />
      </div>

      <p className="text-[10px] text-muted-foreground leading-snug">
        {lang === 'sk'
          ? 'Tento súčet sa použije v DCA Engine ako disponibilný kapitál na peňaženkách.'
          : 'This total feeds the DCA Engine as available wallet capital.'}
      </p>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className={`rounded-md p-2 border ${
        highlight ? 'bg-primary/10 border-primary/30' : 'bg-secondary/60 border-border'
      }`}
    >
      <p className="uppercase tracking-wide text-muted-foreground truncate">{label}</p>
      <p
        className={`text-xs font-bold tabular-nums mt-0.5 ${
          highlight ? 'text-primary' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
