/**
 * Take-Profit / Harvest Status — per-token module for the Portfolio view.
 * Overheat meter + continuous TP % + dynamic profit skim + routing tag + harvest logging.
 */
import { useState } from 'react';
import { getProfitRouting, routeLabel, BTC_OVERHEAT_ROUTING_THRESHOLD } from '@/lib/profitRouting';
import { calculateDynamicProfitSkim } from '@/lib/dynamicProfitSkim';
import { usePortfolioAssets } from '@/hooks/usePortfolioAssets';

import { motion } from 'framer-motion';
import { Flame, Loader2, ShieldCheck, ShieldAlert, ShieldX, ArrowRight, Check, ChevronDown } from 'lucide-react';
import { useFearGreed } from '@/hooks/usePrices';
import { useHarvestScores } from '@/hooks/useHarvestScores';
import { HARVEST_TOKENS, type HarvestToken, type HarvestVerdict } from '@/lib/harvestEngine';
import { logHarvest, pressureRelief, useHarvestLog } from '@/lib/harvestLog';
import { toast } from 'sonner';
import { SellAmountChip } from '@/components/portfolio/SellAmountChip';
import { TpTargetsLine } from '@/components/portfolio/TpTargetsLine';

import { useEffectiveHoldings } from '@/hooks/useEffectiveHoldings';
import { useLivePortfolioPrices, mergePrices } from '@/hooks/useLivePortfolioPrices';

const sk2 = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

const CATEGORY_COLOR: Record<string, string> = {
  A: 'text-[#14F195] border-[#14F195]/30 bg-[#14F195]/10',
  WATCH: 'text-sky-300 border-sky-400/30 bg-sky-400/10',
  B: 'text-amber-300 border-amber-400/30 bg-amber-400/10',
  C: 'text-orange-300 border-orange-400/30 bg-orange-400/10',
  D: 'text-red-300 border-red-400/30 bg-red-400/10',
};

function OverheatMeter({ value }: { value: number }) {
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
        style={{ width: `${100 - Math.max(0, Math.min(100, value))}%` }}
      />
      <div
        className="absolute top-[-3px] w-[3px] h-[16px] rounded-full bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
        style={{ left: `calc(${Math.max(0, Math.min(100, value))}% - 1.5px)` }}
      />
    </div>
  );
}

