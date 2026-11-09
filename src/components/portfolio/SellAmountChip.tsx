/**
 * SellAmountChip — presné množstvo tokenu na predaj (Qty × TP %) s kopírovaním.
 * Zobrazuje sa v Harvest karte aj v PnL prehľade vedľa „Koľko vybrať (%)".
 */
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import type { HarvestToken } from '@/lib/harvestEngine';

const sk = (n: number, d: number) => n.toFixed(d).replace('.', ',');

export function sellDecimals(token: HarvestToken | string): number {
  return token === 'BTC' ? 6 : token === 'ETH' ? 5 : 4;
}

export function computeSellQty(qty: number, tpPct: number): number {
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(tpPct) || tpPct <= 0) return 0;
  return (qty * tpPct) / 100;
}

export function SellAmountChip({
  token, qty, tpPct, priceUsd, sellQty,
}: {
  token: HarvestToken | string;
  qty: number;
  tpPct: number;
  priceUsd?: number;
  /** Optional override of the token quantity to sell. */
  sellQty?: number;
}) {
  const [copied, setCopied] = useState(false);
  const d = sellDecimals(token);
  const sell = sellQty !== undefined && Number.isFinite(sellQty) && sellQty > 0
    ? sellQty
    : computeSellQty(qty, tpPct);
  const raw = sell.toFixed(d);
  const usd = priceUsd && priceUsd > 0 ? sell * priceUsd : 0;

  if (sell <= 0) {
    return (
      <span className="inline-flex items-center text-[11px] font-mono px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/35 transition-all duration-300 ease-in-out">
        Predať: —
      </span>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
    } catch {
      /* clipboard nedostupný */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-lg border border-[#14F195]/25 bg-[#14F195]/[0.08] text-[#14F195] max-w-full transition-all duration-300 ease-in-out hover:bg-[#14F195]/10">
      <span className="tabular-nums truncate">
        Predať: {sk(sell, d)} {token}
        {usd > 0 && <span className="text-[#14F195]/60"> · ${sk(usd, 2)}</span>}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={`Kopírovať množstvo ${raw} ${token}`}
        className="inline-flex items-center gap-1 pl-1.5 ml-0.5 border-l border-[#14F195]/25 text-[10px] active:opacity-70"
      >
        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
        {copied ? 'Skopírované!' : 'Kopírovať'}
      </button>
    </span>
  );
}
