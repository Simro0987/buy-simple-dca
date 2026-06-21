import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Wallet, RefreshCw, TrendingUp, Shield, Landmark, ChevronDown, ChevronUp } from 'lucide-react';
import { TOKENS, formatUsd } from '@/lib/crypto';
import { usePrices, useAthData } from '@/hooks/usePrices';
import { useDefiApys } from '@/hooks/useDefiApys';
import { usePortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Lang } from '@/lib/i18n';
import { STAKING_CONFIG } from '@/lib/wallets';
import { PortfolioHistoryChart } from '@/components/PortfolioHistoryChart';
import { RebalanceCard } from '@/components/RebalanceCard';
import { ConcentrationWarnings } from '@/components/decision/ConcentrationWarnings';
import { PortfolioSummaryCard } from '@/components/dashboard/PortfolioSummaryCard';
import { AllocationDonut } from '@/components/dashboard/AllocationDonut';
import { InitialHoldingsCard } from '@/components/settings/InitialHoldingsCard';
import { AIYieldProfitRouter } from '@/components/portfolio/AIYieldProfitRouter';
import { PortfolioProvider, usePortfolio } from '@/contexts/PortfolioContext';
import { StickyPortfolioHeader } from '@/components/portfolio/StickyPortfolioHeader';
import { BtcGoalTracker } from '@/components/portfolio/BtcGoalTracker';
import { HalvingCycleTracker } from '@/components/portfolio/HalvingCycleTracker';
import { HealthScoreCard } from '@/components/portfolio/HealthScoreCard';
import { NextActionBanner } from '@/components/portfolio/NextActionBanner';
import { WhatIfSimulator } from '@/components/portfolio/WhatIfSimulator';
import { YieldEarnedCard } from '@/components/portfolio/YieldEarnedCard';
import { PnLOverviewCard } from '@/components/portfolio/PnLOverviewCard';
import { DynamicTakeProfitCard } from '@/components/portfolio/DynamicTakeProfitCard';
import { LiveDcaOutRadar } from '@/components/portfolio/LiveDcaOutRadar';


interface Props { lang: Lang; }

function loadHoldings(): Record<string, number> {
  try {
    const raw = localStorage.getItem('smart-alloc-holdings');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function typeIcon(type: string) {
  switch (type) {
    case 'staking': return TrendingUp;
    case 'lending': return Landmark;
    default: return Shield;
  }
}

function typeColor(type: string) {
  switch (type) {
    case 'staking': return 'text-green-400';
    case 'lending': return 'text-yellow-400';
    default: return 'text-blue-400';
  }
}

export function PortfolioPage({ lang }: Props) {
  return (
    <PortfolioProvider>
      <PortfolioPageInner lang={lang} />
    </PortfolioProvider>
  );
}

// ─── animation presets ────────────────────────────────────────────────────────
const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 22 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.45, delay, ease: [0.25, 0.4, 0.25, 1] as const },
});

// ─── terminal section divider ─────────────────────────────────────────────────
function SectionDivider({ title, icon }: { title: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
      <div
        className="flex items-center gap-1.5 px-3 py-1 rounded-full"
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {icon}
        <span style={{
          fontSize: 8.5, fontWeight: 800, color: 'rgba(255,255,255,0.25)',
          textTransform: 'uppercase' as const, letterSpacing: '0.14em',
        }}>
          {title}
        </span>
      </div>
      <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.05)' }} />
    </div>
  );
}

