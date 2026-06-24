import { useEffect, useState } from 'react';
import { Minus, Plus, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { Lang } from '@/lib/i18n';
import { useAppSettings, useUpdateAppSettings } from '@/hooks/useAppSettings';
import { usePrices } from '@/hooks/usePrices';
import { Bento, Chip, Label } from '@/components/modern-portfolio/primitives';
import {
  COIN_LABEL,
  TOKEN_PRICE_ID,
  computeAddHoldingsUpdate,
  computeRemoveHoldingsUpdate,
  type CoinKey,
  type InputMode,
} from '@/lib/manualHoldingsAccumulator';

const COINS: CoinKey[] = ['btc', 'eth', 'sol'];

type ActionMode = 'add' | 'remove';

interface Props {
  lang: Lang;
  delay?: number;
}

export function ManualTokenAdjustCard({ lang, delay = 0.44 }: Props) {
  const sk = lang === 'sk';
  const { data: settings } = useAppSettings();
  const update = useUpdateAppSettings();
  const { data: prices } = usePrices();

  const [action, setAction] = useState<ActionMode>('add');
  const [accMode, setAccMode] = useState<Record<CoinKey, InputMode>>({ btc: 'asset', eth: 'asset', sol: 'asset' });
  const [accInput, setAccInput] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });
  const [accPrice, setAccPrice] = useState<Record<CoinKey, string>>({ btc: '', eth: '', sol: '' });
  const [priceTouched, setPriceTouched] = useState<Record<CoinKey, boolean>>({ btc: false, eth: false, sol: false });

  useEffect(() => {
    if (!prices) return;
    setAccPrice(prev => {
      const next = { ...prev };
      COINS.forEach(k => {
        if (priceTouched[k]) return;
        const spot = prices?.[TOKEN_PRICE_ID[k]]?.usd;
        if (spot && !prev[k]) next[k] = String(spot);
      });
      return next;
    });
  }, [prices, priceTouched]);

  const submit = async (key: CoinKey) => {
    if (!settings?.id) {
      toast.error(sk ? 'Nastavenia nie sú načítané' : 'Settings not loaded');
      return;
    }

    const raw = Number(accInput[key]);
    const spot = prices?.[TOKEN_PRICE_ID[key]]?.usd ?? 0;
    const customPrice = Number(accPrice[key]);
    const execPrice = customPrice > 0 ? customPrice : spot;

    const state = {
      manual_holdings: settings.manual_holdings as Record<CoinKey, number> | undefined,
      initial_cost_basis: settings.initial_cost_basis as Record<CoinKey, number> | undefined,
    };

    const result = action === 'add'
      ? computeAddHoldingsUpdate(key, raw, accMode[key], execPrice, state)
      : computeRemoveHoldingsUpdate(key, raw, accMode[key], execPrice, state);

    if ('error' in result) {
      toast.error(result.error);
      return;
    }

    try {
      await update.mutateAsync({
        id: settings.id,
        manual_holdings: result.manual_holdings,
        initial_cost_basis: result.initial_cost_basis,
      });

      setAccInput(s => ({ ...s, [key]: '' }));
      setPriceTouched(s => ({ ...s, [key]: false }));
      setAccPrice(s => ({ ...s, [key]: spot ? String(spot) : '' }));

      const label = COIN_LABEL[key];
      if (action === 'add') {
        toast.success(
          sk
            ? `+${result.deltaQty.toFixed(8)} ${label} @ $${result.execPrice.toFixed(2)} · priemer $${result.newAvg.toFixed(2)}`
            : `+${result.deltaQty.toFixed(8)} ${label} @ $${result.execPrice.toFixed(2)} · avg $${result.newAvg.toFixed(2)}`,
        );
      } else {
        toast.success(
          sk
            ? `−${result.deltaQty.toFixed(8)} ${label} @ $${result.execPrice.toFixed(2)} · zostatok ${result.manual_holdings[key].toFixed(8)}`
            : `−${result.deltaQty.toFixed(8)} ${label} @ $${result.execPrice.toFixed(2)} · remaining ${result.manual_holdings[key].toFixed(8)}`,
        );
      }
    } catch {
      toast.error(sk ? 'Uloženie zlyhalo' : 'Save failed');
    }
  };

  const isAdd = action === 'add';

  return (
    <section className="space-y-3 min-w-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Wallet className="w-4 h-4 text-[#14F195] shrink-0" />
          <Label className="!text-white/60">
            {sk ? 'Úprava držieb' : 'Adjust holdings'}
          </Label>
        </div>
        <div className="flex rounded-xl border border-white/10 overflow-hidden text-[11px] shrink-0 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => setAction('add')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 font-semibold transition-colors ${
              isAdd ? 'bg-emerald-500/20 text-emerald-300' : 'bg-transparent text-white/40 hover:text-white/70'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            {sk ? 'Pridať' : 'Add'}
          </button>
          <button
            type="button"
            onClick={() => setAction('remove')}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2 font-semibold border-l border-white/10 transition-colors ${
              !isAdd ? 'bg-orange-500/20 text-orange-300' : 'bg-transparent text-white/40 hover:text-white/70'
            }`}
          >
            <Minus className="w-3.5 h-3.5" />
            {sk ? 'Odobrať' : 'Remove'}
          </button>
        </div>
      </div>

      <Bento delay={delay} className={`p-4 sm:p-5 space-y-4 min-w-0 border ${isAdd ? 'border-emerald-500/20' : 'border-orange-500/20'}`}>
        <p className="text-xs text-white/40 leading-relaxed">
          {isAdd
            ? (sk
              ? 'Pridaj token — množstvo sa pripočíta, cost basis sa prepočíta váženým priemerom. Štatistiky portfólia sa okamžite aktualizujú.'
              : 'Add tokens — quantity is added and cost basis is updated via weighted average. Portfolio stats refresh immediately.')
            : (sk
              ? 'Odobrať / predať token — množstvo sa odpočíta, investovaná suma sa zníži proporcionálne. PnL a celková hodnota sa prepočítajú.'
              : 'Remove / sell tokens — quantity is deducted and invested amount is reduced proportionally. PnL and total value recalculate.')}
        </p>

        {COINS.map(key => {
          const label = COIN_LABEL[key];
          const spot = prices?.[TOKEN_PRICE_ID[key]]?.usd ?? 0;
          const mode = accMode[key];
          const v = Number(accInput[key]) || 0;
          const customPriceNum = Number(accPrice[key]);
          const execPrice = customPriceNum > 0 ? customPriceNum : spot;
          const held = Number((settings?.manual_holdings as Record<string, number> | undefined)?.[key] ?? 0);
          const isCustom = priceTouched[key] && customPriceNum > 0 && Math.abs(customPriceNum - spot) > 0.005;
          const preview = v > 0 && execPrice > 0
            ? (mode === 'asset'
              ? `≈ $${(v * execPrice).toFixed(2)}`
              : `≈ ${(v / execPrice).toFixed(8)} ${label}`)
            : '';

          return (
            <div key={key} className="rounded-2xl border border-white/[0.08] bg-black/30 p-3 sm:p-4 space-y-3 min-w-0">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-white">{label}</span>
                  {held > 0 && (
                    <Chip color="default">
                      {sk ? 'Držíš' : 'Held'}: {held.toFixed(key === 'btc' ? 6 : 4)}
                    </Chip>
                  )}
                </div>
                <div className="flex rounded-lg border border-white/10 overflow-hidden text-[10px] shrink-0">
                  <button
                    type="button"
                    onClick={() => setAccMode(s => ({ ...s, [key]: 'asset' }))}
                    className={`px-2.5 py-1 ${mode === 'asset' ? 'bg-white/15 text-white' : 'text-white/40'}`}
                  >
                    {sk ? `Množstvo ${label}` : `${label} qty`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAccMode(s => ({ ...s, [key]: 'usd' }))}
                    className={`px-2.5 py-1 border-l border-white/10 ${mode === 'usd' ? 'bg-white/15 text-white' : 'text-white/40'}`}
                  >
                    USD
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[10px] text-white/35 uppercase tracking-wide">
                    {isAdd
                      ? (sk ? 'Nákupná cena (USD)' : 'Buy price (USD)')
                      : (sk ? 'Predajná cena (USD)' : 'Sell price (USD)')}
                  </label>
                  {isCustom && spot > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setPriceTouched(s => ({ ...s, [key]: false }));
                        setAccPrice(s => ({ ...s, [key]: String(spot) }));
                      }}
                      className="text-[9px] text-emerald-400 hover:text-emerald-300"
                    >
                      {sk ? 'Reset spot' : 'Reset spot'}
                    </button>
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
                  className={`w-full px-3 py-2.5 text-sm rounded-xl border bg-black/50 font-mono text-white outline-none focus:border-white/25 min-w-0 ${
                    isCustom ? 'border-amber-500/40' : 'border-white/10'
                  }`}
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row min-w-0">
                <input
                  type="number"
                  step={mode === 'asset' ? '0.00000001' : '0.01'}
                  value={accInput[key]}
                  onChange={e => setAccInput(s => ({ ...s, [key]: e.target.value }))}
                  placeholder={mode === 'asset' ? `0 ${label}` : '$0.00'}
                  className="flex-1 px-3 py-2.5 text-sm rounded-xl border border-white/10 bg-black/50 font-mono text-white outline-none focus:border-white/25 min-w-0"
                />
                <button
                  type="button"
                  onClick={() => void submit(key)}
                  disabled={update.isPending}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wide disabled:opacity-50 shrink-0 w-full sm:w-auto ${
                    isAdd
                      ? 'bg-emerald-500 text-black hover:bg-emerald-400'
                      : 'bg-orange-500 text-black hover:bg-orange-400'
                  }`}
                >
                  {update.isPending
                    ? (sk ? 'Ukladám…' : 'Saving…')
                    : isAdd
                      ? (sk ? 'Pridať' : 'Add')
                      : (sk ? 'Odobrať' : 'Remove')}
                </button>
              </div>

              {preview && (
                <p className="text-[10px] text-white/35 font-mono">
                  {preview} @ ${execPrice.toFixed(2)}
                </p>
              )}
            </div>
          );
        })}
      </Bento>
    </section>
  );
}
