/**
 * Daily Risk Report — čistý analytický engine (bez UI).
 * Zbierka portfóliových metrík, WACB, koncentrácia, LiveRiskScore.
 */
import { formatUsd, formatPrice, TOKENS, type PriceData } from '@/lib/crypto';
import type { AssetMetric } from '@/hooks/usePortfolioMetrics';
import { liveRiskScore } from '@/lib/portfolio/dcaOutEngine';

export type ReportSymbol = 'BTC' | 'ETH' | 'SOL';

export interface WacbRow {
  symbol: ReportSymbol;
  holdings: number;
  wacb: number;
  spot: number;
  premiumPct: number;
  invested: number;
  value: number;
  pnl: number;
  pnlPct: number;
}

export interface AllocationRow {
  symbol: ReportSymbol;
  actualPct: number;
  targetPct: number;
  value: number;
}

export interface ConcentrationAlert {
  level: 'medium' | 'high';
  symbol: ReportSymbol;
  pct: number;
  message: string;
}

export interface DailyRiskReport {
  generatedAt: string;
  reportDate: string;
  totalValue: number;
  netLiquidity: number;
  pnl24hUsd: number;
  cumulativePnlUsd: number;
  cumulativePnlPct: number;
  allocations: AllocationRow[];
  spotPrices: Record<ReportSymbol, number>;
  change24h: Record<ReportSymbol, number>;
  fearGreed: number;
  liveRiskScore: number;
  wacb: WacbRow[];
  concentrationAlerts: ConcentrationAlert[];
  conservativeAsset: ReportSymbol;
  conservativeSummary: string;
  executiveSummary: string;
  reportText: string;
}

export interface DailyRiskReportInput {
  assets: AssetMetric[];
  prices?: PriceData;
  fearGreed: number;
  rsi: Record<ReportSymbol, number>;
  freeCash: number;
  reservoirStable: number;
  totalStakedValue?: number;
}

const REPORT_HOUR = 19;

export function todayReportKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function isPastReportTime(d = new Date()): boolean {
  return d.getHours() > REPORT_HOUR || (d.getHours() === REPORT_HOUR && d.getMinutes() >= 0);
}

function computeWacbRows(assets: AssetMetric[]): WacbRow[] {
  return assets.map(a => {
    const sym = a.symbol as ReportSymbol;
    const wacb = a.holdings > 0 ? a.invested / a.holdings : 0;
    const premiumPct = wacb > 0 && a.currentPrice > 0
      ? ((a.currentPrice - wacb) / wacb) * 100
      : 0;
    return {
      symbol: sym,
      holdings: a.holdings,
      wacb,
      spot: a.currentPrice,
      premiumPct,
      invested: a.invested,
      value: a.value,
      pnl: a.pnl,
      pnlPct: a.pnlPct,
    };
  });
}

function computeConcentrationFromMetrics(assets: AssetMetric[]): ConcentrationAlert[] {
  const out: ConcentrationAlert[] = [];
  for (const a of assets) {
    const pct = a.actualPct * 100;
    if (pct > 70) {
      out.push({
        level: 'high',
        symbol: a.symbol as ReportSymbol,
        pct,
        message: `${a.symbol} tvorí ${pct.toFixed(1)} % portfólia — kritická koncentrácia (>70 %).`,
      });
    } else if (pct > 50) {
      out.push({
        level: 'medium',
        symbol: a.symbol as ReportSymbol,
        pct,
        message: `${a.symbol} tvorí ${pct.toFixed(1)} % portfólia — prekročený prah 50 %.`,
      });
    }
  }
  return out;
}

function identifyConservativeAsset(
  assets: AssetMetric[],
  fearGreed: number,
): { asset: ReportSymbol; summary: string } {
  const btc = assets.find(a => a.symbol === 'BTC');
  const btcPct = (btc?.actualPct ?? 0) * 100;

  if (btcPct >= 40 || fearGreed > 60) {
    return {
      asset: 'BTC',
      summary: btcPct >= 50
        ? `BTC (${btcPct.toFixed(1)} %) slúži ako primárny štít proti volatilite. V režime ${fearGreed >= 70 ? 'eufórie' : 'rastu'} je konzervatívna kotva portfólia.`
        : `BTC predstavuje ${btcPct.toFixed(1)} % expozície — najstabilnejší layer-1 v portfólii. Pri F&G ${fearGreed} odporúčaná kotva proti alt-volatilite.`,
    };
  }

  const sorted = [...assets].sort((a, b) => b.actualPct - a.actualPct);
  const top = sorted[0];
  if (!top || top.actualPct <= 0) {
    return { asset: 'BTC', summary: 'Nedostatok alokovaných pozícií — BTC zostáva defaultnou konzervatívnou kotvou stratégie 64/25/11.' };
  }

  return {
    asset: top.symbol as ReportSymbol,
    summary: `${top.symbol} je najväčšia pozícia (${(top.actualPct * 100).toFixed(1)} %). Pri nízkej BTC váhe sleduj diverzifikačné riziko.`,
  };
}

