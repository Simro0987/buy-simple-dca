import { useState, useEffect, useMemo } from 'react';
import { Lang } from '@/lib/i18n';
import { PriceData, TOKENS } from '@/lib/crypto';
import { TrendingUp } from 'lucide-react';

const STORAGE_KEY = 'portfolio-history';
const MAX_POINTS = 30;

interface HistoryPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

function getHistory(): HistoryPoint[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(points: HistoryPoint[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(points.slice(-MAX_POINTS)));
}

function getHoldings(): Record<string, number> {
  try {
    const raw = localStorage.getItem('smart-alloc-holdings');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

interface Props {
  lang: Lang;
  prices?: PriceData;
}

export function PortfolioHistoryChart({ lang, prices }: Props) {
  const sk = lang === 'sk';
  const [history, setHistory] = useState<HistoryPoint[]>(getHistory);

  // Record today's value
  useEffect(() => {
    if (!prices) return;
    const holdings = getHoldings();
    let totalValue = 0;
    for (const token of TOKENS) {
      const key = token.symbol.toLowerCase();
      const qty = holdings[key] || 0;
      const price = prices[token.coingeckoId]?.usd || 0;
      totalValue += qty * price;
    }
    if (totalValue <= 0) return;

    const today = new Date().toISOString().slice(0, 10);
    const updated = history.filter(p => p.date !== today);
    updated.push({ date: today, value: totalValue });
    updated.sort((a, b) => a.date.localeCompare(b.date));
    const trimmed = updated.slice(-MAX_POINTS);
    setHistory(trimmed);
    saveHistory(trimmed);
  }, [prices]);

  if (history.length < 2) return null;

  const values = history.map(p => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const latest = values[values.length - 1];
  const first = values[0];
  const changePct = first > 0 ? ((latest - first) / first) * 100 : 0;

  // Build SVG path
  const width = 300;
  const height = 60;
  const points = history.map((p, i) => {
    const x = (i / (history.length - 1)) * width;
    const y = height - ((p.value - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  });
  const pathD = `M ${points.join(' L ')}`;

  return (
    <div className="glass-card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            {sk ? 'Vývoj portfólia' : 'Portfolio History'}
          </span>
        </div>
        <span className={`text-sm font-bold ${changePct >= 0 ? 'text-gain' : 'text-loss'}`}>
          {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%
        </span>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-16" preserveAspectRatio="none">
        <defs>
          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={changePct >= 0 ? 'hsl(var(--gain))' : 'hsl(var(--loss))'} stopOpacity="0.3" />
            <stop offset="100%" stopColor={changePct >= 0 ? 'hsl(var(--gain))' : 'hsl(var(--loss))'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={`${pathD} L ${width},${height} L 0,${height} Z`}
          fill="url(#chartGrad)"
        />
        <path
          d={pathD}
          fill="none"
          stroke={changePct >= 0 ? 'hsl(var(--gain))' : 'hsl(var(--loss))'}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{history[0].date.slice(5)}</span>
        <span>${latest.toLocaleString('en', { maximumFractionDigits: 0 })}</span>
        <span>{history[history.length - 1].date.slice(5)}</span>
      </div>
    </div>
  );
}