function TokenHarvestRow({
  v, overheat, qty, wacb, price, investedCapital, currentFiatValue, realPnL, skimOverheat, btcOverheatScore,
}: {
  v: HarvestVerdict; overheat: number; qty: number; wacb: number; price: number;
  investedCapital: number; currentFiatValue: number; realPnL: number;
  skimOverheat: number; btcOverheatScore: number;
}) {
  const [open, setOpen] = useState(false);
  const [logged, setLogged] = useState(false);
  const cat = CATEGORY_COLOR[v.category];
  const route = getProfitRouting(v.token, btcOverheatScore);

  const profitUSD = currentFiatValue - investedCapital;
  const rawSkim = calculateDynamicProfitSkim(investedCapital, currentFiatValue, price, realPnL, skimOverheat);
  const dynamicSkim = route.hold ? 0 : rawSkim;


  return (
    <div className="p-3 sm:p-4 space-y-2.5">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-white font-mono">{v.token}</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${cat}`}>{v.categoryLabel}</span>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-mono font-bold text-white tabular-nums">{sk2(v.score, 2)}<span className="text-white/35">/10</span></p>
          <p className="text-[10px] text-white/40 font-mono">skóre</p>
        </div>
      </div>

      <OverheatMeter value={overheat} />
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-[10px] font-mono text-white/40">Overheat {sk2(overheat, 0)} / 100</p>
        {v.liteModel && (
          <span
            className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-amber-400/25 bg-amber-400/[0.06] text-amber-200/70 transition-all duration-300"
            title={v.missingFactors.length ? `Chýba: ${v.missingFactors.join(', ')}` : 'Čiastočné dáta z API'}
          >
            Lite model (čiastočné dáta)
          </span>
        )}
      </div>


      <div className="grid grid-cols-1 gap-1 text-xs">
        <p className="text-white/70">
          <span className="text-white/40">Reálne PnL: </span>
          {v.unrealizedPnlPct != null ? (
            <span className={v.unrealizedPnlPct >= 0 ? 'text-[#14F195]' : 'text-red-400'}>
              {v.unrealizedPnlPct >= 0 ? '+' : ''}{sk2(v.unrealizedPnlPct)} %
            </span>
          ) : (
            <span className="text-white/35">nezadané (doplň Qty a WACB)</span>
          )}
        </p>
        {wacb > 0 && (
          <p className="text-white/70">
            <span className="text-white/40">WACB: </span>
            <span className="font-mono tabular-nums">${sk2(wacb, wacb >= 1000 ? 2 : 3)}</span>
          </p>
        )}
        <TpTargetsLine wacb={wacb} />
        <p className="text-white/70"><span className="text-white/40">Kedy vybrať: </span>{v.whenText}</p>

        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-white/70"><span className="text-white/40">Koľko vybrať: </span>{route.hold ? 'Nič — zisk necháme v BTC' : v.howMuchText}</p>
          {!route.hold && (
            <SellAmountChip token={v.token} qty={qty} tpPct={v.tpPct} priceUsd={price} sellQty={dynamicSkim} />
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-white/70">
            <span className="text-white/40">Dynamický profit skim: </span>
            {dynamicSkim > 0 ? (
              <span className="text-[#14F195] font-mono tabular-nums">{dynamicSkim.toFixed(v.token === 'BTC' ? 6 : 4).replace('.', ',')} {v.token}</span>
            ) : (
              <span className="text-white/35 font-mono">—</span>
            )}
          </p>
          {dynamicSkim > 0 && (
            <p className="text-[10px] text-white/40 font-mono">
              (${sk2(dynamicSkim * price, 2)} · zisk ${sk2(profitUSD, 2)} USD · PnL {sk2(realPnL, 1)} %)
            </p>
          )}
        </div>
        {route.hold && (
          <p className="text-[10px] font-mono text-amber-300">
            🔒 Zisk pod limitom / Nechávať v BTC — BTC nesmeruje zisky do wBTC (overheat &lt; {BTC_OVERHEAT_ROUTING_THRESHOLD})
          </p>
        )}
        {!route.hold && v.pnlGated && (

          <p className="text-[10px] font-mono text-amber-300">
            🔒 TP zablokované: Zisk pod limitom (+15 %) — výnimka len zóna D (téza zlomená)
          </p>
        )}
        {v.fundamentals?.sources.length ? (
          <p className="text-[10px] font-mono text-white/30">Live fundamenty: {v.fundamentals.sources.join(' + ')}</p>
        ) : (
          <p className="text-[10px] font-mono text-white/30">Live fundamenty: nedostupné (vrstva vynechaná)</p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 text-[11px] font-mono px-2 py-1 rounded-lg border transition-all duration-300 ease-in-out ${
          route.hold
            ? 'text-[#F7931A] border-[#F7931A]/30 bg-[#F7931A]/10'
            : route.token === 'wBTC'
              ? 'text-[#F7931A] border-[#F7931A]/30 bg-[#F7931A]/10'
              : 'text-emerald-300 border-emerald-400/30 bg-emerald-400/10'
        }`}>
          Smerovať do: {routeLabel(route)} {!route.hold && <ArrowRight className="w-3 h-3" />}
        </span>


        <button
          type="button"
          disabled={logged || route.hold}

          onClick={() => {
            logHarvest({
              token: v.token,
              score: v.score,
              tpPct: v.tpPct,
              destination: routeLabel(route),
              overheat,
            });
            setLogged(true);
            toast.success(`Výber zaznamenaný: ${v.token} ${sk2(v.tpPct)} % → ${routeLabel(route)}`);

            setTimeout(() => setLogged(false), 2500);
          }}
          className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-white/80 active:bg-white/10 disabled:opacity-60"
        >
          {logged ? <Check className="w-3.5 h-3.5 text-[#14F195]" /> : <Flame className="w-3.5 h-3.5 text-orange-400" />}
          {logged ? 'Zaznamenané' : 'Zaznamenať výber'}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 text-[10px] font-mono text-white/40"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        Zobraziť 10-faktorové skóre
      </button>
      {open && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 pt-1">
          {v.layers.filter(l => l.weight > 0).map(l => (
            <div key={l.key} className="flex items-start justify-between gap-2 text-[10px] font-mono rounded-md bg-white/[0.03] px-2 py-1">
              <div className="min-w-0">
                <p className="text-white/70">{l.label}</p>
                <p className="text-white/35 truncate">{l.note}</p>
              </div>
              <span className="text-white/80 tabular-nums shrink-0">{sk2(l.score, 1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function HarvestStatusCard() {
  const { data: fg } = useFearGreed();
  const { data, isLoading } = useHarvestScores(fg?.value ?? 50);
  const { data: livePrices } = useLivePortfolioPrices();
  const prices = mergePrices(data?.prices ?? ({} as Record<HarvestToken, number>), livePrices);
  const holdings = useEffectiveHoldings(prices);
  useHarvestLog(); // re-render after a harvest so the pressure relief applies

  // Rovnaký zdroj pravdy ako obrazovka „Portfólio – reálne PnL“
  const { byToken, btcOverheatScore } = usePortfolioAssets();




  const risk = data?.wbtcRisk;
  const RiskIcon = risk?.status === 'ok' ? ShieldCheck : risk?.status === 'warn' ? ShieldAlert : ShieldX;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/[0.06] bg-white/[0.015] overflow-hidden"
    >
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Flame className="w-4 h-4 text-orange-400" />
          <h2 className="text-sm font-bold text-white">Take-Profit / Harvest Status</h2>
        </div>
        <span className="text-[10px] font-mono text-white/40">Multi-faktor · 10 vrstiev</span>
      </div>

      {isLoading || !data ? (
        <div className="py-10 flex items-center justify-center text-white/40 text-sm">
          <Loader2 className="w-4 h-4 animate-spin mr-2" /> Počítam skóre…
        </div>
      ) : (
        <>
          <div className="divide-y divide-white/[0.05]">
            {HARVEST_TOKENS.map((t: HarvestToken) => {
              const v = data.verdicts[t];
              if (!v) return null;
              const a = byToken[t];
              const qty = a?.tokenQuantity ?? holdings[t]?.qty ?? 0;
              const wacb = a?.wacb ?? holdings[t]?.wacb ?? 0;
              const price = a?.tokenPrice ?? prices[t] ?? 0;
              return (
                <TokenHarvestRow
                  key={t}
                  v={v}
                  overheat={v.overheat * pressureRelief(t)}
                  qty={qty}
                  wacb={wacb}
                  price={price}
                  investedCapital={a?.investedCapital ?? qty * wacb}
                  currentFiatValue={a?.currentFiatValue ?? qty * price}
                  realPnL={a?.realPnL ?? 0}
                  skimOverheat={a?.overheatScore ?? v.overheat}
                  btcOverheatScore={btcOverheatScore}
                />
              );
            })}
          </div>

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

          <div className="px-3 sm:px-4 py-3 border-t border-white/[0.06]">
            <p className="text-[10px] uppercase tracking-widest text-white/35 font-mono mb-1">Contrarian check</p>
            <p className="text-xs text-white/60 leading-relaxed">
              Kde je najväčšie riziko, že sa pri tomto TP rozhodnutí mýlime? {data.contrarian.replace(/\*/g, '')}
            </p>
          </div>
        </>
      )}
    </motion.section>
  );
}
