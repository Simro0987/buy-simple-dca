import { useState, useEffect, useMemo, useCallback } from 'react';
import { Lang } from '@/lib/i18n';
import { PriceData, TOKENS, formatUsd } from '@/lib/crypto';
import { TrendingUp, ShoppingCart } from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { BentoCard } from '@/components/portfolio/ui/BentoCard';
import { MoneyValue } from '@/components/portfolio/ui/MoneyValue';

const STORAGE_KEY = 'portfolio-history-v2';
const MAX_POINTS = 90;

interface TokenSnapshot {
  [tokenId: string]: number; // value in USD
}

interface HistoryPoint {
  date: string; // YYYY-MM-DD
  value: number;
  tokens: TokenSnapshot;
}

function getHistory(): HistoryPoint[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
    // Migrate from v1
    const v1 = localStorage.getItem('portfolio-history');
    if (v1) {
      const old: { date: string; value: number }[] = JSON.parse(v1);
      return old.map(p => ({ ...p, tokens: {} }));
    }
    return [];
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
  selected?: 'BTC' | 'ETH' | 'SOL' | null;
}

export function PortfolioHistoryChart({ lang, prices, selected }: Props) {
  const sk = lang === 'sk';
  const { metrics } = usePortfolio();
  const [history, setHistory] = useState<HistoryPoint[]>(getHistory);
  const [range, setRange] = useState<7 | 30>(30);

  const selectedTokenId = selected ? TOKENS.find(t => t.symbol === selected)?.id : undefined;

  // Record today's value with per-token breakdown
  useEffect(() => {
    if (!prices) return;
    const holdings = getHoldings();
    let totalValue = 0;
    const tokens: TokenSnapshot = {};

    for (const token of TOKENS) {
      const key = token.symbol.toLowerCase();
      const qty = holdings[key] || 0;
      const price = prices[token.coingeckoId]?.usd || 0;
      const val = qty * price;
      tokens[token.id] = val;
      totalValue += val;
    }
    if (totalValue <= 0) return;

    const today = new Date().toISOString().slice(0, 10);
    setHistory((prev) => {
      const updated = prev.filter(p => p.date !== today);
      updated.push({ date: today, value: totalValue, tokens });
      updated.sort((a, b) => a.date.localeCompare(b.date));
      const trimmed = updated.slice(-MAX_POINTS);
      saveHistory(trimmed);
      return trimmed;
    });
  }, [prices]);

  const filtered = useMemo(() => history.slice(-range), [history, range]);

  if (filtered.length < 1) return null;
  const hasMultiple = filtered.length >= 2;

  const values = filtered.map(p => selectedTokenId ? (p.tokens?.[selectedTokenId] ?? 0) : p.value);
  const latest = values[values.length - 1];
  const first = values[0];
  const changePct = first > 0 ? ((latest - first) / first) * 100 : 0;
  const changeUsd = latest - first;

  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = (maxVal - minVal) * 0.1 || 10;

  const dateSet = new Set(filtered.map(p => p.date));
  const buyDates = new Set(
    metrics.history.map(h => h.created_at.slice(0, 10)).filter(d => dateSet.has(d))
  );

  const chartData = filtered.map(p => {
    const v = selectedTokenId ? (p.tokens?.[selectedTokenId] ?? 0) : p.value;
    return {
      date: p.date,
      value: v,
      buy: buyDates.has(p.date) ? v : null,
      ...p.tokens,
    };
  });

  const seriesColor = selected
    ? (TOKENS.find(t => t.symbol === selected)?.color ?? 'hsl(var(--primary))')
    : (changePct >= 0 ? 'hsl(var(--gain))' : 'hsl(var(--loss))');

  return (
    <BentoCard padding="md" className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-neon-green" />
          <span className="text-sm font-semibold text-white">
            {sk ? 'Vývoj portfólia' : 'Portfolio History'}
            {selected && <span className="ml-1.5 text-[10px] text-white/35">· {selected}</span>}
          </span>
        </div>
        {hasMultiple && (
          <div className="flex items-center gap-2">
            <MoneyValue size="sm" positive={changePct >= 0} negative={changePct < 0}>
              {changePct >= 0 ? '+' : ''}{changePct.toFixed(1)}%
            </MoneyValue>
            <span className={`text-xs font-mono ${changeUsd >= 0 ? 'text-gain' : 'text-loss'}`}>
              ({changeUsd >= 0 ? '+' : ''}{formatUsd(changeUsd)})
            </span>
          </div>
        )}
        {!hasMultiple && (
          <MoneyValue size="sm">{formatUsd(latest)}</MoneyValue>
        )}
      </div>

      <div className="flex gap-1">
        {([7, 30] as const).map(r => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              range === r
                ? 'bg-neon-green/15 text-neon-green border border-neon-green/30'
                : 'bg-white/[0.04] text-white/40 border border-white/[0.06] hover:text-white/70'
            }`}
          >
            {r}{sk ? 'd' : 'd'}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="w-full h-48">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={seriesColor} stopOpacity={0.3} />
                <stop offset="100%" stopColor={seriesColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" opacity={0.3} />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(5)}
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
              axisLine={false}
              tickLine={false}
              minTickGap={30}
            />
            <YAxis
              domain={[minVal - padding, maxVal + padding]}
              tickFormatter={(v: number) => `$${(v / 1000).toFixed(1)}k`}
              tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
              axisLine={false}
              tickLine={false}
              width={45}
            />
            <Tooltip content={<CustomTooltip sk={sk} />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={seriesColor}
              strokeWidth={2}
              fill="url(#portfolioGrad)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: 'hsl(var(--primary))' }}
            />
            <Scatter dataKey="buy" fill="hsl(var(--gain))" shape="circle" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {buyDates.size > 0 && (
        <div className="flex items-center gap-1.5 text-[10px] text-white/35">
          <ShoppingCart className="w-3 h-3 text-neon-green" />
          <span>{sk ? `${buyDates.size} DCA nákupov v tomto období` : `${buyDates.size} DCA buys in range`}</span>
        </div>
      )}

      {filtered.length > 0 && Object.keys(filtered[filtered.length - 1].tokens).length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {TOKENS.map(token => {
            const val = filtered[filtered.length - 1].tokens[token.id] || 0;
            if (val <= 0) return null;
            const firstVal = filtered[0].tokens?.[token.id] || 0;
            const pct = firstVal > 0 ? ((val - firstVal) / firstVal) * 100 : 0;
            return (
              <div key={token.id} className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: token.color }} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-white">{token.symbol}</span>
                  <span className="text-xs font-mono text-white/40 ml-1">{formatUsd(val)}</span>
                </div>
                <span className={`text-[10px] font-mono font-medium ${pct >= 0 ? 'text-gain' : 'text-loss'}`}>
                  {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-white/30 text-center">
        {sk
          ? `📊 Dáta sa zbierajú denne · ${filtered.length} ${filtered.length === 1 ? 'záznam' : filtered.length < 5 ? 'záznamy' : 'záznamov'}`
          : `📊 Data collected daily · ${filtered.length} ${filtered.length === 1 ? 'record' : 'records'}`}
      </p>
    </BentoCard>
  );
}

// Custom tooltip
type TooltipDatum = { date: string; value: number } & Record<string, number | string>;
function CustomTooltip({ active, payload, label, sk }: { active?: boolean; payload?: Array<{ payload?: TooltipDatum }>; label?: string; sk?: boolean }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-[#0A0A0A] border border-white/10 rounded-2xl p-3 shadow-xl space-y-1.5 text-xs">
      <p className="font-semibold text-white">{data.date}</p>
      <p className="font-mono text-sm font-bold text-white">{formatUsd(data.value)}</p>
      {TOKENS.map(token => {
        const val = Number(data[token.id] ?? 0);
        if (!val || val <= 0) return null;
        return (
          <div key={token.id} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: token.color }} />
            <span className="text-white/40">{token.symbol}</span>
            <span className="ml-auto font-mono font-medium text-white">{formatUsd(val)}</span>
          </div>
        );
      })}
    </div>
  );
}
