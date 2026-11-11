/**
 * Portfolio Configuration & Real PnL — exact quantity + average buy price
 * (WACB) per token, live value, unrealized PnL, overheat score and asset
 * weighting. Fully reactive via `usePortfolioAssets`.
 *
 * Rozdelenie: Core (BTC, wBTC) · Satelit (ETH, SOL) · Yield (HYPE, LINK, AAVE)
 * · Zisky (wBTC, PAXG, USDC, USDT — iba nenulové pozície).
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Settings2, Lock, ArrowLeftRight } from 'lucide-react';
import { HARVEST_TOKENS } from '@/lib/harvestEngine';
import { usePortfolioAssets, type PortfolioAsset } from '@/hooks/usePortfolioAssets';
import { SellAmountChip } from '@/components/portfolio/SellAmountChip';
import { HoldingsSettingsModal } from '@/components/portfolio/HoldingsSettingsModal';
import { TpTargetsLine } from '@/components/portfolio/TpTargetsLine';
import { useFearGreed } from '@/hooks/usePrices';
import { useExtraAssetsState } from '@/lib/extraAssets';
import { useExtraAssetPrices } from '@/hooks/useExtraAssetPrices';
import {
  CATEGORY_LABELS, EXTRA_LABELS, type ExtraAsset,
} from '@/lib/portfolioCategories';

import { calculateDynamicProfitSkim } from '@/lib/dynamicProfitSkim';
import { getProfitRouting, getReentrySignal } from '@/lib/profitRouting';

const sk = (n: number, d = 2) => n.toFixed(d).replace('.', ',');
const usd = (n: number) => `$${sk(n)}`;
const signedUsd = (n: number) => `${n >= 0 ? '+' : ''}$${sk(Math.abs(n))}`;
const signedPct = (n: number) => `${n >= 0 ? '+' : ''}${sk(n)} %`;
const qtyFmt = (n: number) => (n >= 100 ? sk(n, 2) : n >= 1 ? sk(n, 4) : sk(n, 6));

const textSwap = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.3, ease: 'easeInOut' as const },
};

function SectionHeader({ label, hint, value }: { label: string; hint?: string; value?: number }) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 bg-white/[0.025] border-y border-white/[0.05]">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] uppercase tracking-widest font-mono font-bold text-white/70">{label}</span>
        {hint && <span className="text-[10px] font-mono text-white/30 truncate">{hint}</span>}
      </div>
      {value != null && value > 0 && (
        <span className="text-[10px] font-mono text-white/45 tabular-nums">{usd(value)}</span>
      )}
    </div>
  );
}

export function PortfolioConfigCard() {
  const {
    assets, byToken, prices, totalFiatValue, totalInvestedCapital,
    totalPnlUsd, totalPnlPct, configuredCount, isLoading, btcOverheatScore,
  } = usePortfolioAssets();
  const { data: fg } = useFearGreed();
  const fearGreed = fg?.value ?? 50;
  const extras = useExtraAssetsState();
  const { data: extraPrices } = useExtraAssetPrices();
  const [editing, setEditing] = useState(false);

  const extraValue = (a: ExtraAsset) => extras[a].qty * (Number(extraPrices?.[a]) || 0);
  const extrasTotal = (['WBTC', 'PAXG', 'USDC', 'USDT'] as ExtraAsset[])
    .reduce((s, a) => s + extraValue(a), 0);
  const grandTotal = totalFiatValue + extrasTotal;

  const profitAssets = (['WBTC', 'PAXG', 'USDC', 'USDT'] as ExtraAsset[]).filter((a) => extras[a].qty > 0);
  const profitsTotal = profitAssets.reduce((s, a) => s + extraValue(a), 0);
  const reentry = getReentrySignal(btcOverheatScore, fearGreed);

  const totalPnlColor = totalPnlUsd >= 0 ? 'text-[#14F195]' : 'text-red-400';

  const sectionValue = (syms: string[]) =>
    syms.reduce((s, t) => s + (byToken[t as keyof typeof byToken]?.currentFiatValue ?? 0), 0);

  const ExtraRow = ({ asset, note }: { asset: ExtraAsset; note?: string }) => {
    const price = Number(extraPrices?.[asset]) || 0;
    const { qty, wacb } = extras[asset];
    const value = qty * price;
    const cost = qty * wacb;
    const pnlUsd = cost > 0 && price > 0 ? value - cost : 0;
    const pnlPct = cost > 0 && price > 0 ? (pnlUsd / cost) * 100 : null;
    const color = pnlUsd >= 0 ? 'text-[#14F195]' : 'text-red-400';
    return (
      <div className="px-3 sm:px-4 py-2.5 space-y-1 transition-all duration-300 ease-in-out">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold font-mono text-white">{EXTRA_LABELS[asset]}</span>
            <span className="text-[10px] font-mono text-white/35">
              {price > 0 ? `$${sk(price, price >= 1000 ? 2 : 3)}` : (isLoading ? '…' : 'n/a')}
            </span>
            {grandTotal > 0 && value > 0 && (
              <span className="text-[10px] font-mono text-white/45">{sk((value / grandTotal) * 100, 1)} %</span>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs font-mono text-white tabular-nums">{usd(value)}</p>
            <p className={`text-[10px] font-mono tabular-nums ${color}`}>
              {pnlPct != null ? `${signedUsd(pnlUsd)} · ${signedPct(pnlPct)}` : '—'}
            </p>
          </div>
        </div>
        <p className="text-[10px] font-mono text-white/35">
          Qty {qtyFmt(qty)} · WACB {wacb > 0 ? `$${sk(wacb, wacb >= 1000 ? 2 : 3)}` : 'nezadané'}
          {note ? ` • ${note}` : ''}
        </p>
      </div>
    );
  };

  const ScoredRow = ({ a }: { a: PortfolioAsset }) => {
    const color = a.realPnLUsd >= 0 ? 'text-[#14F195]' : 'text-red-400';
    const heat = a.overheatScore >= 70 ? 'text-red-400' : a.overheatScore >= 45 ? 'text-amber-300' : 'text-white/45';
    const heatBar = a.overheatScore >= 70 ? 'bg-red-400' : a.overheatScore >= 45 ? 'bg-amber-300' : 'bg-[#14F195]';

    const rawSkim = calculateDynamicProfitSkim(
      a.investedCapital,
      a.currentFiatValue,
      a.tokenPrice,
      a.realPnL ?? 0,
      a.overheatScore,
    );
    const route = getProfitRouting(a.assetSymbol, btcOverheatScore, fearGreed);
    const skimQty = route.hold ? 0 : rawSkim;
    const skimUsd = skimQty > 0 && a.tokenPrice > 0 ? skimQty * a.tokenPrice : 0;

    return (
      <div className="px-3 sm:px-4 py-2.5 space-y-2 transition-all duration-300 ease-in-out">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold font-mono text-white">{a.assetSymbol}</span>
            <span className="text-[10px] font-mono text-white/35 transition-all duration-300 ease-in-out">
              {a.tokenPrice > 0 ? `$${sk(a.tokenPrice, a.tokenPrice >= 1000 ? 2 : 3)}` : (isLoading ? '…' : 'n/a')}
            </span>
            {a.weight > 0 && (
              <span className="text-[10px] font-mono text-white/45 transition-all duration-300 ease-in-out">
                {sk(a.weight * 100, 1)} %
              </span>
            )}
            <span className={`text-[10px] font-mono transition-all duration-300 ease-in-out ${heat}`}>🌡 {sk(a.overheatScore, 0)}</span>
          </div>
          <div className="text-right">
            <p className="text-xs font-mono text-white tabular-nums transition-all duration-300 ease-in-out">
              {usd(a.currentFiatValue)}
            </p>
            <p className={`text-[10px] font-mono tabular-nums transition-all duration-300 ease-in-out ${color}`}>
              {a.realPnL != null ? `${signedUsd(a.realPnLUsd)} · ${signedPct(a.realPnL)}` : '—'}
            </p>
          </div>
        </div>

        {/* Overheat thermometer */}
        <div className="h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${heatBar}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(0, Math.min(100, a.overheatScore))}%` }}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
          />
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <p className="text-[10px] font-mono text-white/35 transition-all duration-300 ease-in-out">
              Qty {qtyFmt(a.tokenQuantity)} · WACB {a.wacb > 0 ? `$${sk(a.wacb, a.wacb >= 1000 ? 2 : 3)}` : 'nezadané'}
              {' • '}
              <span className="text-white/55">
                Aktuálna cena {a.tokenPrice > 0 ? `$${sk(a.tokenPrice, a.tokenPrice >= 1000 ? 2 : 3)}` : 'n/a'}
              </span>
              {a.tpPct ? ` · TP ${sk(a.tpPct, 2)} %` : ''}
            </p>
            <TpTargetsLine wacb={a.wacb} />
          </div>

          <AnimatePresence mode="wait">
            {skimQty > 0 ? (
              <motion.div key="sell" {...textSwap} className="flex items-center gap-1.5">
                <SellAmountChip
                  token={a.assetSymbol}
                  qty={a.tokenQuantity}
                  tpPct={a.tpPct}
                  priceUsd={a.tokenPrice}
                  sellQty={skimQty}
                />
              </motion.div>
            ) : (
              <motion.div key="locked" {...textSwap} className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded-lg border border-white/[0.08] bg-white/[0.02] text-white/35">
                <Lock className="w-3 h-3" />
                {route.hold ? 'Zisk pod limitom / Nechávať v BTC' : 'TP zablokované: Zisk pod limitom (+15 %)'}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Recommendation & routing */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] font-mono">
          <AnimatePresence mode="wait">
            {skimQty > 0 ? (
              <motion.div key="route" {...textSwap} className="flex items-center gap-2 flex-wrap">
                <span className="text-[#14F195]">Odsatie zisku do {route.token}</span>
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] text-white/70">
                  <span className="font-bold text-white">{route.token}</span>
                  <span className="text-white/30">/</span>
                  <span className="text-white/50">{route.network}</span>
                </span>
                {route.reason && <span className="text-white/30">{route.reason}</span>}
              </motion.div>
            ) : (
              <motion.div key="noroute" {...textSwap} className="text-white/35">
                {route.hold ? 'Smerovať do: Nechávať v BTC (HODL)' : 'Smerovať do: —'}
              </motion.div>
            )}
          </AnimatePresence>
          {skimQty > 0 && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}
              className="text-[10px] text-white/30"
            >
              Dynamický skim: {sk(skimQty, 6)} {a.assetSymbol} = {usd(skimUsd)}
            </motion.div>
          )}
        </div>
      </div>
    );
  };

  const group = (syms: string[]) => assets.filter((a) => syms.includes(a.assetSymbol));

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#14F195]" />
          <h2 className="text-sm font-bold text-white">Portfólio · reálne PnL</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-white/70 transition-all duration-300 ease-in-out hover:bg-white/[0.08]"
          >
            <Settings2 className="w-3 h-3" /> Nastaviť
          </button>
        </div>
      </div>

      <div className="px-3 sm:px-4 py-3 border-b border-white/[0.06] grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono">Hodnota</p>
          <p className="text-lg font-mono font-bold text-white tabular-nums transition-all duration-300 ease-in-out">
            {usd(grandTotal)}
          </p>
          {extrasTotal > 0 && (
            <p className="text-[10px] font-mono text-white/35">vrátane {usd(extrasTotal)} mimo DCA</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono">Nerealizované PnL</p>
          <p className={`text-lg font-mono font-bold tabular-nums transition-all duration-300 ease-in-out ${totalPnlColor}`}>
            {signedUsd(totalPnlUsd)}
          </p>
          <p className={`text-[10px] font-mono transition-all duration-300 ease-in-out ${totalPnlColor}`}>
            {totalPnlPct != null ? signedPct(totalPnlPct) : 'zadaj WACB'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono">Vložený kapitál</p>
          <p className="text-lg font-mono font-bold text-white/80 tabular-nums transition-all duration-300 ease-in-out">
            {usd(totalInvestedCapital)}
          </p>
          <p className="text-[10px] font-mono text-white/35 transition-all duration-300 ease-in-out">
            {configuredCount}/{HARVEST_TOKENS.length} pozícií
          </p>
        </div>
      </div>

      {/* CORE */}
      <SectionHeader
        label={CATEGORY_LABELS.CORE}
        hint="BTC + wBTC (cieľ ziskov z altov)"
        value={sectionValue(['BTC']) + extraValue('WBTC')}
      />
      <div className="divide-y divide-white/[0.05]">
        {group(['BTC']).map((a) => <ScoredRow key={a.assetSymbol} a={a} />)}
        <ExtraRow asset="WBTC" note="zisky z altcoinov" />
      </div>

      {/* SATELLITES */}
      <SectionHeader
        label={CATEGORY_LABELS.SATELLITES}
        hint="ETH · SOL · LINK · AAVE · HYPE"
        value={sectionValue(['ETH', 'SOL', 'LINK', 'AAVE', 'HYPE'])}
      />
      <div className="divide-y divide-white/[0.05]">
        {group(['ETH', 'SOL', 'LINK', 'AAVE', 'HYPE']).map((a) => <ScoredRow key={a.assetSymbol} a={a} />)}
      </div>

      {/* PROFITS */}
      <SectionHeader label={CATEGORY_LABELS.PROFITS} hint="iba odsaté zisky" value={profitsTotal} />
      <div className="divide-y divide-white/[0.05]">
        {profitAssets.length === 0 ? (
          <p className="px-3 sm:px-4 py-3 text-[11px] font-mono text-white/35">
            Žiadne odsaté zisky — kategória sa naplní až po Take-Profit.
          </p>
        ) : (
          profitAssets.map((a) => (
            <ExtraRow
              key={a}
              asset={a}
              note={a === 'WBTC' ? 'zo altcoinov → späť do BTC pri príležitosti'
                : a === 'USDC' ? 'späť do wBTC pri príležitosti'
                : 'späť do BTC pri príležitosti'}
            />
          ))
        )}
        <div className="px-3 sm:px-4 py-2.5 space-y-1">
          <div className={`flex items-center gap-1.5 text-[11px] font-mono ${reentry.active ? 'text-[#14F195]' : 'text-white/40'}`}>
            <ArrowLeftRight className="w-3.5 h-3.5" />
            {reentry.active ? 'Rotácia ziskov aktívna' : 'Rotácia ziskov: čakať'}
          </div>
          <p className="text-[10px] font-mono text-white/35">{reentry.reason}</p>
          <p className="text-[10px] font-mono text-white/30">
            PAXG / USDT → BTC · USDC → wBTC · BTC zisky → {getProfitRouting('BTC', Math.max(btcOverheatScore, 67), fearGreed).token} podľa indikátorov
          </p>
        </div>
      </div>

      <HoldingsSettingsModal open={editing} onClose={() => setEditing(false)} prices={prices} />
    </motion.section>
  );
}
