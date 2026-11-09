/**
 * Unified asset cards — zlúčené sekcie „Portfólio · reálne PnL“ a
 * „Take-Profit / Harvest Status“ do jednej karty na aktívum.
 *
 * Jedna karta obsahuje: aktuálnu hodnotu, vložený kapitál, nerealizované PnL,
 * overheat teplomer, 10-faktorové skóre (farebné progress bary),
 * odporúčanie na výber a smerovanie / prevodové tlačidlá.
 *
 * Kategórie: Core (BTC + wBTC) · Satelity (všetko ostatné) · Zisky.
 */
import { useEffect, useState } from 'react';
import { publishTakeProfit } from '@/lib/takeProfitRecommendations';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Wallet, Settings2, Lock, ArrowLeftRight, Flame, Loader2, ArrowRight, Check,
  ChevronDown, ShieldCheck, ShieldAlert, ShieldX,
} from 'lucide-react';
import { HARVEST_TOKENS, type HarvestToken, type HarvestVerdict } from '@/lib/harvestEngine';
import { usePortfolioAssets, type PortfolioAsset } from '@/hooks/usePortfolioAssets';
import { SellAmountChip } from '@/components/portfolio/SellAmountChip';
import { HoldingsSettingsModal } from '@/components/portfolio/HoldingsSettingsModal';
import { TpTargetsLine } from '@/components/portfolio/TpTargetsLine';
import { useFearGreed } from '@/hooks/usePrices';
import { useHarvestScores } from '@/hooks/useHarvestScores';
import { logHarvest, pressureRelief, useHarvestLog } from '@/lib/harvestLog';
import { useExtraAssetsState } from '@/lib/extraAssets';
import { useExtraAssetPrices } from '@/hooks/useExtraAssetPrices';
import { EXTRA_LABELS, type ExtraAsset } from '@/lib/portfolioCategories';
import { useRealizedProfit } from '@/hooks/useRealizedProfit';
import { calculateDynamicProfitSkim } from '@/lib/dynamicProfitSkim';
import { getProfitRouting, getReentrySignal, routeLabel } from '@/lib/profitRouting';
import { toast } from 'sonner';
import { usePortfolioTelegramAlerts } from '@/hooks/usePortfolioTelegramAlerts';
import { useDynamicPortfolioTokens } from '@/hooks/useDynamicPortfolioTokens';
import { AssetLayerBreakdown } from '@/components/portfolio/AssetLayerBreakdown';


const sk = (n: number, d = 2) => n.toFixed(d).replace('.', ',');
const usd = (n: number) => `$${sk(n)}`;
const signedUsd = (n: number) => `${n >= 0 ? '+' : ''}$${sk(Math.abs(n))}`;
const signedPct = (n: number) => `${n >= 0 ? '+' : ''}${sk(n)} %`;
const qtyFmt = (n: number) => (n >= 100 ? sk(n, 2) : n >= 1 ? sk(n, 4) : sk(n, 6));

const CATEGORY_COLOR: Record<string, string> = {
  A: 'text-[#14F195] border-[#14F195]/30 bg-[#14F195]/10',
  WATCH: 'text-sky-300 border-sky-400/30 bg-sky-400/10',
  B: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
  C: 'text-orange-300 border-orange-400/30 bg-orange-400/10',
  D: 'text-red-300 border-red-400/30 bg-red-400/10',
};

const textSwap = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: { duration: 0.3, ease: 'easeInOut' as const },
};

/** Prevzaté z Harvest sekcie — farebný overheat teplomer. */
function OverheatMeter({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="relative h-2.5 rounded-full overflow-hidden bg-white/[0.06]">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(90deg,#22d3ee 0%,#14F195 28%,#facc15 58%,#fb923c 78%,#ef4444 100%)',
        }}
      />
      <div
        className="absolute inset-y-0 right-0 bg-[#08080c]/85 backdrop-blur-[1px]"
        style={{ width: `${100 - v}%` }}
      />
      <div
        className="absolute top-[-3px] w-[3px] h-[16px] rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
        style={{ left: `calc(${v}% - 1.5px)` }}
      />
    </div>
  );
}

