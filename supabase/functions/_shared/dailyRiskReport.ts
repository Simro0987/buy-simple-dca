/**
 * Slovak-formatted Daily Risk Report builder.
 * Purely presentational: takes already-computed live metrics and renders the
 * Telegram Markdown message with context-aware insight lines.
 */

import type { ReportToken, TokenIndicators, RiskScoreResult } from './riskIndicators.ts';
import type { HarvestVerdict } from './harvestEngine.ts';


/** Number with Slovak decimal comma and space thousand separators. */
export function skNum(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '0,00'.slice(0, decimals > 0 ? 4 : 1);
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = n < 0 ? '-' : '';
  return dec ? `${sign}${grouped},${dec}` : `${sign}${grouped}`;
}

export const skUsd = (n: number) => `$${skNum(n, 2)}`;
export const skPct = (n: number, d = 2) => `${skNum(n, d)} %`;
export const skSigned = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${skNum(n, d)}`;
export const skSignedUsd = (n: number) => `${n >= 0 ? '+' : ''}$${skNum(n, 2)}`;
export const skSignedPct = (n: number, d = 2) => `${n >= 0 ? '+' : ''}${skNum(n, d)} %`;

export function skPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return 'n/a';
  const d = n >= 1000 ? 2 : n >= 1 ? 3 : 5;
  return `$${skNum(n, d)}`;
}

export function skQty(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const d = n >= 100 ? 2 : n >= 1 ? 4 : 6;
  return skNum(n, d);
}

export interface ReportPosition {
  token: ReportToken;
  holdings: number;
  investedUsd: number;
  valueUsd: number;
  weight: number; // 0..1
}

export interface ActiveExecution {
  token: string;
  leg: 'market' | 'limit';
  /** Milliseconds epoch when the 7D flag expires. */
  activeUntil: number;
}

export interface DailyRiskReportData {
  generatedAt: Date;
  totalValueUsd: number;
  prevValueUsd: number;
  pnl24hUsd: number;
  cumulativePnlUsd: number;
  investedUsd: number;
  cleanLiquidityUsd: number;
  positions: ReportPosition[];
  indicators: Record<ReportToken, TokenIndicators>;
  risk: RiskScoreResult;
  fearGreed: number;
  activeExecutions: ActiveExecution[];
  degradedTokens: string[];
  /** Multi-factor harvest verdicts (0–10 score + continuous TP %). */
  harvest?: HarvestVerdict[];
  /** Anti confirmation-bias line for the TP decisions. */
  contrarian?: string;
}


function statusMarkers(ind: TokenIndicators): string[] {
  const marks: string[] = [];
  if (ind.source === 'unavailable') return ['⛔️ dáta nedostupné'];
  if (ind.rsi14 < 30) marks.push('🟢 prepredané (RSI < 30)');
  else if (ind.rsi14 > 70) marks.push('🔴 prekúpené (RSI > 70)');
  if (ind.crossedSma === 'up') marks.push('📈 kríž nad 200D SMA');
  else if (ind.crossedSma === 'down') marks.push('📉 kríž pod 200D SMA');
  if (ind.atrPrevPct > 0 && ind.atrPct > ind.atrPrevPct * 1.25) marks.push('⚡️ expanzia ATR');
  if (ind.source === 'coingecko') marks.push('ℹ️ záložný zdroj ceny');
  return marks;
}

function dayLabel(days: number): string {
  if (days === 1) return '1 deň';
  if (days >= 2 && days <= 4) return `${days} dni`;
  return `${days} dní`;
}

export function buildDailyRiskReport(d: DailyRiskReportData): string {
  const stamp = d.generatedAt.toLocaleString('sk-SK', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Bratislava',
  });

  const pnl24Pct = d.prevValueUsd > 0 ? (d.pnl24hUsd / d.prevValueUsd) * 100 : 0;
  const cumPct = d.investedUsd > 0 ? (d.cumulativePnlUsd / d.investedUsd) * 100 : 0;

  const held = d.positions
    .filter((p) => p.valueUsd > 0)
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const allocationLines = held.length
    ? held.map((p) => {
        const ind = d.indicators[p.token];
        const wacb = p.holdings > 0 ? p.investedUsd / p.holdings : 0;
        const wacbDiff = wacb > 0 && ind.price > 0 ? ((ind.price - wacb) / wacb) * 100 : 0;
        const marks = statusMarkers(ind);
        const head =
          `• *${p.token}* — ${skPct(p.weight * 100, 1)} · ${skUsd(p.valueUsd)} · ` +
          `Spot ${skPrice(ind.price)} (${skSignedPct(ind.change24hPct)})`;
        const detail =
          `   Qty ${skQty(p.holdings)} · WACB ${skPrice(wacb)} (${skSignedPct(wacbDiff)}) · ` +
          `RSI ${skNum(ind.rsi14, 1)} · 200D SMA ${ind.sma200 > 0 ? skSignedPct(ind.smaDistPct, 1) : 'n/a'} · ` +
          `ATR ${skPct(ind.atrPct, 2)}`;
        return marks.length ? `${head}\n${detail}\n   ${marks.join(' · ')}` : `${head}\n${detail}`;
      })
    : ['• Žiadne otvorené pozície v portfóliu.'];

  // ── Context-aware insights ────────────────────────────────────────────────
  const insights: string[] = [];

  if (d.risk.weightedAtrPct >= 5) {
    insights.push(
      `⚡️ *Vysoká volatilita:* vážený ATR portfólia je ${skPct(d.risk.weightedAtrPct)} — ` +
      'limitné príkazy drž hlbšie pod spotom.',
    );
  } else if (d.risk.weightedAtrPct > 0 && d.risk.weightedAtrPct <= 2.5) {
    insights.push(
      `😴 *Nízka volatilita:* vážený ATR ${skPct(d.risk.weightedAtrPct)} — ` +
      'limity nemusia byť naplnené, zváž vyšší podiel Market.',
    );
  }

  if (d.risk.topToken && d.risk.topWeight > 0.5) {
    insights.push(
      `⚠️ *Koncentračné riziko:* ${d.risk.topToken} tvorí ${skPct(d.risk.topWeight * 100, 1)} ` +
      `portfólia (HHI ${skNum(d.risk.concentration, 2)}).`,
    );
  } else if (d.risk.topToken) {
    insights.push(
      `✅ *Rozloženie váh v tolerancii:* najväčšia pozícia ${d.risk.topToken} ` +
      `${skPct(d.risk.topWeight * 100, 1)} (HHI ${skNum(d.risk.concentration, 2)}).`,
    );
  }

  const oversold = held.filter((p) => d.indicators[p.token]?.rsi14 < 30).map((p) => p.token);
  if (oversold.length) {
    insights.push(`🟢 *Prepredané zóny:* ${oversold.join(', ')} — priestor na navýšenie DCA.`);
  }
  const overbought = held.filter((p) => d.indicators[p.token]?.rsi14 > 70).map((p) => p.token);
  if (overbought.length) {
    insights.push(`🔴 *Prekúpené zóny:* ${overbought.join(', ')} — preferuj limitné vstupy.`);
  }
  const crossUp = held.filter((p) => d.indicators[p.token]?.crossedSma === 'up').map((p) => p.token);
  if (crossUp.length) insights.push(`📈 *Prelom nad 200D SMA:* ${crossUp.join(', ')}.`);
  const crossDown = held.filter((p) => d.indicators[p.token]?.crossedSma === 'down').map((p) => p.token);
  if (crossDown.length) insights.push(`📉 *Pád pod 200D SMA:* ${crossDown.join(', ')} — trend oslabuje.`);

  if (d.fearGreed <= 25) {
    insights.push(`🧊 *Fear & Greed ${d.fearGreed}:* strach na trhu podporuje akumuláciu.`);
  } else if (d.fearGreed >= 75) {
    insights.push(`🔥 *Fear & Greed ${d.fearGreed}:* chamtivosť — zvýš disciplínu pri profit-takingu.`);
  }

  if (!insights.length) insights.push('ℹ️ Trh je bez výrazných extrémov, pokračuj podľa plánu.');

  // ── Active 7D execution states ────────────────────────────────────────────
  const now = d.generatedAt.getTime();
  const activeLines = d.activeExecutions
    .filter((a) => a.activeUntil > now)
    .sort((a, b) => a.activeUntil - b.activeUntil)
    .map((a) => {
      const days = Math.max(1, Math.ceil((a.activeUntil - now) / 86_400_000));
      const until = new Date(a.activeUntil);
      const dd = String(until.getDate()).padStart(2, '0');
      const mm = String(until.getMonth() + 1).padStart(2, '0');
      const legLabel = a.leg === 'market' ? 'MKT' : 'LMT';
      return `• *${a.token}* ${legLabel} — aktívne do ${dd}.${mm}. (zostáva ${dayLabel(days)})`;
    });

  // ── Harvest heatmap & TP advisor ──────────────────────────────────────────
  const heatBar = (overheat: number): string => {
    const filled = Math.max(0, Math.min(10, Math.round(overheat / 10)));
    return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
  };
  const harvestLines = (d.harvest ?? []).map((h) => {
    const head = `• *${h.token}* ${skNum(h.score, 2)}/10 · ${h.categoryLabel}`;
    const meter = `   ${heatBar(h.overheat)} ${skNum(h.overheat, 0)}/100`
      + (h.pnlGated ? '' : ` · ${h.whenText}`);

    const pnlText = h.unrealizedPnlPct != null
      ? skSignedPct(h.unrealizedPnlPct)
      : 'nezadané';
    // Single clean line: real PnL first, then the TP verdict / lock reason.
    const tpText = h.pnlGated
      ? '🔒 TP zablokované: Zisk pod limitom (+15 %)'
      : h.tpPct < 0.05
        ? 'Výber: 0 % — držať celú pozíciu'
        : `Výber: ${skPct(h.tpPct)} → ${h.destination}`;
    const pnl = `   Reálne PnL: ${pnlText} | ${tpText}`;
    const fnd = `   Fundamenty: ${h.fundamentalNote}`;
    const base = `${head}\n${meter}\n${pnl}\n${fnd}`;
    return h.degraded ? `${base}\n   ⛔️ dáta degradované` : base;
  });


  const lines: string[] = [
    `📊 *Daily Risk Report* · ${stamp}`,
    '',
    `• *Hodnota portfólia:* ${skUsd(d.totalValueUsd)}`,
    `• *24H PnL:* ${skSignedUsd(d.pnl24hUsd)} (${skSignedPct(pnl24Pct)})`,
    `• *Kumulatívne PnL:* ${skSignedUsd(d.cumulativePnlUsd)} (${skSignedPct(cumPct)})`,
    `• *Čistá likvidita:* ${skUsd(d.cleanLiquidityUsd)}`,
    `• *LiveRiskScore:* ${skPct(d.risk.score, 1)} · ATR ${skPct(d.risk.weightedAtrPct)} · ` +
      `HHI ${skNum(d.risk.concentration, 2)} · RSI ${skNum(d.risk.weightedRsi, 1)}`,
    '',
    '*Alokácie & live indikátory*',
    ...allocationLines,
    '',
    '*Interpretácia trhu*',
    ...insights,
    '',
    '*Aktívne príkazy (7D)*',
    ...(activeLines.length ? activeLines : ['• Žiadne aktívne 7-dňové príkazy.']),
  ];

  if (harvestLines.length) {
    lines.push(
      '',
      '🔥 *Portfolio Heatmap & TP Advisor*',
      ...harvestLines,
      '',
      '_Routing: BTC zisky → stablecoin (USDC/USDT) · altcoin zisky → wBTC (ARB)._',
    );
  }

  if (d.contrarian) {
    lines.push(
      '',
      '*Contrarian Check*',
      '_Kde je najväčšie riziko, že sa pri tomto TP rozhodnutí mýlime?_',
      d.contrarian,
    );
  }


  if (d.degradedTokens.length) {
    lines.push('', `⚠️ *Dáta nedostupné pre:* ${d.degradedTokens.join(', ')} (API zaváhalo, hodnoty vynechané).`);
  }

  return lines.join('\n');
}
