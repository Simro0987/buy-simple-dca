export type ReportAssetSymbol = 'BTC' | 'ETH' | 'SOL';

export interface DailyRiskReportAsset {
  symbol: ReportAssetSymbol;
  allocationPct: number;
  spotPrice: number;
  holdings: number;
  investedUsd: number;
}

export interface DailyRiskReportInput {
  totalPortfolioValueUsd: number;
  cleanLiquidityUsd: number;
  pnl24hUsd: number;
  cumulativePnlUsd: number;
  globalRiskScore: number;
  assets: DailyRiskReportAsset[];
}

const fmtUsd = (n: number) =>
  `$${Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0.00'}`;

const fmtPrice = (n: number) =>
  `$${Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 2 : 4 }) : '0'}`;

const fmtPct = (n: number) =>
  `${Number.isFinite(n) ? n.toFixed(2) : '0.00'}%`;

const fmtQty = (symbol: ReportAssetSymbol, qty: number) => {
  const d = symbol === 'BTC' ? 6 : symbol === 'ETH' ? 5 : 3;
  return Number.isFinite(qty) ? qty.toFixed(d) : '0';
};

export function generateDailyRiskReport(input: DailyRiskReportInput): string {
  const dateStamp = new Date().toLocaleString('sk-SK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  const wacbLines = input.assets.map((asset) => {
    const wacb = asset.holdings > 0 ? asset.investedUsd / asset.holdings : 0;
    const diffPct = wacb > 0 ? ((asset.spotPrice - wacb) / wacb) * 100 : 0;
    const diffTag = diffPct >= 0 ? `+${fmtPct(diffPct)}` : fmtPct(diffPct);
    return `- **${asset.symbol}** · WACB ${fmtPrice(wacb)} vs Spot ${fmtPrice(asset.spotPrice)} (${diffTag})`;
  });

  const allocationLines = input.assets.map((asset) =>
    `- **${asset.symbol}** · ${fmtPct(asset.allocationPct)} · Spot ${fmtPrice(asset.spotPrice)} · Qty ${fmtQty(asset.symbol, asset.holdings)}`,
  );

  const btcAllocation = input.assets.find((a) => a.symbol === 'BTC')?.allocationPct ?? 0;
  const concentrationLine = btcAllocation > 50
    ? `⚠️ **Koncentračné riziko:** BTC alokácia je ${fmtPct(btcAllocation)} (nad 50%).`
    : `✅ **Koncentračné riziko:** BTC alokácia ${fmtPct(btcAllocation)} je v tolerancii.`;

  const conservativeSummary =
    `🛡️ **Konzervatívne jadro:** BTC zostáva hlavným štítom proti volatilite vďaka ` +
    `${fmtPct(btcAllocation)} podielu a najvyššej likvidite zo sledovaných aktív.`;

  const pnl24hTag = input.pnl24hUsd >= 0 ? `+${fmtUsd(input.pnl24hUsd)}` : fmtUsd(input.pnl24hUsd);
  const cumulativeTag = input.cumulativePnlUsd >= 0 ? `+${fmtUsd(input.cumulativePnlUsd)}` : fmtUsd(input.cumulativePnlUsd);

  return [
    `**Daily Risk Report** · ${dateStamp}`,
    '',
    '- **Celková hodnota portfólia:** ' + fmtUsd(input.totalPortfolioValueUsd),
    '- **Čistá likvidita:** ' + fmtUsd(input.cleanLiquidityUsd),
    '- **24H PnL:** ' + pnl24hTag,
    '- **Kumulatívne PnL:** ' + cumulativeTag,
    '',
    '**Aktuálne alokácie & spot ceny**',
    ...allocationLines,
    '',
    `- **Globálny index rizika (LiveRiskScore):** ${fmtPct(input.globalRiskScore)}`,
    '',
    '**WACB vs Spot**',
    ...wacbLines,
    '',
    concentrationLine,
    conservativeSummary,
  ].join('\n');
}
