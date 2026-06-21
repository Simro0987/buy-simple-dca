import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Shield, Landmark, ChevronDown, ChevronUp } from 'lucide-react';
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
import { BentoSection } from '@/components/portfolio/ui/BentoSection';
import { BentoCard, BentoGrid } from '@/components/portfolio/ui/BentoCard';
import { MoneyValue } from '@/components/portfolio/ui/MoneyValue';
import { fadeUp } from '@/components/portfolio/ui/motion';

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
    case 'staking': return 'text-neon-green';
    case 'lending': return 'text-neon-gold';
    default: return 'text-neon-cyan';
  }
}

export function PortfolioPage({ lang }: Props) {
  return (
    <PortfolioProvider>
      <PortfolioPageInner lang={lang} />
    </PortfolioProvider>
  );
}

function PortfolioPageInner({ lang }: Props) {
  const { selected, toggleSelected, breakdown } = usePortfolio();
  const { data: prices } = usePrices();
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

  return (
    <div className="relative space-y-4 pb-2">

      {/* ═══ S1: GLOBAL HEADER ═══════════════════════════════════════ */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <StickyPortfolioHeader lang={lang} />
      </motion.div>

      {/* ═══ S2: MAKRO CIELE ══════════════════════════════════════════ */}
      <BentoSection title="Makro ciele" delay={0.04}>
        <NextActionBanner lang={lang} />
        <BentoGrid>
          <HalvingCycleTracker lang={lang} />
          <BtcGoalTracker lang={lang} />
        </BentoGrid>
      </BentoSection>

      {/* ═══ S3: CORE FINANCIALS ══════════════════════════════════════ */}
      <BentoSection title="Core Financials · USD" delay={0.08}>
        <PortfolioSummaryCard metrics={metrics} weeklyCapital={weeklyCapital} cashReserve={cashReserve} />
        <PnLOverviewCard lang={lang} />
        <PortfolioHistoryChart lang={lang} prices={prices} selected={selected} />
      </BentoSection>

      {/* ═══ S4: ANALYTIKA ════════════════════════════════════════════ */}
      <BentoSection title="Analytika & Alokácia" delay={0.12}>
        <BentoGrid>
          <HealthScoreCard lang={lang} />
          <AllocationDonut metrics={metrics} selected={selected} onSelect={(s) => toggleSelected(s as 'BTC' | 'ETH' | 'SOL')} />
        </BentoGrid>
        <ConcentrationWarnings />
        <RebalanceCard lang={lang} prices={prices} selected={selected} />
      </BentoSection>

      {/* ═══ S5: AKTÍVNA STRATÉGIA — DCA Radar dominant ═══════════════ */}
      <BentoSection title="Aktívna stratégia" delay={0.16}>
        <motion.div {...fadeUp(0.18)}>
          <LiveDcaOutRadar />
        </motion.div>
        <BentoGrid className="mt-3">
          <DynamicTakeProfitCard lang={lang} />
          <div id="yield-profit-router" className="scroll-mt-20">
            <AIYieldProfitRouter lang={lang} />
          </div>
        </BentoGrid>
        <BentoGrid>
          <YieldEarnedCard lang={lang} />
          <WhatIfSimulator lang={lang} />
        </BentoGrid>
      </BentoSection>

      {/* ═══ DETAILNÉ POZÍCIE — Bento Cards ══════════════════════════ */}
      <BentoSection title="Detailné pozície" delay={0.22}>
        {tokenData.map((t, tokenIndex) => {
          const isExpanded = expandedToken === t.symbol;
          const positions = t.config?.positions || [];
          const dimmed = selected !== null && selected !== t.symbol;
          const assetMetric = metrics.assets.find(a => a.symbol === t.symbol);
          const invested = assetMetric?.invested ?? 0;
          const pnl = assetMetric?.pnl ?? 0;
          const pnlPct = assetMetric?.pnlPct ?? 0;
          const avgCost = assetMetric && assetMetric.holdings > 0
            ? invested / assetMetric.holdings : 0;

          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.24 + tokenIndex * 0.06, ease: [0.25, 0.4, 0.25, 1] }}
              className={dimmed ? 'opacity-40 transition-opacity' : 'transition-opacity'}
            >
              <BentoCard
                accentColor={selected === t.symbol ? t.color : undefined}
                className={selected === t.symbol ? '' : ''}
                padding="none"
                style={selected === t.symbol ? { boxShadow: `0 0 24px ${t.color}18` } : undefined}
              >
                <div className="h-0.5" style={{ background: `linear-gradient(90deg, ${t.color}, transparent)` }} />

                <button
                  onClick={() => {
                    setExpandedToken(isExpanded ? null : t.symbol);
                    toggleSelected(t.symbol as 'BTC' | 'ETH' | 'SOL');
                  }}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  <div
                    className="w-10 h-10 rounded-2xl flex items-center justify-center text-[10px] font-bold shrink-0"
                    style={{ background: t.color + '18', color: t.color, border: `1px solid ${t.color}30` }}
                  >
                    {t.symbol.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-white tracking-tight">{t.symbol}</span>
                      <MoneyValue size="sm">{t.qty > 0 ? formatUsd(t.valueUsd) : '—'}</MoneyValue>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] font-mono text-white/45 tabular-nums">{formatUsd(t.price)}</span>
                      <div className="flex items-center gap-2">
                        {t.qty > 0 && (
                          <span className="text-[10px] font-mono text-white/35 tabular-nums">
                            {t.symbol === 'BTC' ? t.qty.toFixed(8) : t.qty >= 100 ? t.qty.toFixed(2) : t.qty.toFixed(4)} {t.symbol}
                          </span>
                        )}
                        <span className={`text-[10px] font-mono font-semibold tabular-nums ${t.change24h >= 0 ? 'text-gain' : 'text-loss'}`}>
                          {t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                    {invested > 0 && (
                      <div className="flex items-center justify-between mt-1.5 text-[10px]">
                        <span className="font-mono text-white/30 tabular-nums">Avg {formatUsd(avgCost)}</span>
                        <span className={`font-mono font-semibold tabular-nums ${pnl >= 0 ? 'text-gain' : 'text-loss'}`}>
                          {pnl >= 0 ? '+' : ''}{formatUsd(pnl)} ({pnl >= 0 ? '+' : ''}{pnlPct.toFixed(1)}%)
                        </span>
                      </div>
                    )}
                    {(() => {
                      const b = breakdown.find(x => x.symbol === t.symbol);
                      if (!b || t.qty <= 0 || b.stakedQty <= 0) return null;
                      const protos = b.stakedEntries.map((e: { protocol: string }) => e.protocol).join(', ') || 'protokol';
                      return (
                        <p className="text-[9px] mt-1 font-mono tabular-nums leading-snug text-white/28">
                          <span className="text-white/55 font-semibold">{t.symbol} Total:</span>{' '}
                          {t.qty.toFixed(8)} {t.symbol}{' '}
                          <span className="text-neon-cyan">[{b.liquidQty.toFixed(8)} Liquid</span>
                          {' / '}
                          <span className="text-neon-green">{b.stakedQty.toFixed(8)} Staked in {protos}]</span>
                        </p>
                      );
                    })()}
                  </div>
                  {t.qty > 0 && (isExpanded
                    ? <ChevronUp className="w-3.5 h-3.5 shrink-0 text-white/30" />
                    : <ChevronDown className="w-3.5 h-3.5 shrink-0 text-white/30" />
                  )}
                </button>

                {isExpanded && t.qty > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="px-4 pb-4 space-y-3 border-t border-white/[0.06]"
                  >
                    <div className="flex items-center justify-between text-xs mt-3">
                      <span className="text-white/40 font-mono">ATH: {formatUsd(t.ath)}</span>
                      <span className="text-loss font-mono tabular-nums">{t.athDrop.toFixed(1)}% od ATH</span>
                    </div>
                    {positions.length > 0 && (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">
                          Rozdelenie pozícií
                        </p>
                        {positions.map((pos: { type: string; label: string; percentage: number; protocol?: string; apy?: number }, i: number) => {
                          const Icon = typeIcon(pos.type);
                          const amount = t.qty * (pos.percentage / 100);
                          const amountUsd = amount * t.price;
                          let liveApy = pos.apy ?? null;
                          if (apys) {
                            if (pos.protocol === 'Rocket Pool') liveApy = apys.rocketPool;
                            else if (pos.label?.includes('wstETH') && pos.type !== 'lending') liveApy = apys.lido;
                            else if (pos.protocol === 'Aave V3') liveApy = apys.aaveEth;
                            else if (pos.protocol === 'Jito') liveApy = apys.jito;
                            else if (pos.protocol === 'Kamino') liveApy = apys.kaminoSol;
                          }
                          return (
                            <div key={i} className="flex items-center gap-2 rounded-2xl px-3 py-2.5 bg-white/[0.04] border border-white/[0.06]">
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${typeColor(pos.type)}`} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-medium text-white/80">{pos.label}</span>
                                  <MoneyValue size="sm" className="text-sm">{formatUsd(amountUsd)}</MoneyValue>
                                </div>
                                <div className="flex items-center justify-between mt-0.5">
                                  <span className="text-[9px] text-white/40 font-mono tabular-nums">
                                    {t.symbol === 'BTC' ? amount.toFixed(8) : amount >= 100 ? amount.toFixed(2) : amount.toFixed(4)} {t.symbol}
                                    {pos.protocol ? ` · ${pos.protocol}` : ''}
                                  </span>
                                  {liveApy != null && (
                                    <span className="text-[9px] font-medium text-neon-green">{liveApy.toFixed(1)}% APY</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex h-1 rounded-full overflow-hidden bg-white/[0.06]">
                          {positions.map((pos: { type: string; percentage: number }, i: number) => {
                            const c: Record<string, string> = { hold: '#60a5fa50', staking: '#14F19560', lending: '#fbbf2450' };
                            return <div key={i} style={{ width: `${pos.percentage}%`, background: c[pos.type] || '#ffffff18' }} />;
                          })}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </BentoCard>
            </motion.div>
          );
        })}
        <InitialHoldingsCard />
      </BentoSection>
    </div>
  );
}