function computePortfolio24hPnl(assets: AssetMetric[], prices?: PriceData): number {
  return assets.reduce((s, a) => {
    const token = TOKENS.find(t => t.symbol === a.symbol);
    const ch = prices?.[token?.coingeckoId ?? '']?.usd_24h_change ?? 0;
    return s + a.value * ch / 100;
  }, 0);
}

function computeGlobalLiveRiskScore(
  assets: AssetMetric[],
  fearGreed: number,
  rsi: Record<ReportSymbol, number>,
): number {
  const scores = assets
    .filter(a => a.holdings > 0 && a.invested > 0)
    .map(a => {
      const sym = a.symbol as ReportSymbol;
      const pnlPct = Math.max(0, a.pnlPct);
      return liveRiskScore(fearGreed, rsi[sym] ?? 50, pnlPct);
    });
  return scores.length > 0 ? Math.max(...scores) : liveRiskScore(fearGreed, 50, 0);
}

function buildReportText(report: Omit<DailyRiskReport, 'reportText'>): string {
  const lines: string[] = [
    '═══════════════════════════════════════════',
    '  DENNÝ ANALYTICKÝ REPORT · PORTFÓLIO',
    `  ${report.reportDate} · generované ${new Date(report.generatedAt).toLocaleString('sk-SK')}`,
    '═══════════════════════════════════════════',
    '',
    '▸ EXECUTIVE SUMMARY',
    `  ${report.executiveSummary}`,
    '',
    '▸ PREHĽAD PORTFÓLIA',
    `  • Celková hodnota:     ${formatUsd(report.totalValue)}`,
    `  • Čistá likvidita:     ${formatUsd(report.netLiquidity)}`,
    `  • 24H PnL:             ${report.pnl24hUsd >= 0 ? '+' : ''}${formatUsd(report.pnl24hUsd)}`,
    `  • Kumulatívny PnL:     ${report.cumulativePnlUsd >= 0 ? '+' : ''}${formatUsd(report.cumulativePnlUsd)} (${report.cumulativePnlPct >= 0 ? '+' : ''}${report.cumulativePnlPct.toFixed(2)} %)`,
    '',
    '▸ ALLOKÁCIA (BTC / ETH / SOL)',
    ...report.allocations.map(a =>
      `  • ${a.symbol}: ${formatUsd(a.value)} · ${a.actualPct.toFixed(1)} % (cieľ ${(a.targetPct * 100).toFixed(0)} %)`,
    ),
    '',
    '▸ SPOTOVÉ CENY · 24H',
    ...(['BTC', 'ETH', 'SOL'] as ReportSymbol[]).map(sym => {
      const ch = report.change24h[sym];
      return `  • ${sym}: ${formatPrice(report.spotPrices[sym])} · 24h ${ch >= 0 ? '+' : ''}${ch.toFixed(2)} %`;
    }),
    '',
    '▸ WACB vs SPOT',
    ...report.wacb.map(w => {
      if (w.holdings <= 0) return `  • ${w.symbol}: bez pozície`;
      const prem = w.premiumPct >= 0 ? `+${w.premiumPct.toFixed(2)}` : w.premiumPct.toFixed(2);
      return `  • ${w.symbol}: WACB ${formatUsd(w.wacb)} · Spot ${formatUsd(w.spot)} · ${prem} % · PnL ${w.pnl >= 0 ? '+' : ''}${formatUsd(w.pnl)}`;
    }),
    '',
    '▸ RIZIKOVÝ INDEX',
    `  • Fear & Greed:        ${report.fearGreed}`,
    `  • LiveRiskScore:       ${report.liveRiskScore.toFixed(1)} / 100`,
    `  • Vzorec: F&G×0.4 + RSI×0.4 + PnL%×0.2`,
    '',
    '▸ KONCENTRAČNÉ RIZIKO',
    ...(report.concentrationAlerts.length > 0
      ? report.concentrationAlerts.map(a => `  ⚠ ${a.message}`)
      : ['  ✓ Žiadna pozícia neprekračuje prah 50 %.']),
    '',
    '▸ KONZERVATÍVNE AKTÍVUM',
    `  • ${report.conservativeAsset}: ${report.conservativeSummary}`,
    '',
    '───────────────────────────────────────────',
    '  Report generovaný automaticky o 19:00.',
    '═══════════════════════════════════════════',
  ];
  return lines.join('\n');
}

