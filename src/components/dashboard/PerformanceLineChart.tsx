import { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatUsd, type PriceData } from '@/lib/crypto';
import type { PortfolioMetrics, DcaPurchaseRow } from '@/hooks/usePortfolioMetrics';

interface Props { metrics: PortfolioMetrics; prices: PriceData | undefined; }

const RANGES = [
  { id: '1W', days: 7 },
  { id: '1M', days: 30 },
  { id: '3M', days: 90 },
  { id: '6M', days: 180 },
  { id: '1Y', days: 365 },
  { id: 'ALL', days: 99999 },
] as const;

type RangeId = (typeof RANGES)[number]['id'];

interface Point { date: string; portfolio: number; plain: number; }

function buildSeries(rows: DcaPurchaseRow[], currentPrices: PriceData | undefined, rangeDays: number): Point[] {
  if (rows.length === 0) return [];
  const cutoff = Date.now() - rangeDays * 86_400_000;
  const filtered = rows.filter(r => new Date(r.created_at).getTime() >= cutoff);
  if (filtered.length === 0) return [];

  const cBtc = currentPrices?.bitcoin?.usd ?? 0;
  const cEth = currentPrices?.ethereum?.usd ?? 0;
  const cSol = currentPrices?.solana?.usd ?? 0;

  let invested = 0, btc = 0, eth = 0, sol = 0;
  let plainInvested = 0, pBtc = 0, pEth = 0, pSol = 0;
  const points: Point[] = [];
  for (const r of filtered) {
    const total = Number(r.total_amount || 0);
    invested += total;
    btc += Number(r.btc_amount || 0);
    eth += Number(r.eth_amount || 0);
    sol += Number(r.sol_amount || 0);

    // Plain DCA = full capital that week, fixed 64/25/11 split, executed at recorded weekly prices
    plainInvested += total;
    const bp = Number(r.btc_price || 0), ep = Number(r.eth_price || 0), sp = Number(r.sol_price || 0);
    if (bp > 0) pBtc += (total * 0.64) / bp;
    if (ep > 0) pEth += (total * 0.25) / ep;
    if (sp > 0) pSol += (total * 0.11) / sp;

    const portfolioValue = btc * cBtc + eth * cEth + sol * cSol;
    const plainValue = pBtc * cBtc + pEth * cEth + pSol * cSol;
    points.push({
      date: new Date(r.created_at).toISOString().slice(0, 10),
      portfolio: Math.round(portfolioValue),
      plain: Math.round(plainValue),
    });
  }
  return points;
}

export function PerformanceLineChart({ metrics, prices }: Props) {
  const [range, setRange] = useState<RangeId>('3M');
  const days = RANGES.find(r => r.id === range)!.days;
  const data = useMemo(() => buildSeries(metrics.history, prices, days), [metrics.history, prices, days]);

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Výkonnosť · Smart vs Plain DCA</p>
      </div>
      <div className="flex gap-1 mb-2 overflow-x-auto">
        {RANGES.map(r => (
          <button
            key={r.id}
            onClick={() => setRange(r.id)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold flex-shrink-0 ${
              range === r.id ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'
            }`}
          >
            {r.id}
          </button>
        ))}
      </div>
      {data.length < 2 ? (
        <div className="h-40 flex items-center justify-center text-xs text-muted-foreground">
          Príliš málo dát · ulož aspoň 2 týždne nákupov
        </div>
      ) : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={v => `$${(v/1000).toFixed(1)}k`} />
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11 }}
                formatter={(v: number) => formatUsd(v)}
              />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="portfolio" name="Smart DCA" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="plain" name="Plain DCA" stroke="hsl(var(--muted-foreground))" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
