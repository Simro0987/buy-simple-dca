/**
 * HoldingsSettingsModal — jednoduchý formulár na zadanie držaného množstva (Qty)
 * a priemernej nákupnej ceny (WACB) pre 7 aktívnych tokenov.
 * Ukladá sa do localStorage (portfolio-holdings-v1) a napája PnL + Take-Profit engine.
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, RotateCcw, Save } from 'lucide-react';
import { toast } from 'sonner';
import { HARVEST_TOKENS, type HarvestToken } from '@/lib/harvestEngine';
import { resetHoldings, setHolding, useHoldings, type HoldingsState } from '@/lib/portfolioHoldings';
import { useEffectiveHoldings } from '@/hooks/useEffectiveHoldings';
import { EXTRA_ASSETS, EXTRA_LABELS, STABLE_ASSETS, type ExtraAsset } from '@/lib/portfolioCategories';
import { resetExtraAssets, setExtraAsset, useExtraAssetsState, type ExtraState } from '@/lib/extraAssets';
import { useExtraAssetPrices } from '@/hooks/useExtraAssetPrices';

type Draft = Record<HarvestToken, { qty: string; wacb: string }>;
type ExtraDraft = Record<ExtraAsset, { qty: string; wacb: string }>;

function toExtraDraft(e: ExtraState): ExtraDraft {
  return EXTRA_ASSETS.reduce((acc, t) => {
    acc[t] = {
      qty: e[t].qty > 0 ? String(e[t].qty) : '',
      wacb: e[t].wacb > 0 ? String(e[t].wacb) : '',
    };
    return acc;
  }, {} as ExtraDraft);
}

const num = (s: string) => {
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function toDraft(h: HoldingsState): Draft {
  return HARVEST_TOKENS.reduce((acc, t) => {
    acc[t] = {
      qty: h[t].qty > 0 ? String(h[t].qty) : '',
      wacb: h[t].wacb > 0 ? String(h[t].wacb) : '',
    };
    return acc;
  }, {} as Draft);
}

export function HoldingsSettingsModal({
  open, onClose, prices,
}: {
  open: boolean;
  onClose: () => void;
  prices?: Partial<Record<HarvestToken, number>>;
}) {
  const holdings = useHoldings();
  // Seed with the auto-synced state (Qty z portfólia, WACB z cost basis / live ceny).
  const effective = useEffectiveHoldings(prices);
  const [draft, setDraft] = useState<Draft>(() => toDraft(effective));
  const extraState = useExtraAssetsState();
  const { data: extraPrices } = useExtraAssetPrices();
  const [extraDraft, setExtraDraft] = useState<ExtraDraft>(() => toExtraDraft(extraState));

  // Re-seed the form each time the modal opens so it always reflects saved state.
  useEffect(() => { if (open) setDraft(toDraft(effective)); }, [open, holdings]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setExtraDraft(toExtraDraft(extraState)); }, [open, extraState]);

  const previewValue = useMemo(
    () => HARVEST_TOKENS.reduce((s, t) => s + num(draft[t].qty) * (Number(prices?.[t]) || 0), 0)
      + EXTRA_ASSETS.reduce((s, a) => s + num(extraDraft[a].qty) * (Number(extraPrices?.[a]) || 0), 0),
    [draft, prices, extraDraft, extraPrices],
  );

  if (!open) return null;

  const save = () => {
    for (const t of HARVEST_TOKENS) {
      setHolding(t, { qty: num(draft[t].qty), wacb: num(draft[t].wacb) });
    }
    for (const a of EXTRA_ASSETS) {
      const qty = num(extraDraft[a].qty);
      const wacb = num(extraDraft[a].wacb) || (STABLE_ASSETS.includes(a) && qty > 0 ? 1 : 0);
      setExtraAsset(a, { qty, wacb });
    }
    toast.success('Portfólio uložené');
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4">
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-white/10 bg-[#0A0A0A]">
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 px-4 py-3 border-b border-white/[0.08] bg-[#0A0A0A]">
          <div>
            <h3 className="text-sm font-bold text-white">Nastaviť portfólio</h3>
            <p className="text-[10px] font-mono text-white/40">Množstvo + priemerná nákupná cena (WACB)</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Zavrieť" className="p-1.5 rounded-lg border border-white/10 text-white/60">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          {HARVEST_TOKENS.map((t) => {
            const price = Number(prices?.[t]) || 0;
            const value = num(draft[t].qty) * price;
            return (
              <div key={t} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold font-mono text-white">{t}</span>
                  <span className="text-[10px] font-mono text-white/40">
                    {price > 0 ? `$${price.toFixed(price >= 1000 ? 2 : 3)}` : 'cena n/a'}
                    {value > 0 && <span className="text-white/70"> · ${value.toFixed(2)}</span>}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="block text-[10px] font-mono text-white/40">Množstvo (Qty)</span>
                    <input
                      inputMode="decimal"
                      value={draft[t].qty}
                      placeholder="0.0000"
                      onChange={(e) => setDraft(d => ({ ...d, [t]: { ...d[t], qty: e.target.value } }))}
                      className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-[12px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[#14F195]/40"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[10px] font-mono text-white/40">Priem. cena (WACB)</span>
                    <input
                      inputMode="decimal"
                      value={draft[t].wacb}
                      placeholder="0.00"
                      onChange={(e) => setDraft(d => ({ ...d, [t]: { ...d[t], wacb: e.target.value } }))}
                      className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-[12px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[#14F195]/40"
                    />
                  </label>
                </div>
              </div>
            );
          })}

          <div className="pt-1">
            <p className="text-[10px] uppercase tracking-widest font-mono font-bold text-white/50 mb-2">
              Zisky (wBTC · PAXG · USDC · USDT)
            </p>
            <div className="space-y-3">
              {EXTRA_ASSETS.map((a) => {
                const price = Number(extraPrices?.[a]) || 0;
                const value = num(extraDraft[a].qty) * price;
                return (
                  <div key={a} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold font-mono text-white">{EXTRA_LABELS[a]}</span>
                      <span className="text-[10px] font-mono text-white/40">
                        {price > 0 ? `$${price.toFixed(price >= 1000 ? 2 : 3)}` : 'cena n/a'}
                        {value > 0 && <span className="text-white/70"> · ${value.toFixed(2)}</span>}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="block text-[10px] font-mono text-white/40">Množstvo (Qty)</span>
                        <input
                          inputMode="decimal"
                          value={extraDraft[a].qty}
                          placeholder="0.0000"
                          onChange={(e) => setExtraDraft(d => ({ ...d, [a]: { ...d[a], qty: e.target.value } }))}
                          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-[12px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[#14F195]/40"
                        />
                      </label>
                      <label className="space-y-1">
                        <span className="block text-[10px] font-mono text-white/40">Priem. cena (WACB)</span>
                        <input
                          inputMode="decimal"
                          value={extraDraft[a].wacb}
                          placeholder={STABLE_ASSETS.includes(a) ? '1.00' : '0.00'}
                          onChange={(e) => setExtraDraft(d => ({ ...d, [a]: { ...d[a], wacb: e.target.value } }))}
                          className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-2 text-[12px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[#14F195]/40"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-white/[0.08] bg-[#0A0A0A]">
          <button
            type="button"
            onClick={() => { resetHoldings(); resetExtraAssets(); setDraft(toDraft(effective)); setExtraDraft(toExtraDraft(extraState)); toast.success('Portfólio vynulované'); }}
            className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-2 rounded-lg border border-red-400/25 bg-red-400/10 text-red-300"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Vynulovať
          </button>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-white/40">Σ ${previewValue.toFixed(2)}</span>
            <button
              type="button"
              onClick={save}
              className="inline-flex items-center gap-1.5 text-[12px] font-bold px-4 py-2 rounded-lg bg-[#14F195] text-black"
            >
              <Save className="w-3.5 h-3.5" /> Uložiť
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
