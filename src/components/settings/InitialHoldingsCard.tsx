import { useEffect, useState } from 'react';
import { Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAppSettings';

type CoinKey = 'btc' | 'eth' | 'sol';
const COINS: { key: CoinKey; label: string }[] = [
  { key: 'btc', label: 'BTC' },
  { key: 'eth', label: 'ETH' },
  { key: 'sol', label: 'SOL' },
];

export function InitialHoldingsCard() {
  const { data: settings } = useAppSettings();
  const update = useUpdateAppSettings();

  const [holdings, setHoldings] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });
  const [costBasis, setCostBasis] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });

  useEffect(() => {
    if (!settings) return;
    const mh = (settings.manual_holdings ?? {}) as Record<CoinKey, number>;
    const ic = (settings.initial_cost_basis ?? {}) as Record<CoinKey, number>;
    setHoldings({
      btc: mh.btc ? String(mh.btc) : '',
      eth: mh.eth ? String(mh.eth) : '',
      sol: mh.sol ? String(mh.sol) : '',
    });
    setCostBasis({
      btc: ic.btc ? String(ic.btc) : '',
      eth: ic.eth ? String(ic.eth) : '',
      sol: ic.sol ? String(ic.sol) : '',
    });
  }, [settings]);

  const save = async () => {
    if (!settings?.id) return;
    try {
      await update.mutateAsync({
        id: settings.id,
        manual_holdings: {
          btc: Number(holdings.btc) || 0,
          eth: Number(holdings.eth) || 0,
          sol: Number(holdings.sol) || 0,
        },
        initial_cost_basis: {
          btc: Number(costBasis.btc) || 0,
          eth: Number(costBasis.eth) || 0,
          sol: Number(costBasis.sol) || 0,
        },
      });
      toast.success('Počiatočné holdingy uložené');
    } catch (e) {
      toast.error('Uloženie zlyhalo');
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="w-4 h-4 text-primary" />
        <h3 className="font-semibold">Počiatočné holdingy & cost basis</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Coiny ktoré ste vlastnili pred spustením appky. Holdings = množstvo, Cost basis = USD ktoré ste minuli.
      </p>

      <div className="space-y-3">
        {COINS.map(({ key, label }) => (
          <div key={key} className="grid grid-cols-[3rem_1fr_1fr] gap-2 items-center">
            <span className="text-sm font-semibold">{label}</span>
            <div>
              <label className="text-[10px] text-muted-foreground">Holdings</label>
              <input
                type="number"
                step="0.00000001"
                value={holdings[key]}
                onChange={e => setHoldings({ ...holdings, [key]: e.target.value })}
                placeholder="0"
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Cost basis (USD)</label>
              <input
                type="number"
                step="0.01"
                value={costBasis[key]}
                onChange={e => setCostBasis({ ...costBasis, [key]: e.target.value })}
                placeholder="0"
                className="w-full px-2 py-1.5 text-sm rounded-md border border-border bg-background"
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={update.isPending}
        className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
      >
        {update.isPending ? 'Ukladám…' : 'Uložiť'}
      </button>
    </div>
  );
}
