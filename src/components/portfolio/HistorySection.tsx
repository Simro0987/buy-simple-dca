import { useMemo, useState } from 'react';
import { Download, FileText, Filter, ChevronDown, ChevronRight } from 'lucide-react';
import { TOKENS, formatUsd } from '@/lib/crypto';
import { usePortfolioMetrics } from '@/hooks/usePortfolioMetrics';
import { usePrices } from '@/hooks/usePrices';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type CoinFilter = 'ALL' | 'BTC' | 'ETH' | 'SOL';
type SortDir = 'newest' | 'oldest';

export function HistorySection() {
  const { data: prices } = usePrices();
  const metrics = usePortfolioMetrics(prices);
  const [coin, setCoin] = useState<CoinFilter>('ALL');
  const [year, setYear] = useState<string>('ALL');
  const [sort, setSort] = useState<SortDir>('newest');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: weeklyScores } = useQuery({
    queryKey: ['weekly_scores_history'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_scores')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });
  const scoresByWeek = useMemo(() => {
    const m = new Map<number, any>();
    (weeklyScores ?? []).forEach((s: any) => {
      if (!m.has(s.week_number)) m.set(s.week_number, s);
    });
    return m;
  }, [weeklyScores]);

  const years = useMemo(() => {
    const ys = new Set(metrics.history.map(r => new Date(r.created_at).getUTCFullYear().toString()));
    return ['ALL', ...Array.from(ys).sort().reverse()];
  }, [metrics.history]);

  const filtered = useMemo(() => {
    let rows = metrics.history.slice();
    if (year !== 'ALL') rows = rows.filter(r => new Date(r.created_at).getUTCFullYear().toString() === year);
    if (coin !== 'ALL') {
      const k = coin.toLowerCase() as 'btc' | 'eth' | 'sol';
      rows = rows.filter(r => Number(r[`${k}_amount`]) > 0);
    }
    rows.sort((a, b) =>
      sort === 'newest'
        ? +new Date(b.created_at) - +new Date(a.created_at)
        : +new Date(a.created_at) - +new Date(b.created_at)
    );
    return rows;
  }, [metrics.history, coin, year, sort]);

  // Stats
  const stats = useMemo(() => {
    const rows = metrics.history;
    if (rows.length === 0) return null;
    const totalInvested = rows.reduce((s, r) => s + Number(r.total_amount || 0), 0);
    const sums = { btc: { qty: 0, usd: 0 }, eth: { qty: 0, usd: 0 }, sol: { qty: 0, usd: 0 } };
    for (const r of rows) {
      sums.btc.qty += Number(r.btc_amount); sums.btc.usd += Number(r.btc_amount) * Number(r.btc_price);
      sums.eth.qty += Number(r.eth_amount); sums.eth.usd += Number(r.eth_amount) * Number(r.eth_price);
      sums.sol.qty += Number(r.sol_amount); sums.sol.usd += Number(r.sol_amount) * Number(r.sol_price);
    }
    const avg = (s: { qty: number; usd: number }) => s.qty > 0 ? s.usd / s.qty : 0;
    const sortedByDate = rows.slice().sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const first = sortedByDate[0];
    const totals = rows.map(r => Number(r.total_amount));
    const best = Math.max(...totals);
    const worst = Math.min(...totals);
    return {
      totalInvested,
      count: rows.length,
      avgBtc: avg(sums.btc), avgEth: avg(sums.eth), avgSol: avg(sums.sol),
      first: first?.created_at,
      best, worst,
    };
  }, [metrics.history]);

  // Avg cost basis chart
  const chartData = useMemo(() => {
    const rows = metrics.history.slice().sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at));
    const cumul = { btc: { qty: 0, usd: 0 }, eth: { qty: 0, usd: 0 }, sol: { qty: 0, usd: 0 } };
    return rows.map(r => {
      cumul.btc.qty += Number(r.btc_amount); cumul.btc.usd += Number(r.btc_amount) * Number(r.btc_price);
      cumul.eth.qty += Number(r.eth_amount); cumul.eth.usd += Number(r.eth_amount) * Number(r.eth_price);
      cumul.sol.qty += Number(r.sol_amount); cumul.sol.usd += Number(r.sol_amount) * Number(r.sol_price);
      return {
        date: new Date(r.created_at).toLocaleDateString('sk', { month: 'short', day: 'numeric' }),
        BTC: cumul.btc.qty > 0 ? cumul.btc.usd / cumul.btc.qty : 0,
        ETH: cumul.eth.qty > 0 ? cumul.eth.usd / cumul.eth.qty : 0,
        SOL: cumul.sol.qty > 0 ? cumul.sol.usd / cumul.sol.qty : 0,
      };
    });
  }, [metrics.history]);

  const exportCsv = () => {
    const header = ['Date', 'Total USD', 'BTC qty', 'ETH qty', 'SOL qty', 'BTC price', 'ETH price', 'SOL price', 'Market', 'Limit', 'Regime', 'Score'];
    const rows = filtered.map(r => [
      new Date(r.created_at).toISOString().slice(0, 10),
      r.total_amount, r.btc_amount, r.eth_amount, r.sol_amount,
      r.btc_price, r.eth_price, r.sol_price,
      r.market_amount, r.limit_amount,
      (r as any).regime ?? '', (r as any).score ?? '',
    ]);
    const csv = [header, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `dca-history-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV stiahnutý');
  };

  const exportPdf = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const html = `<html><head><title>DCA História</title><style>body{font-family:sans-serif;padding:20px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:right;font-size:11px}th{background:#eee}</style></head><body><h1>DCA História</h1><table><thead><tr><th>Dátum</th><th>USD</th><th>BTC</th><th>ETH</th><th>SOL</th><th>BTC $</th><th>ETH $</th><th>SOL $</th></tr></thead><tbody>${filtered.map(r => `<tr><td>${new Date(r.created_at).toLocaleDateString('sk')}</td><td>$${Number(r.total_amount).toFixed(0)}</td><td>${Number(r.btc_amount).toFixed(6)}</td><td>${Number(r.eth_amount).toFixed(4)}</td><td>${Number(r.sol_amount).toFixed(2)}</td><td>$${Number(r.btc_price).toFixed(0)}</td><td>$${Number(r.eth_price).toFixed(0)}</td><td>$${Number(r.sol_price).toFixed(2)}</td></tr>`).join('')}</tbody></table></body></html>`;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  return (
    <div className="space-y-3">
      <div className="glass-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-primary" />
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">História nákupov</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['ALL', 'BTC', 'ETH', 'SOL'] as CoinFilter[]).map(c => (
            <button key={c} onClick={() => setCoin(c)} className={`px-2 py-1 rounded text-[10px] font-semibold ${coin === c ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{c}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {years.map(y => (
            <button key={y} onClick={() => setYear(y)} className={`px-2 py-1 rounded text-[10px] font-semibold ${year === y ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>{y}</button>
          ))}
          <button onClick={() => setSort(sort === 'newest' ? 'oldest' : 'newest')} className="px-2 py-1 rounded text-[10px] font-semibold bg-secondary text-muted-foreground">{sort === 'newest' ? '↓ Najnovšie' : '↑ Najstaršie'}</button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card p-2 overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-center text-muted-foreground py-6">Zatiaľ žiadne nákupy</p>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border">
                <th className="text-left p-1">Dátum</th>
                <th className="text-right p-1">USD</th>
                <th className="text-right p-1">BTC</th>
                <th className="text-right p-1">ETH</th>
                <th className="text-right p-1">SOL</th>
                <th className="text-right p-1">Reg.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="border-b border-border/40">
                  <td className="p-1 text-foreground">{new Date(r.created_at).toLocaleDateString('sk', { month: 'numeric', day: 'numeric' })}</td>
                  <td className="p-1 text-right tabular-nums text-foreground">${Number(r.total_amount).toFixed(0)}</td>
                  <td className="p-1 text-right tabular-nums text-muted-foreground">{Number(r.btc_amount).toFixed(5)}</td>
                  <td className="p-1 text-right tabular-nums text-muted-foreground">{Number(r.eth_amount).toFixed(3)}</td>
                  <td className="p-1 text-right tabular-nums text-muted-foreground">{Number(r.sol_amount).toFixed(2)}</td>
                  <td className="p-1 text-right text-muted-foreground">{(r as any).regime?.slice(0, 4) || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Stats */}
      {stats && (
        <div className="glass-card p-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Štatistiky</p>
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Celkom investované" value={formatUsd(stats.totalInvested)} />
            <Stat label="Počet nákupov" value={stats.count.toString()} />
            <Stat label="Ø cena BTC" value={stats.avgBtc > 0 ? formatUsd(stats.avgBtc) : '–'} />
            <Stat label="Ø cena ETH" value={stats.avgEth > 0 ? formatUsd(stats.avgEth) : '–'} />
            <Stat label="Ø cena SOL" value={stats.avgSol > 0 ? formatUsd(stats.avgSol) : '–'} />
            <Stat label="Najlepší týždeň" value={formatUsd(stats.best)} />
            <Stat label="Najmenší týždeň" value={formatUsd(stats.worst)} />
            <Stat label="Prvý nákup" value={stats.first ? new Date(stats.first).toLocaleDateString('sk') : '–'} />
          </div>
        </div>
      )}

      {/* Avg cost basis chart */}
      {chartData.length > 1 && (
        <div className="glass-card p-3">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-2">Ø cost basis (USD)</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} width={45} />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', fontSize: 11 }} />
              <Line type="monotone" dataKey="BTC" stroke="#F7931A" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="ETH" stroke="#627EEA" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="SOL" stroke="#9945FF" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Exports */}
      <div className="grid grid-cols-2 gap-2">
        <button onClick={exportCsv} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-secondary text-foreground text-xs font-semibold"><Download className="w-3.5 h-3.5" /> CSV</button>
        <button onClick={exportPdf} className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-secondary text-foreground text-xs font-semibold"><FileText className="w-3.5 h-3.5" /> PDF</button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/40 rounded p-2">
      <p className="text-[9px] uppercase text-muted-foreground">{label}</p>
      <p className="text-xs font-bold text-foreground tabular-nums mt-0.5">{value}</p>
    </div>
  );
}
