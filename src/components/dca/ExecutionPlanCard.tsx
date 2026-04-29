import { useMemo, useState } from 'react';
import { Copy, ExternalLink, CheckCircle2, Save, Calendar, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { TOKENS, formatUsd, formatPrice, calculateDCA, type PriceData } from '@/lib/crypto';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface Props {
  prices: PriceData | undefined;
  weeklyCapital: number;
  regime?: string;
  score?: number;
}

const HL_LINKS: Record<string, string> = {
  BTC: 'https://app.hyperliquid.xyz/trade/BTC',
  ETH: 'https://app.hyperliquid.xyz/trade/ETH',
  SOL: 'https://app.hyperliquid.xyz/trade/SOL',
};

const CHECKLIST_KEY = 'execution-plan-checks';

function loadChecks(): Record<string, boolean> {
  try { return JSON.parse(localStorage.getItem(CHECKLIST_KEY) || '{}'); }
  catch { return {}; }
}

function getMondayWeek(d = new Date()): { iso: string; week: number } {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { iso: d.toISOString().slice(0, 10), week };
}

export function ExecutionPlanCard({ prices, weeklyCapital, regime, score }: Props) {
  const qc = useQueryClient();
  const [checks, setChecks] = useState<Record<string, boolean>>(loadChecks);
  const [saving, setSaving] = useState(false);

  const dca = useMemo(() => prices ? calculateDCA(weeklyCapital, prices) : [], [prices, weeklyCapital]);
  const { iso, week } = getMondayWeek();

  // Fetch limit orders for tracker
  const { data: limitOrders } = useQuery({
    queryKey: ['limit_orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('limit_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const setCheck = (k: string, v: boolean) => {
    const next = { ...checks, [k]: v };
    setChecks(next);
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
  };

  const copy = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success('Skopírované');
  };

  const saveWeek = async () => {
    if (!prices || dca.length === 0 || weeklyCapital <= 0) {
      toast.error('Nastav najprv týždenný kapitál');
      return;
    }
    setSaving(true);
    try {
      const totals = dca.reduce((acc, r) => {
        const k = r.token.id;
        acc[`${k}_amount`] = (acc[`${k}_amount`] || 0) + r.marketQuantity + r.limitQuantity;
        acc[`${k}_price`] = r.currentPrice;
        return acc;
      }, {} as Record<string, number>);

      const { error: pErr } = await supabase.from('dca_purchases').insert({
        week_number: week,
        total_amount: weeklyCapital,
        market_amount: weeklyCapital * 0.6,
        limit_amount: weeklyCapital * 0.4,
        btc_amount: totals.btc_amount || 0,
        eth_amount: totals.eth_amount || 0,
        sol_amount: totals.sol_amount || 0,
        btc_price: totals.btc_price || 0,
        eth_price: totals.eth_price || 0,
        sol_price: totals.sol_price || 0,
        regime: regime || null,
        score: score || null,
        notes: 'Execution plan',
      });
      if (pErr) throw pErr;

      // Insert limit orders
      const limitInserts = dca.map(r => ({
        week_number: week,
        coin: r.token.symbol,
        amount_usd: r.limitUsd,
        limit_price: r.limitPrice,
        status: 'PENDING',
      }));
      await supabase.from('limit_orders').insert(limitInserts);

      // Reset checklist
      setChecks({});
      localStorage.removeItem(CHECKLIST_KEY);

      qc.invalidateQueries({ queryKey: ['dca_purchases'] });
      qc.invalidateQueries({ queryKey: ['limit_orders'] });
      toast.success(`Týždeň ${week} uložený do histórie ✓`);
    } catch (e) {
      toast.error('Chyba pri ukladaní: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // Limit order metrics
  const last12 = (limitOrders ?? []).slice(0, 36);
  const filled = last12.filter(o => o.status === 'FILLED').length;
  const fillRate = last12.length > 0 ? (filled / last12.length) * 100 : 0;
  const totalSaved = last12
    .filter(o => o.status === 'FILLED')
    .reduce((s, o) => s + Number(o.amount_usd) * 0.04, 0);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="glass-card p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-bold text-foreground">🎯 Execution Plan</h2>
          </div>
          <div className="flex items-center gap-1.5">
            {regime && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">{regime}</span>}
            {typeof score === 'number' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded border border-border bg-secondary text-foreground">Skóre {score}</span>}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">Pondelok {iso} · Týždeň {week} · Kapitál {formatUsd(weeklyCapital)}</p>
      </div>

      {/* Market orders */}
      <div className="glass-card p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Market objednávky (60%)</p>
        {dca.map(r => (
          <div key={`m-${r.token.id}`} className="flex items-center gap-2 bg-secondary/40 rounded-lg p-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0" style={{ backgroundColor: r.token.color + '20', color: r.token.color }}>{r.token.symbol}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground tabular-nums">{formatUsd(r.marketUsd)}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">~{r.marketQuantity.toFixed(r.token.id === 'btc' ? 8 : 4)} {r.token.symbol}</p>
            </div>
            <button onClick={() => copy(`Market BUY ${r.token.symbol} $${r.marketUsd.toFixed(2)}`)} className="p-1.5 rounded bg-secondary text-muted-foreground"><Copy className="w-3.5 h-3.5" /></button>
            <a href={HL_LINKS[r.token.symbol]} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-primary/10 text-primary"><ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
        ))}
      </div>

      {/* Limit orders */}
      <div className="glass-card p-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Limit objednávky (40%, -4 % až -5 %)</p>
        {dca.map(r => (
          <div key={`l-${r.token.id}`} className="flex items-center gap-2 bg-secondary/40 rounded-lg p-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0" style={{ backgroundColor: r.token.color + '20', color: r.token.color }}>{r.token.symbol}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-foreground tabular-nums">{formatUsd(r.limitUsd)} @ {formatPrice(r.limitPrice)}</p>
              <p className="text-[10px] text-muted-foreground tabular-nums">~{r.limitQuantity.toFixed(r.token.id === 'btc' ? 8 : 4)} {r.token.symbol}</p>
            </div>
            <button onClick={() => copy(`Limit BUY ${r.token.symbol} $${r.limitUsd.toFixed(2)} @ $${r.limitPrice.toFixed(2)}`)} className="p-1.5 rounded bg-secondary text-muted-foreground"><Copy className="w-3.5 h-3.5" /></button>
            <a href={HL_LINKS[r.token.symbol]} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-primary/10 text-primary"><ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
        ))}
      </div>

      {/* Checklist */}
      <div className="glass-card p-3 space-y-1.5">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">Interaktívny checklist</p>
        {[
          { id: 'cancel', label: 'Zruš nesplnené limity z minulého týždňa' },
          { id: 'market', label: 'Zadaj 3 market objednávky (BTC/ETH/SOL)' },
          { id: 'limit', label: 'Zadaj 3 limit objednávky (-4 % od trhu)' },
          { id: 'withdraw', label: 'Vyber BTC do Taproot peňaženky (ak nad limit)' },
          { id: 'save', label: 'Ulož týždeň do histórie' },
        ].map(it => (
          <label key={it.id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-secondary/40">
            <input type="checkbox" checked={!!checks[it.id]} onChange={e => setCheck(it.id, e.target.checked)} className="w-4 h-4 accent-primary" />
            <span className={`text-xs ${checks[it.id] ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{it.label}</span>
          </label>
        ))}
      </div>

      {/* Limit order tracker */}
      <div className="glass-card p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-primary" />
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Limit order tracker</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-secondary/40 rounded p-2">
            <p className="text-[9px] uppercase text-muted-foreground">Fill rate</p>
            <p className="text-sm font-bold text-foreground tabular-nums">{fillRate.toFixed(0)}%</p>
          </div>
          <div className="bg-secondary/40 rounded p-2">
            <p className="text-[9px] uppercase text-muted-foreground">Ušetrené</p>
            <p className="text-sm font-bold text-gain tabular-nums">{formatUsd(totalSaved)}</p>
          </div>
          <div className="bg-secondary/40 rounded p-2">
            <p className="text-[9px] uppercase text-muted-foreground">Spolu</p>
            <p className="text-sm font-bold text-foreground tabular-nums">{last12.length}</p>
          </div>
        </div>
        {last12.slice(0, 5).length > 0 && (
          <div className="space-y-1">
            {last12.slice(0, 5).map((o: any) => {
              const days = Math.floor((Date.now() - new Date(o.created_at).getTime()) / 86400000);
              const statusColor = o.status === 'FILLED' ? 'text-gain' : o.status === 'CANCELLED' ? 'text-muted-foreground' : 'text-warning';
              return (
                <div key={o.id} className="flex items-center justify-between text-[11px] bg-secondary/30 rounded px-2 py-1">
                  <span className="font-mono text-foreground">{o.coin}</span>
                  <span className="tabular-nums text-muted-foreground">${Number(o.amount_usd).toFixed(0)} @ ${Number(o.limit_price).toFixed(2)}</span>
                  <span className={`font-semibold ${statusColor}`}>{o.status}</span>
                  <span className="text-muted-foreground tabular-nums">{days}d</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save week */}
      <button
        onClick={saveWeek}
        disabled={saving || weeklyCapital <= 0}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gain text-background font-semibold text-sm active:scale-[0.98] disabled:opacity-50"
      >
        {saving ? <Save className="w-4 h-4 animate-pulse" /> : <CheckCircle2 className="w-4 h-4" />}
        {saving ? 'Ukladám…' : '✅ Ulož týždeň do histórie'}
      </button>
      <p className="text-[10px] text-center text-muted-foreground">ETA ~5 min · Ďalší DCA: pondelok</p>
    </div>
  );
}