export function generateDailyRiskReport(input: DailyRiskReportInput, at = new Date()): DailyRiskReport {
  const {
    assets, prices, fearGreed, rsi, freeCash, reservoirStable,
  } = input;

  const totalValue = assets.reduce((s, a) => s + a.value, 0);
  const totalInvested = assets.reduce((s, a) => s + a.invested, 0);
  const cumulativePnlUsd = totalValue - totalInvested;
  const cumulativePnlPct = totalInvested > 0 ? (cumulativePnlUsd / totalInvested) * 100 : 0;
  const netLiquidity = freeCash + reservoirStable;
  const pnl24hUsd = computePortfolio24hPnl(assets, prices);

  const allocations: AllocationRow[] = assets.map(a => ({
    symbol: a.symbol as ReportSymbol,
    actualPct: a.actualPct * 100,
    targetPct: a.targetPct,
    value: a.value,
  }));

  const spotPrices = {} as Record<ReportSymbol, number>;
  const change24h = {} as Record<ReportSymbol, number>;
  for (const sym of ['BTC', 'ETH', 'SOL'] as ReportSymbol[]) {
    const token = TOKENS.find(t => t.symbol === sym)!;
    spotPrices[sym] = prices?.[token.coingeckoId]?.usd ?? assets.find(a => a.symbol === sym)?.currentPrice ?? 0;
    change24h[sym] = prices?.[token.coingeckoId]?.usd_24h_change ?? 0;
  }

  const wacb = computeWacbRows(assets);
  const concentrationAlerts = computeConcentrationFromMetrics(assets);
  const { asset: conservativeAsset, summary: conservativeSummary } = identifyConservativeAsset(assets, fearGreed);
  const globalScore = computeGlobalLiveRiskScore(assets, fearGreed, rsi);

  const btcAlert = concentrationAlerts.find(a => a.symbol === 'BTC');
  const riskTone = globalScore >= 70 ? 'vysoké' : globalScore >= 50 ? 'stredné' : 'nízke';
  const pnlTone = cumulativePnlUsd >= 0 ? 'v pluse' : 'v strate';
  const executiveSummary = [
    `Portfólio ${formatUsd(totalValue)} je ${pnlTone} (${cumulativePnlPct >= 0 ? '+' : ''}${cumulativePnlPct.toFixed(1)} %).`,
    `24H pohyb ${pnl24hUsd >= 0 ? '+' : ''}${formatUsd(pnl24hUsd)}.`,
    `LiveRiskScore ${globalScore.toFixed(0)} indikuje ${riskTone} distribučné riziko.`,
    btcAlert ? btcAlert.message : 'Alokácia v rámci koncentračných limitov.',
  ].join(' ');

  const base: Omit<DailyRiskReport, 'reportText'> = {
    generatedAt: at.toISOString(),
    reportDate: todayReportKey(at),
    totalValue,
    netLiquidity,
    pnl24hUsd,
    cumulativePnlUsd,
    cumulativePnlPct,
    allocations,
    spotPrices,
    change24h,
    fearGreed,
    liveRiskScore: globalScore,
    wacb,
    concentrationAlerts,
    conservativeAsset,
    conservativeSummary,
    executiveSummary,
  };

  return { ...base, reportText: buildReportText(base) };
}

export const DAILY_REPORT_STORAGE_KEY = 'daily-report-state-v1';

export interface DailyReportState {
  generatedAt: string;
  reportDate: string;
  reportText: string;
  report: DailyRiskReport;
}

export function loadDailyReportState(): DailyReportState | null {
  try {
    const raw = localStorage.getItem(DAILY_REPORT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DailyReportState;
  } catch {
    return null;
  }
}

export function saveDailyReportState(state: DailyReportState): void {
  try {
    localStorage.setItem(DAILY_REPORT_STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new Event('daily-report-updated'));
  } catch { /* quota */ }
}
