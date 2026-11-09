/**
 * Portfolio value chart with interactive time filters (1D … ALL).
 * Approximation: uses CURRENT quantities × historical price per asset
 * (CoinGecko market_chart). Not a full transaction-aware reconstruction —
 * intended as a quick visual trend indicator only.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Loader2 } from 'lucide-react';
import { cgFetch } from '@/lib/coingecko';
import { formatUsd } from '@/lib/crypto';
import type { HoldingRow } from './PortfolioV2';

interface Props { rows: HoldingRow[] }

interface Point { t: number; date: string; value: number }

type RangeId = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL';

const RANGES: { id: RangeId; days: string; intraday: boolean }[] = [
  { id: '1D',  days: '1',   intraday: true },
  { id: '1W',  days: '7',   intraday: true },
  { id: '1M',  days: '30',  intraday: false },
  { id: '3M',  days: '90',  intraday: false },
  { id: '6M',  days: '180', intraday: false },
  { id: '1Y',  days: '365', intraday: false },
  { id: 'ALL', days: 'max', intraday: false },
];

async function fetchChart(id: string, days: string, intraday: boolean): Promise<[number, number][]> {
  const params: Record<string, string | number> = { vs_currency: 'usd', days };
  if (!intraday) params.interval = 'daily';
  const r = await cgFetch(`/coins/${id}/market_chart`, params);
  if (!r.ok) throw new Error('CoinGecko chart failed');
  const j = await r.json();
  return (j?.prices ?? []) as [number, number][];
}

const fmtLabel = (ts: number, intraday: boolean) => {
  const d = new Date(ts);
  return intraday
    ? d.toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' });
};

export function PortfolioHistoryChart({ rows }: Props) {
  const [range, setRange] = useState<RangeId>('1M');
  const cfg = RANGES.find(r => r.id === range)!;

  const held = rows.filter(r => r.quantity > 0);
  const ids = held.map(r => r.coingecko_id);
  const key = ids.slice().sort().join(',');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['portfolio-history', range, key, held.map(r => r.quantity).join(',')],
    enabled: held.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const results = await Promise.all(
        held.map(async r => ({
          row: r,
          prices: await fetchChart(r.coingecko_id, cfg.days, cfg.intraday).catch(() => [] as [number, number][]),
        })),
      );
      // Bucket by day (or hour for intraday ranges).
      const buckets: Record<string, number> = {};
      for (const { row, prices } of results) {
        for (const [ts, px] of prices) {
          const iso = new Date(ts).toISOString();
          const bucket = cfg.intraday ? iso.slice(0, 13) : iso.slice(0, 10);
          buckets[bucket] = (buckets[bucket] ?? 0) + row.quantity * px;
        }
      }
      const points: Point[] = Object.entries(buckets)
        .map(([bucket, value]) => {
          const t = new Date(cfg.intraday ? `${bucket}:00:00Z` : bucket).getTime();
          return { t, date: fmtLabel(t, cfg.intraday), value };
        })
        .sort((a, b) => a.t - b.t);
      return points;
    },
  });

  if (held.length === 0) return null;

  const first = data?.[0]?.value ?? 0;
  const last = data?.[data.length - 1]?.value ?? 0;
  const delta = last - first;
  const deltaPct = first > 0 ? (delta / first) * 100 : 0;
  const isUp = delta >= 0;

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-white/40 font-mono">Vývoj hodnoty · {range}</p>
        {data && data.length > 1 && (
          <div className={`text-[11px] font-mono tabular-nums ${isUp ? 'text-[#14F195]' : 'text-red-400'}`}>
            {isUp ? '+' : ''}{formatUsd(delta)} · {isUp ? '+' : ''}{deltaPct.toFixed(2)}%
          </div>
        )}
      </div>

      {/* Time filters */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        {RANGES.map(r => {
          const active = r.id === range;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              aria-pressed={active}
              className={`px-2.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-wide transition-all shrink-0 border ${
                active
                  ? 'bg-[#14F195]/15 border-[#14F195]/40 text-[#14F195]'
                  : 'border-white/[0.08] bg-white/[0.02] text-white/45 hover:text-white/80'
              }`}
            >
              {r.id}
            </button>
          );
        })}
      </div>

      <div className="h-32">
        {isLoading ? (
          <div className="h-full flex items-center justify-center text-white/40 text-xs">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />Načítavam…
          </div>
        ) : isError || !data || data.length < 2 ? (
          <div className="h-full flex items-center justify-center text-white/40 text-xs">
            Nedostatok dát pre graf
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolio-history-gradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={isUp ? '#14F195' : '#f87171'} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={isUp ? '#14F195' : '#f87171'} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.35)' }} interval="preserveStartEnd" />
              <YAxis
                tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.35)' }}
                tickFormatter={v => `$${(v / 1000).toFixed(1)}k`}
                width={44}
              />
              <Tooltip
                contentStyle={{ background: '#0A0A0A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => formatUsd(v)}
                labelStyle={{ color: 'rgba(255,255,255,0.5)' }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={isUp ? '#14F195' : '#f87171'}
                strokeWidth={1.75}
                fill="url(#portfolio-history-gradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
