import { useEffect, useState } from 'react';
import { Wallet, Lock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAppSettings';
import { usePrices } from '@/hooks/usePrices';

// Immutable baseline (Master Top — držby pred spustením appky).
const BASELINE = { btc: 0.01746423, eth: 0.23278498, sol: 2.60983568 } as const;
const TOKEN_PRICE_ID = { btc: 'bitcoin', eth: 'ethereum', sol: 'solana' } as const;

type CoinKey = 'btc' | 'eth' | 'sol';
const COINS: { key: CoinKey; label: string }[] = [
  { key: 'btc', label: 'BTC' },
  { key: 'eth', label: 'ETH' },
  { key: 'sol', label: 'SOL' },
];

type Mode = 'asset' | 'usd';

export function InitialHoldingsCard() {
  const { data: settings } = useAppSettings();
  const update = useUpdateAppSettings();
  const { data: prices } = usePrices();

  const [holdings, setHoldings] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });
  const [costBasis, setCostBasis] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });

  // Smart Manual Accumulator — prírastky
  const [accMode, setAccMode] = useState<Record<CoinKey, Mode>>({ btc: 'asset', eth: 'asset', sol: 'asset' });
  const [accInput, setAccInput] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });
  // Custom execution / purchase price per coin (USD). Empty = use live spot.
  const [accPrice, setAccPrice] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });
  // Track which prices the user has edited so live-spot autofill won't overwrite them.
  const [priceTouched, setPriceTouched] = useState<Record<CoinKey, boolean>>({ btc: false, eth: false, sol: false });

  // Auto-fill custom price from live spot once available (only if user hasn't typed yet).
  useEffect(() => {
    if (!prices) return;
    setAccPrice(prev => {
      const next = { ...prev };
      (Object.keys(TOKEN_PRICE_ID) as CoinKey[]).forEach(k => {
        if (priceTouched[k]) return;
        const spot = prices?.[TOKEN_PRICE_ID[k]]?.usd;
        if (spot && !prev[k]) next[k] = String(spot);
      });
      return next;
    });
  }, [prices, priceTouched]);

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

  const baselineOk =
    Number(settings?.manual_holdings?.btc ?? 0) >= BASELINE.btc &&
    Number(settings?.manual_holdings?.eth ?? 0) >= BASELINE.eth &&
    Number(settings?.manual_holdings?.sol ?? 0) >= BASELINE.sol;

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
      toast.success('Holdingy uložené ✓');
    } catch {
      toast.error('Uloženie zlyhalo');
    }
  };

  // MANUAL ONLY — never call from effect. Spúšťa sa iba z tlačidla "Pridať".
  // Uses the user-supplied custom execution price (falls back to live spot if empty).
  const addAccumulation = async (key: CoinKey) => {
    if (!settings?.id) return;
    const raw = Number(accInput[key]);
    if (!raw || raw <= 0) { toast.error('Zadaj kladnú hodnotu'); return; }
    const spot = prices?.[TOKEN_PRICE_ID[key]]?.usd ?? 0;
    const priceStr = accPrice[key];
    const customPrice = Number(priceStr);
    const execPrice = customPrice > 0 ? customPrice : spot;
    if (execPrice <= 0) {
      toast.error('Zadaj nákupnú cenu (USD) – cena ešte neprišla');
      return;
    }

    const mode = accMode[key];
    // Toggle logic:
    //  - "Množstvo": user typed qty, USD volume = qty * execPrice
    //  - "USD suma": user typed USD, qty = usd / execPrice
    const newQty = mode === 'asset' ? raw : raw / execPrice;
    const newUsd = mode === 'asset' ? raw * execPrice : raw;

    const oldQty = Number(settings.manual_holdings?.[key] ?? 0);
    const oldUsd = Number(settings.initial_cost_basis?.[key] ?? 0);
    // Weighted-average cost basis:
    //   New Total Qty = oldQty + newQty
    //   New Cost Basis (USD) = oldUsd + newUsd
    //   New Avg = New Cost Basis / New Total Qty
    const totalQty = oldQty + newQty;
    const totalUsd = oldUsd + newUsd;

    const nextHoldings = { ...(settings.manual_holdings ?? {}), [key]: totalQty };
    const nextBasis = { ...(settings.initial_cost_basis ?? {}), [key]: totalUsd };

    try {
      await update.mutateAsync({
        id: settings.id,
        manual_holdings: nextHoldings,
        initial_cost_basis: nextBasis,
      });
      setAccInput(s => ({ ...s, [key]: '' }));
      // Reset price back to live spot for the next entry.
      setPriceTouched(s => ({ ...s, [key]: false }));
      setAccPrice(s => ({ ...s, [key]: spot ? String(spot) : '' }));
      const avg = totalUsd / totalQty;
      toast.success(
        `+${newQty.toFixed(8)} ${key.toUpperCase()} @ $${execPrice.toFixed(2)} pridané. Nový priemer: $${avg.toFixed(2)}`,
      );
    } catch {
      toast.error('Pridanie zlyhalo');
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Holdingy & cost basis</h3>
        </div>
        {baselineOk && (
          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-md px-1.5 py-0.5">
            <Lock className="w-3 h-3" /> Baseline chránená
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Holdings = množstvo, Cost basis = USD ktoré si minul. Smart Manual Accumulator nižšie pridáva
        nové nákupy a počíta weighted average automaticky.
      </p>

      {/* Editácia základov */}
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

      {/* Smart Manual Accumulator */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-semibold text-emerald-300">Smart Manual Accumulator</h4>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Pridaj nový nákup — Holdings sa pripočítajú, priemerná nákupná cena sa prepočíta váženým priemerom.
        </p>

        {COINS.map(({ key, label }) => {
          const price = prices?.[TOKEN_PRICE_ID[key]]?.usd ?? 0;
          const mode = accMode[key];
          const v = Number(accInput[key]) || 0;
          const preview = v > 0 && price > 0
            ? (mode === 'asset' ? `≈ $${(v * price).toFixed(2)}` : `≈ ${(v / price).toFixed(8)} ${label}`)
            : '';
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{label}</span>
                <div className="flex rounded-md border border-border overflow-hidden text-[10px]">
                  <button
                    onClick={() => setAccMode(s => ({ ...s, [key]: 'asset' }))}
                    className={`px-2 py-0.5 ${mode === 'asset' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                  >Množstvo {label}</button>
                  <button
                    onClick={() => setAccMode(s => ({ ...s, [key]: 'usd' }))}
                    className={`px-2 py-0.5 ${mode === 'usd' ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}
                  >USD suma</button>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  step={mode === 'asset' ? '0.00000001' : '0.01'}
                  value={accInput[key]}
                  onChange={e => setAccInput(s => ({ ...s, [key]: e.target.value }))}
                  placeholder={mode === 'asset' ? `0 ${label}` : '$0.00'}
                  className="flex-1 px-2 py-1.5 text-sm rounded-md border border-border bg-background"
                />
                <button
                  onClick={() => addAccumulation(key)}
                  disabled={update.isPending}
                  className="px-3 py-1.5 rounded-md bg-emerald-500 text-background text-xs font-bold disabled:opacity-50"
                >Pridať</button>
              </div>
              {preview && <p className="text-[10px] text-muted-foreground">{preview} @ ${price.toFixed(2)}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