function PortfolioPageInner({ lang }: Props) {
  const { selected, toggleSelected, breakdown } = usePortfolio();
  const sk = lang === 'sk';
  const { data: prices, refetch, isFetching } = usePrices();
  const { data: athData } = useAthData();
  const { data: apys } = useDefiApys();
  const { data: settings } = useAppSettings();
  const metrics = usePortfolioMetrics(prices);
  const weeklyCapital = Number(settings?.default_amount ?? 0);
  const cashReserve = Math.max(0, Number(settings?.total_capital ?? 0) - metrics.totalInvested);
  const [expandedToken, setExpandedToken] = useState<string | null>(null);
  const holdings = useMemo(() => loadHoldings(), []);

  const tokenData = useMemo(() => {
    if (!prices) return [];
    return TOKENS.map(token => {
      const key = token.symbol.toLowerCase();
      const qty = holdings[key] || 0;
      const price = prices[token.coingeckoId]?.usd ?? 0;
      const change24h = prices[token.coingeckoId]?.usd_24h_change ?? 0;
      const valueUsd = qty * price;
      const ath = athData?.[token.coingeckoId]?.ath ?? 0;
      const athDrop = ath > 0 ? ((price - ath) / ath) * 100 : 0;
      const config = STAKING_CONFIG.find(c => c.symbol === token.symbol);
      return { ...token, qty, price, change24h, valueUsd, ath, athDrop, config };
    });
  }, [prices, athData, holdings]);

  const totalValue = tokenData.reduce((sum, t) => sum + t.valueUsd, 0);
  const hasHoldings = totalValue > 0;

  // Actual allocation percentages
  const actualAlloc = tokenData.map(t => ({
    symbol: t.symbol,
    actual: totalValue > 0 ? (t.valueUsd / totalValue) * 100 : 0,
    target: t.allocation * 100,
  }));


  return (
    <div className="space-y-2.5">

      {/* ═══ S1: GLOBAL HEADER ═══════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <StickyPortfolioHeader lang={lang} />
      </motion.div>

      {/* ═══ S2: MAKRO CIELE ══════════════════════════════════════════ */}
      <motion.div {...fadeUp(0.06)} className="space-y-2.5">
        <SectionDivider title="Makro ciele" />
        <NextActionBanner lang={lang} />
        <HalvingCycleTracker lang={lang} />
        <BtcGoalTracker lang={lang} />
      </motion.div>

      {/* ═══ S3: CORE FINANCIALS ══════════════════════════════════════ */}
      <motion.div {...fadeUp(0.12)} className="space-y-2.5">
        <SectionDivider title="Core Financials · USD" />
        <PortfolioSummaryCard metrics={metrics} weeklyCapital={weeklyCapital} cashReserve={cashReserve} />
        <PnLOverviewCard lang={lang} />
        <PortfolioHistoryChart lang={lang} prices={prices} selected={selected} />
      </motion.div>

      {/* ═══ S4: ANALYTIKA ════════════════════════════════════════════ */}
      <motion.div {...fadeUp(0.18)} className="space-y-2.5">
        <SectionDivider title="Analytika & Alokácia" />
        <HealthScoreCard lang={lang} />
        <AllocationDonut metrics={metrics} selected={selected} onSelect={(s) => toggleSelected(s as "BTC" | "ETH" | "SOL")} />
        <ConcentrationWarnings />
        <RebalanceCard lang={lang} prices={prices} selected={selected} />
      </motion.div>

      {/* ═══ S5: AKTÍVNA STRATÉGIA ════════════════════════════════════ */}
      <motion.div {...fadeUp(0.24)} className="space-y-2.5">
        <SectionDivider title="Aktívna stratégia" />
        <LiveDcaOutRadar />
        <DynamicTakeProfitCard lang={lang} />
        <div id="yield-profit-router" className="scroll-mt-20">
          <AIYieldProfitRouter lang={lang} />
        </div>
        <YieldEarnedCard lang={lang} />
        <WhatIfSimulator lang={lang} />
      </motion.div>

      {/* ═══ DETAILNÉ POZÍCIE — Bento Cards ══════════════════════════ */}
      <motion.div {...fadeUp(0.30)} className="space-y-2.5">
        <SectionDivider title="Detailné pozície" />

        {tokenData.map((t, tokenIndex) => {
          const isExpanded  = expandedToken === t.symbol;
          const positions   = t.config?.positions || [];
          const dimmed      = selected !== null && selected !== t.symbol;
          const assetMetric = metrics.assets.find(a => a.symbol === t.symbol);
          const invested    = assetMetric?.invested ?? 0;
          const pnl         = assetMetric?.pnl ?? 0;
          const pnlPct      = assetMetric?.pnlPct ?? 0;
          const avgCost     = assetMetric && assetMetric.holdings > 0
            ? invested / assetMetric.holdings : 0;

          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.32 + tokenIndex * 0.07, ease: [0.25, 0.4, 0.25, 1] }}
              className={`overflow-hidden rounded-3xl transition-all ${dimmed ? "opacity-40" : ""}`}
              style={{
                background: "#0a0a0a",
                border: `1px solid ${selected === t.symbol ? t.color + "55" : "rgba(255,255,255,0.08)"}`,
                boxShadow: selected === t.symbol ? `0 0 24px ${t.color}18` : "none",
              }}
            >
              {/* Gradient accent line */}
              <div style={{ height: 2, background: `linear-gradient(90deg, ${t.color}, transparent)` }} />

              {/* Token header */}
              <button
                onClick={() => {
                  setExpandedToken(isExpanded ? null : t.symbol);
                  toggleSelected(t.symbol as "BTC" | "ETH" | "SOL");
                }}
                className="w-full p-4 flex items-center gap-3 text-left"
              >
                <div
                  className="w-9 h-9 rounded-2xl flex items-center justify-center text-[10px] font-bold shrink-0"
                  style={{ background: t.color + "18", color: t.color, border: `1px solid ${t.color}30` }}
                >
                  {t.symbol.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-white tracking-tight">{t.symbol}</span>
                    <span className="text-sm font-bold text-white tabular-nums">{t.qty > 0 ? formatUsd(t.valueUsd) : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[10px] tabular-nums" style={{ color: "rgba(255,255,255,0.45)" }}>{formatUsd(t.price)}</span>
                    <div className="flex items-center gap-2">
                      {t.qty > 0 && (
                        <span className="text-[10px] tabular-nums" style={{ color: "rgba(255,255,255,0.35)" }}>
                          {t.symbol === "BTC" ? t.qty.toFixed(8) : t.qty >= 100 ? t.qty.toFixed(2) : t.qty.toFixed(4)} {t.symbol}
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold tabular-nums ${t.change24h >= 0 ? "text-gain" : "text-loss"}`}>
                        {t.change24h >= 0 ? "+" : ""}{t.change24h.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                  {invested > 0 && (
                    <div className="flex items-center justify-between mt-1 text-[10px]">
                      <span className="tabular-nums" style={{ color: "rgba(255,255,255,0.30)" }}>Avg {formatUsd(avgCost)}</span>
                      <span className={`font-semibold tabular-nums ${pnl >= 0 ? "text-gain" : "text-loss"}`}>
                        {pnl >= 0 ? "+" : ""}{formatUsd(pnl)} ({pnl >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)
                      </span>
                    </div>
                  )}
                  {(() => {
                    const b = breakdown.find(x => x.symbol === t.symbol);
                    if (!b || t.qty <= 0 || b.stakedQty <= 0) return null;
                    const protos = b.stakedEntries.map((e: { protocol: string }) => e.protocol).join(", ") || "protokol";
                    return (
                      <p className="text-[9px] mt-1 tabular-nums leading-snug" style={{ color: "rgba(255,255,255,0.28)" }}>
                        <span style={{ color: "rgba(255,255,255,0.55)", fontWeight: 600 }}>{t.symbol} Total:</span>{" "}
                        {t.qty.toFixed(8)} {t.symbol}{" "}
                        <span style={{ color: "#60a5fa" }}>[{b.liquidQty.toFixed(8)} Liquid</span>
                        {" / "}
                        <span style={{ color: "#14F195" }}>{b.stakedQty.toFixed(8)} Staked in {protos}]</span>
                      </p>
                    );
                  })()}
                </div>
                {t.qty > 0 && (isExpanded
                  ? <ChevronUp className="w-3.5 h-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.30)" }} />
                  : <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: "rgba(255,255,255,0.30)" }} />
                )}
              </button>

              {/* Expanded detail */}
              {isExpanded && t.qty > 0 && (
                <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center justify-between text-xs mt-3">
                    <span style={{ color: "rgba(255,255,255,0.40)" }}>ATH: {formatUsd(t.ath)}</span>
                    <span className="text-loss tabular-nums">{t.athDrop.toFixed(1)}% od ATH</span>
                  </div>
                  {positions.length > 0 && (
                    <>
                      <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.40)" }}>
                        Rozdelenie pozícií
                      </p>
                      {positions.map((pos: { type: string; label: string; percentage: number; protocol?: string; apy?: number }, i: number) => {
                        const Icon = typeIcon(pos.type);
                        const amount = t.qty * (pos.percentage / 100);
                        const amountUsd = amount * t.price;
                        let liveApy = pos.apy ?? null;
                        if (apys) {
                          if (pos.protocol === "Rocket Pool") liveApy = apys.rocketPool;
                          else if (pos.label?.includes("wstETH") && pos.type !== "lending") liveApy = apys.lido;
                          else if (pos.protocol === "Aave V3") liveApy = apys.aaveEth;
                          else if (pos.protocol === "Jito") liveApy = apys.jito;
                          else if (pos.protocol === "Kamino") liveApy = apys.kaminoSol;
                        }
                        return (
                          <div key={i} className="flex items-center gap-2 rounded-2xl px-3 py-2" style={{ background: "rgba(255,255,255,0.04)" }}>
                            <Icon className={`w-3.5 h-3.5 shrink-0 ${typeColor(pos.type)}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-[11px] font-medium text-white/80">{pos.label}</span>
                                <span className="text-[11px] font-bold text-white tabular-nums">{formatUsd(amountUsd)}</span>
                              </div>
                              <div className="flex items-center justify-between mt-0.5">
                                <span className="text-[9px] text-white/40 tabular-nums">
                                  {t.symbol === "BTC" ? amount.toFixed(8) : amount >= 100 ? amount.toFixed(2) : amount.toFixed(4)} {t.symbol}
                                  {pos.protocol ? ` · ${pos.protocol}` : ""}
                                </span>
                                {liveApy != null && (
                                  <span className="text-[9px] font-medium" style={{ color: "#14F195" }}>{liveApy.toFixed(1)}% APY</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div className="flex h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        {positions.map((pos: { type: string; percentage: number }, i: number) => {
                          const c: Record<string, string> = { hold: "#60a5fa50", staking: "#14F19560", lending: "#fbbf2450" };
                          return <div key={i} style={{ width: `${pos.percentage}%`, background: c[pos.type] || "#ffffff18" }} />;
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          );
        })}

        <InitialHoldingsCard />
      </motion.div>
    </div>
  );
}
