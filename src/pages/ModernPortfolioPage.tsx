/**
 * ModernPortfolioPage — úplne nová stránka portfólia (Web3 Bento Grid).
 * Biznis logika z hookov / dcaOutEngine; žiadne staré portfolio komponenty.
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, RefreshCw, Copy, Check, Lock, RotateCcw,
  TrendingUp, TrendingDown, Target,
  AlertTriangle, Sparkles,
} from 'lucide-react';
import { TOKENS, formatUsd, formatPrice } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import { usePrices, useFearGreed } from '@/hooks/usePrices';
import { useAppSettings } from '@/hooks/useAppSettings';
import { usePortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { useDailyRiskReport } from '@/hooks/useDailyRiskReport';
import { DailyRiskReportCard } from '@/components/portfolio/DailyRiskReportCard';
import { PortfolioProvider, usePortfolio } from '@/contexts/PortfolioContext';
import { computeConcentrationWarnings } from '@/lib/decisionEngine';
import { useProfitReservoir, addTakeProfit } from '@/lib/profitReservoir';
import { toast } from 'sonner';
import { Bento, Label, Money, Chip } from '@/components/modern-portfolio/primitives';
import {
  type DcaToken,
  DCA_TOKEN_COLORS,
  DCA_CG_ID,
  DCA_SOURCES,
  loadDcaPrices,
  saveDcaPrices,
  loadCooldown,
  saveCooldown,
  fetchAllRSI,
  liveRiskScore,
  sellPctFromScore,
  confirmDcaSell,
  computeTokenRadar,
  radarGlowClass,
} from '@/lib/portfolio/dcaOutEngine';

interface Props { lang: Lang; }

const TOKEN_DECIMALS: Record<string, number> = { BTC: 6, ETH: 5, SOL: 3 };
const GOAL_BTC = 1;
const LAST_HALVING = new Date('2024-04-19');
const NEXT_HALVING = new Date('2028-04-19');

export function ModernPortfolioPage({ lang }: Props) {
  return (
    <PortfolioProvider>
      <ModernPortfolioInner lang={lang} />
    </PortfolioProvider>
  );
}

function ModernPortfolioInner({ lang }: Props) {
  const sk = lang === 'sk';
  const { data: prices, isFetching } = usePrices();
  const { data: fg } = useFearGreed();
  const { data: settings } = useAppSettings();
  const metrics = usePortfolioMetrics(prices);
  const reservoir = useProfitReservoir();
  const {
    selected, toggleSelected, setSelected,
    totalStakedValue, blendedApy, profitAvailable, breakdown,
  } = usePortfolio();

  const [dcaPrices, setDcaPrices] = useState(loadDcaPrices);
  const [confirmKey, setConfirmKey] = useState(0);
  const [expandedRadar, setExpandedRadar] = useState<DcaToken | null>('BTC');
  const [copied, setCopied] = useState<string | null>(null);
  const [busyTp, setBusyTp] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  const fgValue = fg?.value ?? 50;
  const weeklyCapital = Number(settings?.default_amount ?? 0);
  const freeCash = parseFloat(localStorage.getItem('free-cash') || '0') || 0;
  const warnings = computeConcentrationWarnings(prices);

  const { data: rsiData, isLoading: rsiLoading, refetch: rsiRefetch } = useQuery({
    queryKey: ['modern-dca-rsi'],
    queryFn: fetchAllRSI,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });
  const rsi = rsiData ?? { BTC: 50, ETH: 50, SOL: 50 };

  const livePrices: Record<DcaToken, number> = {
    BTC: prices?.[DCA_CG_ID.BTC]?.usd ?? 0,
    ETH: prices?.[DCA_CG_ID.ETH]?.usd ?? 0,
    SOL: prices?.[DCA_CG_ID.SOL]?.usd ?? 0,
  };

  const updateDcaPrice = useCallback((sym: DcaToken, v: number) => {
    setDcaPrices(prev => { const n = { ...prev, [sym]: v }; saveDcaPrices(n); return n; });
  }, []);

  const radarTokens = useMemo(() => {
    void confirmKey;
    return (['BTC', 'ETH', 'SOL'] as DcaToken[]).map(sym =>
      computeTokenRadar(sym, livePrices[sym], rsi[sym], fgValue, dcaPrices[sym] ?? 0),
    );
  }, [livePrices, rsi, fgValue, dcaPrices, confirmKey]);

  const sellSignals = radarTokens.filter(t => t.status === 'SELL').length;
  const maxRisk = Math.max(...radarTokens.map(t => t.score), 0);

  const healthScore = useMemo(() => {
    if (metrics.totalValue <= 0) return null;
    const drift = metrics.assets.reduce((s, a) => s + Math.abs(a.deviationPct), 0);
    const alloc = Math.max(0, 40 - drift * 2);
    const present = metrics.assets.filter(a => a.actualPct > 0.01).length;
    const div = present === 3 ? 20 : present === 2 ? 12 : 5;
    const stakedRatio = metrics.totalValue > 0 ? totalStakedValue / metrics.totalValue : 0;
    const stake = stakedRatio >= 0.3 && stakedRatio <= 0.6 ? 20
      : stakedRatio < 0.3 ? Math.round((stakedRatio / 0.3) * 20)
      : Math.max(5, Math.round(20 - (stakedRatio - 0.6) * 30));
    const pnlPct = metrics.totalPnlPct;
    const dd = pnlPct >= 0 ? 20 : Math.max(0, Math.round(20 + (pnlPct / 50) * 20));
    return Math.min(100, Math.round(alloc + div + stake + dd));
  }, [metrics, totalStakedValue]);

  const halvingProgress = useMemo(() => {
    const total = NEXT_HALVING.getTime() - LAST_HALVING.getTime();
    const elapsed = Date.now() - LAST_HALVING.getTime();
    return Math.max(0, Math.min(100, (elapsed / total) * 100));
  }, []);

  const btcGoal = useMemo(() => {
    const btcPrice = prices?.bitcoin?.usd ?? 0;
    if (btcPrice <= 0) return null;
    const equiv = metrics.totalValue / btcPrice;
    return { equiv, progress: Math.min(100, (equiv / GOAL_BTC) * 100) };
  }, [metrics.totalValue, prices]);

  const takeProfitRows = useMemo(() => metrics.assets.map(a => {
    const adj = a.holdings;
    const original = adj + Number(reservoir.sells[a.symbol] ?? 0);
    const avgCost = original > 0 ? a.invested / original : 0;
    const costBasis = avgCost * adj;
    const pnl = adj * a.currentPrice - costBasis;
    const pnlPct = costBasis > 0 ? (pnl / costBasis) * 100 : 0;
    const eligible = pnlPct > 10 && pnl > 0 && a.currentPrice > 0 && adj > 0;
    const sellPct = eligible ? Math.min(Math.max(pnlPct * 0.5, 5), 50) : 0;
    const sellUsd = eligible ? pnl * (sellPct / 100) : 0;
    let sellTokens = eligible ? sellUsd / a.currentPrice : 0;
    if (sellTokens > adj) sellTokens = adj;
    return { ...a, avgCost, pnl, pnlPct, eligible, sellPct, sellUsd, sellTokens };
  }), [metrics.assets, reservoir.sells]);

  const copyText = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  };

  const isGain = metrics.totalPnl >= 0;

  const reportInput = useMemo(() => ({
    assets: metrics.assets,
    prices,
    fearGreed: fgValue,
    rsi,
    freeCash,
    reservoirStable: reservoir.stable,
    totalStakedValue,
  }), [metrics.assets, prices, fgValue, rsi, freeCash, reservoir.stable, totalStakedValue]);

  const metricsReady = !metrics.loading && metrics.totalValue > 0;
  const {
    report, reportText, lastGeneratedAt, needsToday, generate: generateReport,
  } = useDailyRiskReport(metricsReady ? reportInput : null, metricsReady);

  const handleGenerateReport = useCallback(() => {
    setReportBusy(true);
    generateReport('manual');
    setTimeout(() => setReportBusy(false), 400);
  }, [generateReport]);

  return (
    <div className="relative space-y-5 pb-8 -mx-1">

      {/* ═══ HERO ═══════════════════════════════════════════════════════════ */}
      <motion.section
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="pt-2 pb-1"
      >
        <Label>{sk ? 'Celková hodnota portfólia' : 'Total portfolio value'}</Label>
        <div className="mt-2 flex items-end justify-between gap-4">
          <Money size="hero">{formatUsd(metrics.totalValue)}</Money>
          <div className="text-right pb-1 shrink-0">
            <div className="flex items-center gap-1.5 justify-end">
              {isGain ? <TrendingUp className="w-4 h-4 text-[#14F195]" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
              <Money size="md" positive={isGain} negative={!isGain}>
                {isGain ? '+' : ''}{formatUsd(metrics.totalPnl)}
              </Money>
            </div>
            <p className={`font-mono text-sm mt-1 ${isGain ? 'text-[#14F195]' : 'text-red-400'}`}>
              {isGain ? '+' : ''}{metrics.totalPnlPct.toFixed(2)}%
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-4 overflow-x-auto scrollbar-hide">
          <Chip color="green">
            <Sparkles className="w-3 h-3 inline mr-1" />
            Profit {formatUsd(profitAvailable)}
          </Chip>
          <Chip color="default">Stake {formatUsd(totalStakedValue)} · {blendedApy.toFixed(1)}%</Chip>
          {TOKENS.map(t => (
            <button
              key={t.symbol}
              onClick={() => toggleSelected(t.symbol as 'BTC' | 'ETH' | 'SOL')}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all shrink-0 ${
                selected === t.symbol
                  ? 'bg-white text-black border-white'
                  : 'border-white/15 text-white/45 hover:text-white/80'
              }`}
            >
              {t.symbol}
            </button>
          ))}
          {selected && (
            <button onClick={() => setSelected(null)} className="text-white/30 text-xs px-2">✕</button>
          )}
        </div>
      </motion.section>

      {/* ═══ STAT BENTO ═════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { l: sk ? 'Investované' : 'Invested', v: formatUsd(metrics.totalInvested), d: 0.04 },
          { l: 'PnL', v: `${isGain ? '+' : ''}${formatUsd(metrics.totalPnl)}`, d: 0.08, pos: isGain },
          { l: sk ? 'Týž. DCA' : 'Weekly DCA', v: formatUsd(weeklyCapital), d: 0.12 },
          { l: sk ? 'Voľný cash' : 'Free cash', v: formatUsd(freeCash + reservoir.stable), d: 0.16 },
        ].map(s => (
          <Bento key={s.l} delay={s.d} className="p-4">
            <Label>{s.l}</Label>
            <Money size="md" className="mt-2 block" positive={s.pos} negative={s.pos === false}>
              {s.v}
            </Money>
          </Bento>
        ))}
      </div>

      {/* ═══ DENNÝ ANALYTICKÝ REPORT ═══════════════════════════════════════ */}
      <DailyRiskReportCard
        lang={lang}
        report={report}
        reportText={reportText}
        lastGeneratedAt={lastGeneratedAt}
        needsToday={needsToday}
        onGenerate={handleGenerateReport}
        generating={reportBusy}
      />

      {/* ═══ DCA-OUT RADAR — VIZUÁLNA DOMINANTA ═══════════════════════════ */}
      <Bento
        delay={0.2}
        glow={maxRisk >= 70 ? 'red' : maxRisk >= 50 ? 'orange' : sellSignals > 0 ? 'purple' : 'purple'}
        className="relative border-white/[0.14] rounded-[2rem]"
      >
        {/* Ambient radar rings */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-[2rem]" aria-hidden>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] aspect-square rounded-full border border-white/[0.04]" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] aspect-square rounded-full border border-white/[0.06]" />
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50%] aspect-square rounded-full"
            style={{
              background: maxRisk >= 70
                ? 'radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 70%)'
                : maxRisk >= 50
                  ? 'radial-gradient(circle, rgba(249,115,22,0.10) 0%, transparent 70%)'
                  : 'radial-gradient(circle, rgba(153,69,255,0.10) 0%, transparent 70%)',
            }}
          />
        </div>

        <div className="relative p-5 md:p-7 space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-[#9945FF]" />
                <span className="text-sm font-bold text-white uppercase tracking-widest">DCA-Out Radar</span>
                <Chip color={isFetching ? 'amber' : 'green'}>{isFetching ? 'SYNC' : 'LIVE'}</Chip>
              </div>
              <p className="text-xs text-white/40 max-w-md leading-relaxed">
                LiveRiskScore = F&G×0.4 + RSI×0.4 + PnL%×0.2 → výber do crvUSD Profit Reservoir
              </p>
            </div>
            <div className="text-right shrink-0">
              <Label>F&G Index</Label>
              <Money size="lg" className="mt-1 block" positive={fgValue < 35} negative={fgValue > 70}>
                {fgValue}
              </Money>
              {sellSignals > 0 && (
                <Chip color="red" >
                  <Zap className="w-3 h-3 inline mr-0.5" />
                  {sellSignals} SIGNÁL
                </Chip>
              )}
              <button onClick={() => void rsiRefetch()} className="mt-2 p-1.5 rounded-full border border-white/10 text-white/40 hover:text-white">
                <RefreshCw className={`w-3.5 h-3.5 ${rsiLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Global risk meter */}
          <div className="space-y-2">
            <div className="flex justify-between items-baseline">
              <Label>Live Risk Score</Label>
              <Money size="md" negative={maxRisk >= 70} className={maxRisk >= 50 && maxRisk < 70 ? '!text-orange-400' : maxRisk < 50 ? '!text-[#14F195]' : ''}>
                {maxRisk.toFixed(1)}
              </Money>
            </div>
            <div className="relative h-3 rounded-full overflow-hidden bg-white/[0.06]">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, maxRisk)}%`,
                  background: maxRisk >= 70
                    ? 'linear-gradient(90deg, #f97316, #ef4444)'
                    : maxRisk >= 50
                      ? 'linear-gradient(90deg, #14F195, #f97316)'
                      : 'linear-gradient(90deg, #14F195, #22c55e)',
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-white/30 font-mono">
              <span>0 · Akumulácia</span>
              <span>50 · Pozor</span>
              <span>85+ · Max výber</span>
            </div>
          </div>

          {/* Token tabs */}
          <div className="flex gap-2">
            {radarTokens.map(t => (
              <button
                key={t.sym}
                onClick={() => setExpandedRadar(t.sym)}
                className={`flex-1 py-3 px-3 rounded-2xl border transition-all ${
                  expandedRadar === t.sym
                    ? 'bg-white/[0.08] border-white/20'
                    : 'border-white/[0.06] text-white/40'
                } ${radarGlowClass(t.score, t.status, t.sellPct)}`}
              >
                <span className="text-xs font-bold" style={{ color: DCA_TOKEN_COLORS[t.sym] }}>{t.sym}</span>
                <p className="font-mono text-lg font-bold text-white mt-0.5">{t.score.toFixed(0)}</p>
                <Chip color={t.status === 'SELL' ? 'red' : t.status === 'HOLD' ? 'purple' : 'green'}>
                  {t.status}
                </Chip>
              </button>
            ))}
          </div>

          {/* Expanded token detail */}
          <AnimatePresence mode="wait">
            {expandedRadar && (() => {
              const t = radarTokens.find(x => x.sym === expandedRadar)!;
              const price = livePrices[t.sym];
              const dca = dcaPrices[t.sym] ?? 0;
              return (
                <motion.div
                  key={t.sym}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className={`rounded-3xl border p-5 space-y-4 ${radarGlowClass(t.score, t.status, t.sellPct)}`}
                  style={{ borderColor: `${DCA_TOKEN_COLORS[t.sym]}40` }}
                >
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { l: 'RSI(14d)', v: String(rsi[t.sym]) },
                      { l: 'F&G', v: String(fgValue) },
                      { l: 'PnL', v: `${t.pnlPct >= 0 ? '+' : ''}${t.pnlPct.toFixed(1)}%` },
                    ].map(m => (
                      <div key={m.l} className="bg-black/40 rounded-2xl p-3 border border-white/[0.06]">
                        <Label>{m.l}</Label>
                        <p className="font-mono text-xl font-bold text-white mt-1">{m.v}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center gap-3">
                    <Label className="shrink-0">Priem. DCA $</Label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={dca || ''}
                      placeholder="0.00"
                      onChange={e => updateDcaPrice(t.sym, parseFloat(e.target.value) || 0)}
                      className="flex-1 bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 font-mono text-white text-sm outline-none focus:border-white/25"
                    />
                  </div>

                  {dca > 0 && price > 0 && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-black/30 rounded-2xl p-3 border border-white/[0.06]">
                        <Label>Hodnota</Label>
                        <Money size="md" className="mt-1 block">{formatUsd(t.hold * price)}</Money>
                      </div>
                      <div className="bg-black/30 rounded-2xl p-3 border border-white/[0.06]">
                        <Label>PnL USD</Label>
                        <Money size="md" positive className="mt-1 block">
                          +{formatUsd(t.hold * price - t.hold * dca)}
                        </Money>
                      </div>
                    </div>
                  )}

                  {/* Guards */}
                  <div className="space-y-1.5 text-[11px]">
                    <p className={t.inProfit ? 'text-[#14F195]' : 'text-white/40'}>
                      {t.inProfit ? '✓ PnL > 0% Guard aktívny' : '— Čakám na kladný PnL'}
                    </p>
                    <p className={!t.cdActive ? 'text-[#14F195]' : 'text-orange-400'}>
                      {t.cdActive ? `⏳ Cooldown: +5% od $${t.cdPrice.toLocaleString()}` : '✓ Cooldown voľný'}
                    </p>
                    <p className="text-white/40">🛡 Moon-Bag: min. {(t.hold * 0.15).toPrecision(4)} {t.sym}</p>
                  </div>

                  {t.status === 'SELL' && (
                    <div className="rounded-2xl border border-red-500/30 bg-red-500/[0.06] p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-red-400" />
                        <span className="text-sm font-bold text-red-300 uppercase tracking-wide">
                          Odporúčaný odpredaj {t.sellPct}%
                        </span>
                      </div>
                      <p className="text-sm text-white/70 leading-relaxed">
                        <span className="text-red-400 font-bold">Dôvod: </span>
                        {t.reason}
                      </p>
                      <div className="flex items-center justify-between bg-black/30 rounded-xl px-4 py-3">
                        <div>
                          <Label>Predaj</Label>
                          <p className="font-mono text-lg font-bold text-white">{t.sellQty.toFixed(4)} {t.sym}</p>
                          <p className="font-mono text-xs text-white/40">≈ {formatUsd(t.sellQty * price)}</p>
                        </div>
                        <button
                          onClick={() => copyText(t.sellQty.toFixed(4), t.sym)}
                          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-white/50 hover:text-white text-xs"
                        >
                          {copied === t.sym ? <Check className="w-3.5 h-3.5 text-[#14F195]" /> : <Copy className="w-3.5 h-3.5" />}
                          {copied === t.sym ? 'OK' : 'Kopírovať'}
                        </button>
                      </div>
                      <p className="text-[10px] text-white/35">Zdroj: {DCA_SOURCES[t.sym].join(' · ')}</p>
                      <p className="text-[10px] text-white/35">Cieľ: crvUSD → Profit Reservoir (Arbitrum)</p>
                      <button
                        onClick={() => {
                          confirmDcaSell(t.sym, t.sellQty, price);
                          setConfirmKey(k => k + 1);
                          toast.success(`Odpredaj ${t.sellQty.toFixed(4)} ${t.sym} zaznamenaný`);
                        }}
                        className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-mono font-bold text-sm uppercase tracking-wider text-white ${
                          t.sellPct >= 10 ? 'bg-red-500 animate-pulse' : 'bg-orange-500'
                        }`}
                      >
                        <Lock className="w-4 h-4" />
                        Potvrdiť odpredaj → Profit Reservoir
                      </button>
                    </div>
                  )}

                  {t.cdActive && (
                    <button
                      onClick={() => { const c = loadCooldown(); delete c[t.sym]; saveCooldown(c); setConfirmKey(k => k + 1); }}
                      className="flex items-center gap-2 text-xs text-white/40 hover:text-white"
                    >
                      <RotateCcw className="w-3 h-3" /> Resetuj cooldown
                    </button>
                  )}
                </motion.div>
              );
            })()}
          </AnimatePresence>

          <p className="text-[10px] text-white/25 text-center font-mono">
            CoinGecko 30s · Binance RSI 10min · alternative.me F&G
          </p>
        </div>
      </Bento>

      {/* ═══ ALOKÁCIA + ZDRAVIE ═══════════════════════════════════════════ */}
      <div className="grid md:grid-cols-2 gap-3">
        <Bento delay={0.28} className="p-5 space-y-4">
          <Label>{sk ? 'Alokácia · USD' : 'Allocation · USD'}</Label>
          {metrics.assets.map(a => {
            const token = TOKENS.find(t => t.symbol === a.symbol)!;
            const dim = selected && selected !== a.symbol;
            return (
              <div key={a.symbol} className={dim ? 'opacity-30' : ''}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-sm font-bold" style={{ color: token.color }}>{a.symbol}</span>
                  <Money size="md" className="!text-2xl">{formatUsd(a.value)}</Money>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${a.actualPct * 100}%`, backgroundColor: token.color }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[10px] font-mono text-white/35">
                  <span>{(a.actualPct * 100).toFixed(1)}% aktuálne</span>
                  <span>{(a.targetPct * 100).toFixed(0)}% cieľ</span>
                  <span className={a.deviationPct > 3 ? 'text-orange-400' : ''}>
                    {a.deviationPct >= 0 ? '+' : ''}{a.deviationPct.toFixed(1)}pp
                  </span>
                </div>
              </div>
            );
          })}
        </Bento>

        <Bento delay={0.32} className="p-5 flex flex-col justify-between">
          <div>
            <Label>{sk ? 'Zdravie portfólia' : 'Portfolio health'}</Label>
            <Money size="xl" className="mt-3 block">{healthScore ?? '—'}</Money>
            <p className="text-white/30 text-xs mt-1">/ 100 · 64/25/11 stratégia</p>
          </div>
          <div className="mt-6 h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#14F195] to-[#9945FF] transition-all"
              style={{ width: `${healthScore ?? 0}%` }}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="bg-black/30 rounded-2xl p-3 border border-white/[0.06]">
              <Label>Halving</Label>
              <p className="font-mono text-lg font-bold text-white mt-1">{halvingProgress.toFixed(1)}%</p>
            </div>
            <div className="bg-black/30 rounded-2xl p-3 border border-white/[0.06]">
              <Label>1 BTC cieľ</Label>
              <p className="font-mono text-lg font-bold text-[#F7931A] mt-1">
                {btcGoal ? `${btcGoal.equiv.toFixed(4)} ₿` : '—'}
              </p>
            </div>
          </div>
        </Bento>
      </div>

      {/* ═══ POZÍCIE ═══════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        <Label>{sk ? 'Pozície' : 'Positions'}</Label>
        <div className="grid gap-3">
          {metrics.assets.map((a, i) => {
            const token = TOKENS.find(t => t.symbol === a.symbol)!;
            const dim = selected && selected !== a.symbol;
            const avgCost = a.holdings > 0 ? a.invested / a.holdings : 0;
            const b = breakdown.find(x => x.symbol === a.symbol);
            const change24h = prices?.[token.coingeckoId]?.usd_24h_change ?? 0;
            return (
              <Bento key={a.symbol} delay={0.36 + i * 0.05} className={`p-5 ${dim ? 'opacity-35' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-xs font-black"
                      style={{ background: `${token.color}18`, color: token.color, border: `1px solid ${token.color}35` }}
                    >
                      {a.symbol}
                    </div>
                    <div>
                      <Money size="lg" className="!text-3xl">{formatUsd(a.value)}</Money>
                      <p className="font-mono text-xs text-white/35 mt-1">
                        {a.holdings > 0
                          ? `${a.symbol === 'BTC' ? a.holdings.toFixed(6) : a.holdings.toFixed(4)} ${a.symbol}`
                          : '—'}
                        {' · '}{formatPrice(a.currentPrice)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Money size="md" positive={a.pnl >= 0} negative={a.pnl < 0} className="!text-2xl">
                      {a.pnl >= 0 ? '+' : ''}{formatUsd(a.pnl)}
                    </Money>
                    <p className={`font-mono text-sm ${a.pnlPct >= 0 ? 'text-[#14F195]' : 'text-red-400'}`}>
                      {a.pnlPct >= 0 ? '+' : ''}{a.pnlPct.toFixed(2)}%
                    </p>
                    <p className="text-[10px] text-white/30 font-mono mt-1">avg {formatUsd(avgCost)}</p>
                  </div>
                </div>
                {b && b.stakedQty > 0 && (
                  <p className="text-[10px] text-white/30 font-mono mt-3 pt-3 border-t border-white/[0.06]">
                    {b.liquidQty.toFixed(6)} liquid · {b.stakedQty.toFixed(6)} staked
                  </p>
                )}
                <p className={`text-xs font-mono mt-2 ${change24h >= 0 ? 'text-[#14F195]' : 'text-red-400'}`}>
                  24h {change24h >= 0 ? '+' : ''}{change24h.toFixed(2)}%
                </p>
              </Bento>
            );
          })}
        </div>
      </div>

      {/* ═══ TAKE PROFIT + REZERVOÁR ═══════════════════════════════════════ */}
      <Bento delay={0.5} className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-bold text-white">Dynamic Take Profit</span>
          </div>
          <Chip color="green">Rezervoár {formatUsd(reservoir.stable)}</Chip>
        </div>
        {takeProfitRows.filter(r => r.eligible).length === 0 ? (
          <p className="text-sm text-white/35 text-center py-4">Všetky aktíva akumulujú.</p>
        ) : (
          <div className="space-y-3">
            {takeProfitRows.filter(r => r.eligible).map(r => {
              const dec = TOKEN_DECIMALS[r.symbol] ?? 4;
              const tokensStr = r.sellTokens.toFixed(dec);
              return (
                <div key={r.symbol} className="rounded-2xl border border-white/[0.08] bg-black/30 p-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-white">{r.symbol}</span>
                    <Money size="md" positive className="!text-xl">+{formatUsd(r.pnl)}</Money>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Chip color="amber">Predaj {r.sellPct.toFixed(0)}% zo zisku</Chip>
                    <button
                      onClick={() => copyText(`${tokensStr} ${r.symbol}`, `tp-${r.symbol}`)}
                      className="text-xs flex items-center gap-1 text-white/40 hover:text-white"
                    >
                      {copied === `tp-${r.symbol}` ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {tokensStr} {r.symbol}
                    </button>
                  </div>
                  <button
                    disabled={busyTp === r.symbol}
                    onClick={() => {
                      setBusyTp(r.symbol);
                      addTakeProfit(r.symbol, r.sellTokens, r.sellUsd, r.currentPrice, r.sellPct);
                      toast.success(`+${formatUsd(r.sellUsd)} do rezervoáru`);
                      setTimeout(() => setBusyTp(null), 800);
                    }}
                    className="w-full py-3 rounded-xl bg-orange-500/90 text-black font-bold text-sm"
                  >
                    Označiť ako vykonané
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </Bento>

      {/* ═══ KONCENTRÁCIA ═══════════════════════════════════════════════════ */}
      {warnings.length > 0 && (
        <Bento delay={0.55} className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-bold text-white">Koncentračné riziko</span>
          </div>
          {warnings.map((w, i) => (
            <div key={i} className="rounded-2xl border border-orange-500/20 bg-orange-500/[0.04] p-3">
              <p className="text-sm font-bold text-white">{w.title}</p>
              <p className="text-xs text-white/50 mt-1">{w.message}</p>
              <p className="text-xs text-orange-300/80 mt-1">→ {w.recommendation}</p>
            </div>
          ))}
        </Bento>
      )}

      {/* Footer meta */}
      <p className="text-center text-[10px] text-white/20 font-mono pt-2">
        Všetky sumy v USD · PnL = hodnota − investované (DCA + počiatočná nákupná cena)
      </p>
    </div>
  );
}
