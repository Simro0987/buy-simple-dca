import { useEffect, useState } from 'react';
import { Wallet, Plus, Minus } from 'lucide-react';
import { toast } from 'sonner';
import { usePrices } from '@/hooks/usePrices';
import {
  computeAddHoldingsUpdate,
  computeRemoveHoldingsUpdate,
  TOKEN_PRICE_ID,
  type CoinKey,
} from '@/lib/manualHoldingsAccumulator';
import { useUserHoldings } from '@/hooks/useUserHoldings';
import { persistHoldingsUpdate, persistUserHoldings, userHoldingsAsState } from '@/lib/userHoldingsPersistence';
import { coinKeyToSymbol } from '@/lib/portfolioRealHoldings';

const COINS: { key: CoinKey; label: string }[] = [
  { key: 'btc', label: 'BTC' },
  { key: 'eth', label: 'ETH' },
  { key: 'sol', label: 'SOL' },
];

type Mode = 'asset' | 'usd';

export function InitialHoldingsCard() {
  const { data: prices } = usePrices();
  const { holdings: userHoldings } = useUserHoldings();

  const [holdings, setHoldings] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });
  const [costBasis, setCostBasis] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });

  const [accMode, setAccMode] = useState<Record<CoinKey, Mode>>({ btc: 'asset', eth: 'asset', sol: 'asset' });
  const [accInput, setAccInput] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });
  const [accPrice, setAccPrice] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });
  const [priceTouched, setPriceTouched] = useState<Record<CoinKey, boolean>>({ btc: false, eth: false, sol: false });

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
    setHoldings({
      btc: userHoldings.BTC.tokenAmount ? String(userHoldings.BTC.tokenAmount) : '',
      eth: userHoldings.ETH.tokenAmount ? String(userHoldings.ETH.tokenAmount) : '',
      sol: userHoldings.SOL.tokenAmount ? String(userHoldings.SOL.tokenAmount) : '',
    });
    setCostBasis({
      btc: userHoldings.BTC.investedUsd ? String(userHoldings.BTC.investedUsd) : '',
      eth: userHoldings.ETH.investedUsd ? String(userHoldings.ETH.investedUsd) : '',
      sol: userHoldings.SOL.investedUsd ? String(userHoldings.SOL.investedUsd) : '',
    });
  }, [userHoldings]);

  const save = () => {
    const next = {
      BTC: {
        tokenAmount: Number(holdings.btc) || 0,
        averageBuyPrice: Number(holdings.btc) > 0 && Number(costBasis.btc) > 0
          ? Number(costBasis.btc) / Number(holdings.btc)
          : 0,
        investedUsd: Number(costBasis.btc) || 0,
      },
      ETH: {
        tokenAmount: Number(holdings.eth) || 0,
        averageBuyPrice: Number(holdings.eth) > 0 && Number(costBasis.eth) > 0
          ? Number(costBasis.eth) / Number(holdings.eth)
          : 0,
        investedUsd: Number(costBasis.eth) || 0,
      },
      SOL: {
        tokenAmount: Number(holdings.sol) || 0,
        averageBuyPrice: Number(holdings.sol) > 0 && Number(costBasis.sol) > 0
          ? Number(costBasis.sol) / Number(holdings.sol)
          : 0,
        investedUsd: Number(costBasis.sol) || 0,
      },
    };
    persistUserHoldings(next);
    toast.success('Holdingy uložené ✓');
  };

  const addAccumulation = (key: CoinKey) => {
    const raw = Number(accInput[key]);
    const spot = prices?.[TOKEN_PRICE_ID[key]]?.usd ?? 0;
    const customPrice = Number(accPrice[key]);
    const execPrice = customPrice > 0 ? customPrice : spot;

    const result = computeAddHoldingsUpdate(key, raw, accMode[key], execPrice, userHoldingsAsState(userHoldings));
    if ('error' in result) {
      toast.error(result.error);
      return;
    }

    persistHoldingsUpdate(key, result);
    setAccInput(s => ({ ...s, [key]: '' }));
    setPriceTouched(s => ({ ...s, [key]: false }));
    setAccPrice(s => ({ ...s, [key]: spot ? String(spot) : '' }));
    toast.success(
      `+${result.deltaQty.toFixed(8)} ${key.toUpperCase()} @ $${result.execPrice.toFixed(2)} pridané. Nový priemer: $${result.newAvg.toFixed(2)}`,
    );
  };

  const removeAccumulation = (key: CoinKey) => {
    const raw = Number(accInput[key]);
    const spot = prices?.[TOKEN_PRICE_ID[key]]?.usd ?? 0;
    const customPrice = Number(accPrice[key]);
    const execPrice = customPrice > 0 ? customPrice : spot;

    const result = computeRemoveHoldingsUpdate(key, raw, accMode[key], execPrice, userHoldingsAsState(userHoldings));
    if ('error' in result) {
      toast.error(result.error);
      return;
    }

    persistHoldingsUpdate(key, result);
    setAccInput(s => ({ ...s, [key]: '' }));
    setPriceTouched(s => ({ ...s, [key]: false }));
    setAccPrice(s => ({ ...s, [key]: spot ? String(spot) : '' }));
    toast.success(
      `−${result.deltaQty.toFixed(8)} ${key.toUpperCase()} @ $${result.execPrice.toFixed(2)} odobraté. Zostatok: ${result.manual_holdings[key].toFixed(8)}`,
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Holdingy & cost basis</h3>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Holdings = množstvo, Cost basis = USD ktoré si minul. Ukladá sa do lokálneho portfólia
        (portfolio_real_holdings). Smart Manual Accumulator nižšie pridáva nové nákupy a počíta weighted average.
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
        className="w-full px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold"
      >
        Uložiť
      </button>

      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-400" />
          <h4 className="text-sm font-semibold text-emerald-300">Smart Manual Accumulator</h4>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Pridaj nový nákup — Holdings sa pripočítajú, priemerná nákupná cena sa prepočíta váženým priemerom.
        </p>

        {COINS.map(({ key, label }) => {
          const spot = prices?.[TOKEN_PRICE_ID[key]]?.usd ?? 0;
          const mode = accMode[key];
          const v = Number(accInput[key]) || 0;
          const customPriceNum = Number(accPrice[key]);
          const execPrice = customPriceNum > 0 ? customPriceNum : spot;
          const isCustom = priceTouched[key] && customPriceNum > 0 && Math.abs(customPriceNum - spot) > 0.005;
          const preview = v > 0 && execPrice > 0
            ? (mode === 'asset'
                ? `≈ $${(v * execPrice).toFixed(2)}`
                : `≈ ${(v / execPrice).toFixed(8)} ${label}`)
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

              <div className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-muted-foreground">
                    Nákupná cena (USD) <span className="text-muted-foreground/70">· Execution Price</span>
                  </label>
                  {isCustom && spot > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPriceTouched(s => ({ ...s, [key]: false }));
                        setAccPrice(s => ({ ...s, [key]: String(spot) }));
                      }}
                      className="text-[9px] text-emerald-400 hover:text-emerald-300 underline-offset-2 hover:underline"
                    >Reset na spot</button>
                  )}
                </div>
                <input
                  type="number"
                  step="0.01"
                  value={accPrice[key]}
                  onChange={e => {
                    setPriceTouched(s => ({ ...s, [key]: true }));
                    setAccPrice(s => ({ ...s, [key]: e.target.value }));
                  }}
                  placeholder={spot > 0 ? spot.toFixed(2) : '0.00'}
                  className={`w-full px-2 py-1.5 text-sm rounded-md border bg-background tabular-nums ${
                    isCustom ? 'border-amber-500/50 text-amber-300' : 'border-border'
                  }`}
                />
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
                  className="px-3 py-1.5 rounded-md bg-emerald-500 text-background text-xs font-bold"
                >Pridať</button>
                <button
                  onClick={() => removeAccumulation(key)}
                  className="px-3 py-1.5 rounded-md bg-orange-500 text-background text-xs font-bold flex items-center gap-1"
                >
                  <Minus className="w-3 h-3" />
                  Odobrať
                </button>
              </div>
              {preview && (
                <p className="text-[10px] text-muted-foreground">
                  {preview} @ ${execPrice.toFixed(2)}{isCustom ? ' (vlastná)' : ''}
                </p>
              )}
              <p className="text-[9px] text-muted-foreground">
                Aktuálne: {userHoldings[coinKeyToSymbol(key)].tokenAmount.toFixed(8)} {label}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
