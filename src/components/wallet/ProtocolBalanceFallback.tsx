import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { PenLine, Save } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lang } from '@/lib/i18n';
import { addStake, removeStake, PROTOCOL_PRESETS, type LedgerSymbol } from '@/lib/stakingLedger';
import { useStakingLedger } from '@/hooks/useStakingLedger';
import { DATA_UNAVAILABLE } from '@/lib/defiLlamaAggregator';

interface Props {
  lang: Lang;
}

interface ProtocolField {
  symbol: LedgerSymbol;
  protocol: string;
  token: string;
  decimals: number;
}

const FIELDS: ProtocolField[] = [
  { symbol: 'ETH', protocol: 'Rocket Pool (rETH)', token: 'rETH', decimals: 4 },
  { symbol: 'ETH', protocol: 'ether.fi (weETH)', token: 'weETH', decimals: 4 },
  { symbol: 'SOL', protocol: 'Marinade Native (mSOL)', token: 'mSOL', decimals: 2 },
  { symbol: 'SOL', protocol: 'Sanctum INF (INF)', token: 'INF', decimals: 2 },
  { symbol: 'BTC', protocol: 'Lombard LBTC', token: 'LBTC', decimals: 6 },
];

export function ProtocolBalanceFallback({ lang }: Props) {
  const sk = lang === 'sk';
  const { entries } = useStakingLedger();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const currentQty = useCallback(
    (symbol: LedgerSymbol, protocol: string) =>
      entries.find(e => e.symbol === symbol && e.protocol === protocol)?.amount ?? 0,
    [entries],
  );

  const save = (field: ProtocolField) => {
    const key = `${field.symbol}:${field.protocol}`;
    const next = Number(drafts[key]);
    if (!Number.isFinite(next) || next < 0) {
      toast.error(sk ? 'Zadaj platné číslo' : 'Enter a valid number');
      return;
    }
    const current = currentQty(field.symbol, field.protocol);
    const delta = next - current;
    if (Math.abs(delta) < 1e-12) {
      toast.message(sk ? 'Bez zmeny' : 'No change');
      return;
    }
    if (delta > 0) {
      addStake(field.symbol, field.protocol, delta);
    } else {
      removeStake(field.symbol, field.protocol, -delta);
    }
    toast.success(sk ? `${field.token} uložené` : `${field.token} saved`);
    setDrafts(prev => ({ ...prev, [key]: '' }));
  };

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-start gap-2">
        <PenLine className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {sk ? 'Manuálne protokolové zostatky' : 'Manual protocol balances'}
          </h3>
          <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
            {sk
              ? `Ak API vráti „${DATA_UNAVAILABLE}", zadajte zostatok tu. Používa sa v Portfóliu aj Cyborg Termináli.`
              : `When an API returns "${DATA_UNAVAILABLE}", enter balances here. Used by Portfolio and Cyborg Terminal.`}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {FIELDS.map(field => {
          const key = `${field.symbol}:${field.protocol}`;
          const qty = currentQty(field.symbol, field.protocol);
          const draft = drafts[key] ?? '';
          const display = draft !== '' ? draft : qty > 0 ? String(qty) : '';

          return (
            <div key={key} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <label className="text-[10px] font-semibold text-foreground block truncate">
                  {field.token}
                  <span className="text-muted-foreground font-normal ml-1">
                    · {field.protocol.split('(')[0].trim()}
                  </span>
                </label>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={display}
                  onChange={e => setDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder="0"
                  className="h-9 font-mono text-xs tabular-nums mt-1"
                />
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-9 shrink-0 touch-manipulation"
                onClick={() => save(field)}
              >
                <Save className="w-3.5 h-3.5 mr-1" />
                {sk ? 'Uložiť' : 'Save'}
              </Button>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground">
        {sk
          ? `Ďalšie protokoly: ${PROTOCOL_PRESETS.ETH.join(', ')}…`
          : `More protocols via Staking ledger: ${PROTOCOL_PRESETS.ETH[2]}, Kamino Autopilot, Morpho…`}
      </p>
    </div>
  );
}