const layerColor = (score: number) =>
  score >= 7 ? 'bg-red-400' : score >= 5 ? 'bg-orange-400' : score >= 3 ? 'bg-amber-300' : 'bg-[#14F195]';

/** Farebné progress bary 10-faktorového skóre (prevzaté z Harvest sekcie). */
function FactorBars({ v }: { v: HarvestVerdict }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
      {v.layers.filter(l => l.weight > 0).map(l => (
        <div key={l.key} className="rounded-md bg-white/[0.03] px-2 py-1.5">
          <div className="flex items-start justify-between gap-2 text-[10px] font-mono">
            <div className="min-w-0">
              <p className="text-white/70">{l.label}</p>
              <p className="text-white/35 truncate">{l.note}</p>
            </div>
            <span className="text-white/80 tabular-nums shrink-0">{sk(l.score, 1)}</span>
          </div>
          <div className="mt-1 h-1 w-full rounded-full bg-white/[0.06] overflow-hidden">
            <motion.div
              className={`h-full rounded-full ${layerColor(l.score)}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(0, Math.min(100, l.score * 10))}%` }}
              transition={{ duration: 0.6, ease: 'easeInOut' }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

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

/** Jedna zjednotená karta aktíva: PnL + Harvest / Take-Profit. */
function UnifiedAssetCard({
  a, v, overheat, btcOverheatScore, fearGreed, isLoading, realizedProfit,
}: {
  a: PortfolioAsset;
  v?: HarvestVerdict;
  overheat: number;
  /** „Vybrané zisky“ z tohto aktíva (USD, realizované) */
  realizedProfit: number;
  btcOverheatScore: number;
  fearGreed: number;
  isLoading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);

  const color = a.realPnLUsd >= 0 ? 'text-[#14F195]' : 'text-red-400';
  const heat = overheat >= 70 ? 'text-red-400' : overheat >= 45 ? 'text-amber-300' : 'text-white/45';

  const rawSkim = calculateDynamicProfitSkim(
    a.investedCapital, a.currentFiatValue, a.tokenPrice, a.realPnL ?? 0, a.overheatScore,
  );
  const route = getProfitRouting(a.assetSymbol, btcOverheatScore, fearGreed);
  const skimQty = route.hold ? 0 : rawSkim;
  const skimUsd = skimQty > 0 && a.tokenPrice > 0 ? skimQty * a.tokenPrice : 0;
  const cardLabel = route.hold ? 'Nič — zisk necháme v BTC' : skimQty > 0 ? `Predať ${sk(skimQty, 6)} ${a.assetSymbol}` : 'TP zablokované: Zisk pod limitom (+15 %)';
  const dest = routeLabel(route);
  useEffect(() => {
    publishTakeProfit({
      symbol: a.assetSymbol, sellQty: skimQty, sellUsd: skimUsd,
      pnlUsd: a.realPnLUsd, pnlPct: a.realPnL ?? null, price: a.tokenPrice,
      hold: route.hold, label: cardLabel, destination: dest,
    });
  }, [a.assetSymbol, skimQty, skimUsd, a.realPnLUsd, a.realPnL, a.tokenPrice, route.hold, cardLabel, dest]);

  return (
    <div className="px-3 sm:px-4 py-3 space-y-2.5 transition-all duration-300 ease-in-out">
      {/* Head */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <span className="text-sm font-bold font-mono text-white">{a.assetSymbol}</span>
          <span className="text-[10px] font-mono text-white/35">
            {a.tokenPrice > 0 ? `$${sk(a.tokenPrice, a.tokenPrice >= 1000 ? 2 : 3)}` : (isLoading ? '…' : 'n/a')}
          </span>
          {a.weight > 0 && (
            <span className="text-[10px] font-mono text-white/45">{sk(a.weight * 100, 1)} %</span>
          )}
          <span className={`text-[10px] font-mono ${heat}`}>🌡 {sk(overheat, 0)}</span>
          {v && (
            <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${CATEGORY_COLOR[v.category]}`}>
              {v.categoryLabel}
            </span>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-mono text-white tabular-nums">{usd(a.currentFiatValue)}</p>
          <p className={`text-[10px] font-mono tabular-nums ${color}`}>
            {a.realPnL != null ? `${signedUsd(a.realPnLUsd)} · ${signedPct(a.realPnL)}` : '—'}
          </p>
          <p className="text-[10px] font-mono tabular-nums text-white/45" title="Rozklad nerealizovaného PnL">
            📈 {signedUsd(a.priceActionUsd)} · 🌾 {signedUsd(a.stakingYieldUsd)}
          </p>
          {v && (
            <p className="text-[10px] font-mono text-white/40">
              skóre {sk(v.score, 2)}<span className="text-white/25">/10</span>
            </p>
          )}
          <p className="text-[10px] font-mono tabular-nums text-[#F7931A]" title="Vybrané zisky (realizované)">
            💰 {signedUsd(realizedProfit)}
          </p>
        </div>
      </div>

      {/* Overheat thermometer */}
      <OverheatMeter value={overheat} />
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[10px] font-mono text-white/40">Overheat {sk(overheat, 0)} / 100</p>
        {v?.liteModel && (
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-amber-400/25 bg-amber-400/[0.06] text-amber-200/70"
            title={v.missingFactors.length ? `Chýba: ${v.missingFactors.join(', ')}` : 'Čiastočné dáta z API'}
          >
            Lite model (čiastočné dáta)
          </span>
        )}
      </div>

      {/* Rozklad nerealizovaného PnL: cenový pohyb vs staking výnos */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-widest font-mono text-white/35">Cenový pohyb</p>
          <p className={`text-[11px] font-mono tabular-nums ${a.priceActionUsd >= 0 ? 'text-[#14F195]' : 'text-red-400'}`}>
            {signedUsd(a.priceActionUsd)}
          </p>
        </div>
        <div className="rounded-lg border border-[#14F195]/20 bg-[#14F195]/[0.05] px-2 py-1.5">
          <p className="text-[9px] uppercase tracking-widest font-mono text-white/35">Staking výnos</p>
          <p className="text-[11px] font-mono tabular-nums text-[#14F195]">{signedUsd(a.stakingYieldUsd)}</p>
        </div>
      </div>

      {/* Vnorené stavy: Liquid / Staked / Collateral / Borrow */}
      <AssetLayerBreakdown a={a} />

      {/* Qty / WACB / vložený kapitál */}
      <div className="min-w-0">
        <p className="text-[10px] font-mono text-white/35">
          Qty {qtyFmt(a.tokenQuantity)} · WACB {a.wacb > 0 ? `$${sk(a.wacb, a.wacb >= 1000 ? 2 : 3)}` : 'nezadané'}
          {' • '}
          <span className="text-white/55">Vložené {usd(a.investedCapital)}</span>
          {a.tpPct ? ` · TP ${sk(a.tpPct, 2)} %` : ''}
        </p>
        <TpTargetsLine wacb={a.wacb} />
      </div>

      {/* Odporúčanie výberu */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-mono text-white/70 min-w-0">
          <span className="text-white/40">Koľko vybrať: </span>
          {route.hold ? 'Nič — zisk necháme v BTC' : (v?.howMuchText ?? '—')}
        </p>
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

      {/* Smerovanie + záznam výberu */}
      <div className="flex items-center justify-between gap-2 flex-wrap text-[11px] font-mono">
        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border transition-all duration-300 ${
          route.hold || route.token === 'wBTC'
            ? 'text-[#F7931A] border-[#F7931A]/30 bg-[#F7931A]/10'
            : 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
        }`}>
          Smerovať do: {routeLabel(route)} {!route.hold && <ArrowRight className="w-3 h-3" />}
        </span>
        <button
          type="button"
          disabled={logged || route.hold || !v}
          onClick={() => {
            if (!v) return;
            logHarvest({
              token: v.token, score: v.score, tpPct: v.tpPct,
              destination: routeLabel(route), overheat,
            });
            setLogged(true);
            toast.success(`Výber zaznamenaný: ${v.token} ${sk(v.tpPct)} % → ${routeLabel(route)}`);
            setTimeout(() => setLogged(false), 2500);
          }}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-white/80 active:bg-white/10 disabled:opacity-60"
        >
          {logged ? <Check className="w-3.5 h-3.5 text-[#14F195]" /> : <Flame className="w-3.5 h-3.5 text-orange-400" />}
          {logged ? 'Zaznamenané' : 'Zaznamenať výber'}
        </button>
      </div>

      {skimQty > 0 && (
        <p className="text-[10px] font-mono text-white/30">
          Dynamický skim: {sk(skimQty, 6)} {a.assetSymbol} = {usd(skimUsd)}
        </p>
      )}

      {/* 10-faktorové skóre */}
      {v && (
        <>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="flex items-center gap-1 text-[10px] font-mono text-white/40"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
            Zobraziť 10-faktorové skóre
          </button>
          {open && <FactorBars v={v} />}
        </>
      )}
    </div>
  );
}

const CORE_SCORED = ['BTC'];
const SATELLITE_SCORED = ['ETH', 'SOL', 'LINK', 'AAVE'];
const HIGH_BETA_SCORED = ['HYPE'];


export function UnifiedAssetCards() {
  const {
    assets, byToken, prices, totalFiatValue, totalInvestedCapital,
    totalPnlUsd, totalPnlPct, configuredCount, isLoading, btcOverheatScore,
    totalStakedValueUsd, totalPriceActionUsd, totalStakingYieldUsd,
  } = usePortfolioAssets();
  const { data: fg } = useFearGreed();
  const fearGreed = fg?.value ?? 50;
  const { data: harvest, isLoading: harvestLoading } = useHarvestScores(fearGreed);
  const realized = useRealizedProfit();
  useHarvestLog();
  const extras = useExtraAssetsState();
  const { data: extraPrices } = useExtraAssetPrices();
  const [editing, setEditing] = useState(false);

  const extraValue = (a: ExtraAsset) => extras[a].qty * (Number(extraPrices?.[a]) || 0);
  // wBTC už NIE je samostatné aktívum — je zlúčené do BTC (useEffectiveHoldings).
  const extrasTotal = (['PAXG', 'USDC', 'USDT'] as ExtraAsset[])
    .reduce((s, a) => s + extraValue(a), 0);

  // Dynamické tokeny (ZEC, ENA a čokoľvek pridané v Portfóliu / DCA) —
  // dostanú identickú, plnohodnotnú kartu ako BTC/ETH/SOL.
  const dyn = useDynamicPortfolioTokens({
    fearGreed,
    portfolioTotalUsd: totalFiatValue + extrasTotal,
  });

  const grandTotal = totalFiatValue + extrasTotal + dyn.totalFiatValue;

  const profitAssets = (['PAXG', 'USDC', 'USDT'] as ExtraAsset[]).filter(a => extras[a].qty > 0);
  const profitsTotal = profitAssets.reduce((s, a) => s + extraValue(a), 0);
  const reentry = getReentrySignal(btcOverheatScore, fearGreed);
  const combinedPnlUsd = totalPnlUsd + dyn.totalPnlUsd;
  const combinedInvested = totalInvestedCapital + dyn.totalInvestedCapital;
  const combinedPnlPct = combinedInvested > 0 ? (combinedPnlUsd / combinedInvested) * 100 : totalPnlPct;
  const totalPnlColor = combinedPnlUsd >= 0 ? 'text-[#14F195]' : 'text-red-400';


  const risk = harvest?.wbtcRisk;
  const RiskIcon = risk?.status === 'ok' ? ShieldCheck : risk?.status === 'warn' ? ShieldAlert : ShieldX;

  const sectionValue = (syms: string[]) =>
    syms.reduce((s, t) => s + (byToken[t as HarvestToken]?.currentFiatValue ?? 0), 0);
  const group = (syms: string[]) => assets.filter(a => syms.includes(a.assetSymbol));

  const verdictFor = (sym: string) => harvest?.verdicts?.[sym as HarvestToken];
  const overheatFor = (sym: string) => {
    const v = verdictFor(sym);
    if (v) return v.overheat * pressureRelief(sym as HarvestToken);
    return byToken[sym as HarvestToken]?.overheatScore ?? 0;
  };

  // Automatické Telegram upozornenia: kritický overheat / dosiahnutý TP cieľ.
  // Zahŕňa aj dynamicky pridané tokeny — žiadny token nie je izolovaný.
  usePortfolioTelegramAlerts(
    [
      ...assets.map(a => ({ a, overheat: overheatFor(a.assetSymbol) })),
      ...dyn.cards.map(c => ({ a: c.asset, overheat: c.asset.overheatScore })),
    ]
      .filter(({ a }) => a.currentFiatValue > 0)
      .map(({ a, overheat }) => ({
        symbol: a.assetSymbol,
        overheat,
        pnlPct: a.realPnL,
        tpPct: a.tpPct,
        priceUsd: a.tokenPrice,
      })),
  );


  const ExtraRow = ({ asset, note }: { asset: ExtraAsset; note?: string }) => {
    const price = Number(extraPrices?.[asset]) || 0;
    const { qty, wacb } = extras[asset];
    const value = qty * price;
    const cost = qty * wacb;
    const pnlUsd = cost > 0 && price > 0 ? value - cost : 0;
    const pnlPct = cost > 0 && price > 0 ? (pnlUsd / cost) * 100 : null;
    const color = pnlUsd >= 0 ? 'text-[#14F195]' : 'text-red-400';
    return (
      <div className="px-3 sm:px-4 py-2.5 space-y-1">
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

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#14F195]" />
          <h2 className="text-sm font-bold text-white">Portfólio · PnL &amp; Take-Profit</h2>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08]"
        >
          <Settings2 className="w-3 h-3" /> Nastaviť
        </button>
      </div>

      {/* Summary */}
      <div className="px-3 sm:px-4 py-3 border-b border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono">Hodnota</p>
          <p className="text-lg font-mono font-bold text-white tabular-nums">{usd(grandTotal)}</p>
          {extrasTotal > 0 && (
            <p className="text-[10px] font-mono text-white/35">vrátane {usd(extrasTotal)} mimo DCA</p>
          )}
          {totalStakedValueUsd > 0 && (
            <p className="text-[10px] font-mono text-white/35">🔒 vrátane {usd(totalStakedValueUsd)} stakovaných</p>
          )}
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono">Nerealizované PnL</p>
          <p className={`text-lg font-mono font-bold tabular-nums ${totalPnlColor}`}>{signedUsd(combinedPnlUsd)}</p>
          <p className={`text-[10px] font-mono ${totalPnlColor}`}>
            {combinedPnlPct != null ? signedPct(combinedPnlPct) : 'zadaj WACB'}
          </p>
          <p className="text-[10px] font-mono text-white/40">
            📈 {signedUsd(totalPriceActionUsd + dyn.totalPriceActionUsd)} · 🌾 {signedUsd(totalStakingYieldUsd + dyn.totalStakingYieldUsd)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono">Vybrané zisky</p>
          <p className="text-lg font-mono font-bold text-[#F7931A] tabular-nums">{signedUsd(realized.total)}</p>
          <p className="text-[10px] font-mono text-white/35">všetky tokeny · vrátane odstránených</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono">Vložený kapitál</p>
          <p className="text-lg font-mono font-bold text-white/80 tabular-nums">{usd(combinedInvested)}</p>
          <p className="text-[10px] font-mono text-white/35">
            {configuredCount + dyn.cards.filter(c => c.asset.tokenQuantity > 0).length}
            /{HARVEST_TOKENS.length + dyn.cards.length} pozícií
          </p>
        </div>

      </div>

      {harvestLoading && !harvest && (
        <div className="py-3 flex items-center justify-center text-white/40 text-xs">
          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Počítam harvest skóre…
        </div>
      )}

      {/* CORE */}
      <SectionHeader label="Core" hint="BTC (vrátane wBTC)" value={sectionValue(CORE_SCORED)} />
      <div className="divide-y divide-white/[0.05]">
        {group(CORE_SCORED).map(a => (
          <UnifiedAssetCard
            key={a.assetSymbol}
            a={a}
            v={verdictFor(a.assetSymbol)}
            overheat={overheatFor(a.assetSymbol)}
            btcOverheatScore={btcOverheatScore}
            fearGreed={fearGreed}
            isLoading={isLoading}
            realizedProfit={realized.bySymbol[a.assetSymbol] ?? 0}
          />
        ))}
        
      </div>

      {([
        { key: 'SATELLITES', label: 'Satelites', scored: SATELLITE_SCORED },
        { key: 'HIGH_BETA', label: 'High-Beta', scored: HIGH_BETA_SCORED },
        { key: 'PROXY', label: 'Proxy', scored: [] as string[] },
      ] as const).map(sec => {
        const dc = dyn.cards.filter(c => c.basket === sec.key);
        const dv = dc.reduce((s2, c) => s2 + c.asset.currentFiatValue, 0);
        return (
          <div key={sec.key}>
            <SectionHeader
              label={sec.label}
              hint={[...sec.scored, ...dc.map(c => c.asset.assetSymbol)].join(' · ')}
              value={sectionValue([...sec.scored]) + dv}
            />
            <div className="divide-y divide-white/[0.05]">
              {group([...sec.scored]).map(a => (
                <UnifiedAssetCard
                  key={a.assetSymbol}
                  a={a}
                  v={verdictFor(a.assetSymbol)}
                  overheat={overheatFor(a.assetSymbol)}
                  btcOverheatScore={btcOverheatScore}
                  fearGreed={fearGreed}
                  isLoading={isLoading}
                  realizedProfit={realized.bySymbol[a.assetSymbol] ?? 0}
                />
              ))}
              {dc.map(c => (
                <UnifiedAssetCard
                  key={c.asset.assetSymbol}
                  a={c.asset}
                  v={c.verdict}
                  overheat={c.asset.overheatScore}
                  btcOverheatScore={btcOverheatScore}
                  fearGreed={fearGreed}
                  isLoading={dyn.isLoading}
                  realizedProfit={realized.bySymbol[c.asset.assetSymbol] ?? 0}
                />
              ))}
              {dyn.isLoading && dc.length === 0 && sec.scored.length === 0 && (
                <p className="px-3 sm:px-4 py-3 text-[11px] font-mono text-white/35">Načítavam…</p>
              )}
            </div>
          </div>
        );
      })}


      {/* PROFITS */}
      <SectionHeader label="Zisky" hint="iba odsaté zisky" value={profitsTotal} />
      <div className="divide-y divide-white/[0.05]">
        {profitAssets.length === 0 ? (
          <p className="px-3 sm:px-4 py-3 text-[11px] font-mono text-white/35">
            Žiadne odsaté zisky — kategória sa naplní až po Take-Profit.
          </p>
        ) : (
          profitAssets.map(a => (
            <ExtraRow
              key={a}
              asset={a}
              note={a === 'WBTC' ? 'z altcoinov → späť do BTC pri príležitosti'
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
        </div>
      </div>

      {/* WBTC Risk Check + contrarian */}
      {risk && (
        <div className="px-3 sm:px-4 py-3 border-t border-white/[0.06] space-y-1.5">
          <div className={`flex items-center gap-2 text-xs font-mono ${
            risk.status === 'ok' ? 'text-[#14F195]' : risk.status === 'warn' ? 'text-amber-300' : 'text-red-300'
          }`}>
            <RiskIcon className="w-4 h-4" /> WBTC Risk Check — {risk.verdict}
          </div>
          {risk.checks.map(c => (
            <p key={c.key} className="text-[10px] font-mono text-white/45">
              {c.status === 'ok' ? '✅' : c.status === 'warn' ? '⚠️' : '⛔️'} {c.label}: {c.detail}
            </p>
          ))}
        </div>
      )}
      {harvest?.contrarian && (
        <div className="px-3 sm:px-4 py-3 border-t border-white/[0.06]">
          <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono mb-1">Contrarian check</p>
          <p className="text-xs text-white/60 leading-relaxed">
            Kde je najväčšie riziko, že sa pri tomto TP rozhodnutí mýlime? {harvest.contrarian.replace(/\*/g, '')}
          </p>
        </div>
      )}

      <HoldingsSettingsModal open={editing} onClose={() => setEditing(false)} prices={prices} />
    </motion.section>
  );
}
