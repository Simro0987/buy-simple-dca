import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatUsd } from '@/lib/crypto';
import { usePortfolioPerformanceHistory } from '@/hooks/usePortfolioPerformanceHistory';
import { Bento, Label, Chip } from '@/components/modern-portfolio/primitives';
import {
  performanceRangeChangePct,
  type PortfolioHoldingsMap,
  type PortfolioPerformanceRange,
} from '@/lib/portfolioPerformanceHistory';
import { MASKED_USD } from '@/lib/portfolioPrivacy';

interface Props {
  holdings: PortfolioHoldingsMap;
  balanceVisible?: boolean;
  loading?: boolean;
  sk?: boolean;
}

const RANGES: { id: PortfolioPerformanceRange; label: string }[] = [
  { id: 7, label: '7D' },
  { id: 30, label: '30D' },
];

function ChartTooltip({
  active,
  payload,
  label,
  balanceVisible,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  balanceVisible: boolean;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value ?? 0;
  return (
    <div className="rounded-xl border border-white/10 bg-[#0A0A0A]/95 px-3 py-2 shadow-lg">
      <p className="text-[10px] text-white/45 font-mono">{label}</p>
      <p className="text-sm font-mono font-bold text-white tabular-nums">
        {balanceVisible ? formatUsd(value) : MASKED_USD}
      </p>
    </div>
  );
}

export function PortfolioPerformanceChart({
  holdings,
  balanceVisible = true,
  loading,
  sk,
}: Props) {
  const [range, setRange] = useState<PortfolioPerformanceRange>(7);
  const totalHoldings = holdings.bitcoin + holdings.ethereum + holdings.solana;

  const {
    data: history,
    isLoading: historyLoading,
    isFetching: historyFetching,
    isError,
  } = usePortfolioPerformanceHistory(holdings, range);

  const data = history ?? [];
  const rangePct = useMemo(() => performanceRangeChangePct(data), [data]);
  const isUp = rangePct >= 0;
  const stroke = isUp ? '#10b981' : '#8b5cf6';
  const gradientId = `portfolio-perf-${isUp ? 'up' : 'down'}`;
  const chartLoading = loading && data.length === 0 && totalHoldings > 0;

  const zeroChartData = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      return {
        shortLabel: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        value: 0,
      };
    });
  }, []);

  if (chartLoading) {
    return (
      <Bento delay={0.1} className="p-4 sm:p-5 min-w-0">
        <div className="animate-pulse space-y-4">
          <div className="flex justify-between">
            <div className="h-3 w-36 rounded bg-white/10" />
            <div className="h-6 w-20 rounded-full bg-white/[0.05]" />
          </div>
          <div className="h-44 sm:h-52 rounded-2xl bg-white/[0.04]" />
        </div>
      </Bento>
    );
  }

  const showZeroFlatLine = totalHoldings <= 0;
  const chartData = showZeroFlatLine ? zeroChartData : data;
  const showEmptyHistory = !showZeroFlatLine && (isError || data.length < 2);

  return (
    <Bento delay={0.1} className="p-4 sm:p-5 min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
        <div className="min-w-0">
          <Label>{sk ? 'Historická výkonnosť' : 'Historical performance'}</Label>
          <p className="text-[11px] text-white/35 font-mono mt-1">
            {showZeroFlatLine
              ? (sk ? 'Zadajte držby cez ⚙️ pre historický graf' : 'Add holdings via ⚙️ to chart history')
              : sk
                ? 'CoinGecko market_chart · holdings × historické ceny'
                : 'CoinGecko market_chart · holdings × historical prices'}
            {historyFetching && !showZeroFlatLine ? ' · SYNC' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!showZeroFlatLine && data.length >= 2 && (
            <Chip color={isUp ? 'green' : 'purple'}>
              {balanceVisible
                ? `${isUp ? '+' : ''}${rangePct.toFixed(2)}% · ${range}D`
                : `***% · ${range}D`}
            </Chip>
          )}
          <div className="flex gap-1 rounded-full border border-white/10 p-0.5">
            {RANGES.map(r => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRange(r.id)}
                className={`px-2.5 py-1 rounded-full text-[10px] font-semibold font-mono transition-colors ${
                  range === r.id
                    ? 'bg-white text-black'
                    : 'text-white/45 hover:text-white/80'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showEmptyHistory ? (
        <p className="text-sm text-white/35 mt-4 py-10 text-center">
          {sk ? 'Historické dáta sa nepodarilo načítať.' : 'Unable to load historical chart data.'}
        </p>
      ) : (
        <div className="mt-4 h-44 sm:h-52 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                </linearGradient>
                <filter id="portfolio-line-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.5" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <CartesianGrid
                stroke="rgba(255,255,255,0.12)"
                strokeOpacity={0.1}
                vertical={false}
              />
              <XAxis
                dataKey="shortLabel"
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.35)' }}
                tickLine={false}
                axisLine={false}
                width={48}
                tickFormatter={(v: number) =>
                  balanceVisible
                    ? (v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`)
                    : '$***'
                }
                domain={showZeroFlatLine ? [0, 1] : ['auto', 'auto']}
              />
              <Tooltip content={<ChartTooltip balanceVisible={balanceVisible} />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={stroke}
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: stroke,
                  stroke: '#0A0A0A',
                  strokeWidth: 2,
                }}
                style={{ filter: 'url(#portfolio-line-glow)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Bento>
  );
}
