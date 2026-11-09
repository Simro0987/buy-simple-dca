/**
 * Portfolio v2 UI komponenty — CoinStats-inšpirovaný minimalistický redesign.
 * Sekcie: Celková hodnota + PnL, Donut (Core/Yield/Satelity), Zoznam držaní.
 */
import { useTakeProfitRecommendation } from '@/lib/takeProfitRecommendations';
import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Copy, Check, MoreVertical, Plus, Search, X, TrendingUp, TrendingDown, Sparkles, Loader2,
  History, Trash2, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatUsd } from '@/lib/crypto';
import {
  useAddTokenTransaction, useDeleteTokenTransaction, useTokenTransactions,
  type TokenPosition,
} from '@/hooks/useTokenTransactions';
import {
  useAddTrackedToken, type TokenCategory,
} from '@/hooks/useTrackedTokens';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { BASKET_LABELS, BASKET_ORDER, basketOf, type Basket } from '@/lib/assetBaskets';

// ──────────────────────────────────────────────────────────────────────────
// Types shared by page
// ──────────────────────────────────────────────────────────────────────────
export interface HoldingRow {
  key: string;
  coingecko_id: string;
  symbol: string;
  name: string;
  image_url: string | null;
  category: TokenCategory;
  quantity: number;
  price: number;
  value: number;
  costBasis: number;
  pnl: number;
  pnlPct: number;
  /** tracked_tokens.id — only set for user-added rows so they can be removed */
  trackedId?: string;
  /** for BTC/ETH/SOL: RSI value if available (for profit-taking modal) */
  rsi?: number;
  /** 7-day price change %, if available */
  change7d?: number;
  /** „Vybrané zisky“ — historicky realizovaný zisk z tohto aktíva (USD) */
  realizedProfit?: number;
}

// Generic fallback icon shown when the CoinGecko logo fails to load
const FALLBACK_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="20" fill="%23222"/><text x="50%" y="55%" font-family="monospace" font-size="14" fill="white" text-anchor="middle">?</text></svg>'
  );


// ──────────────────────────────────────────────────────────────────────────
// Donut allocation chart (4 koše)
// ──────────────────────────────────────────────────────────────────────────
export type DonutGroup = Basket;

/** Core = BTC + WBTC. Všetko ostatné = Satelity. */
export const CORE_SYMBOLS = ['BTC', 'WBTC', 'WBTC.E'];
export const isCoreSymbol = (symbol: string) => CORE_SYMBOLS.includes(symbol.toUpperCase());

const CAT_META: Record<DonutGroup, { label: string; color: string }> = {
  CORE: { label: BASKET_LABELS.CORE, color: 'hsl(var(--warning))' },
  SATELLITES: { label: BASKET_LABELS.SATELLITES, color: 'hsl(var(--accent))' },
  HIGH_BETA: { label: BASKET_LABELS.HIGH_BETA, color: 'hsl(var(--gain))' },
  PROXY: { label: BASKET_LABELS.PROXY, color: 'hsl(var(--loss))' },
};

export function AllocationDonut({ rows }: { rows: HoldingRow[] }) {
  const groups = useMemo(() => {
    const totals: Record<DonutGroup, number> = { CORE: 0, SATELLITES: 0, HIGH_BETA: 0, PROXY: 0 };
    for (const r of rows) totals[basketOf(r.symbol) ?? 'SATELLITES'] += r.value;
    const sum = BASKET_ORDER.reduce((total, basket) => total + totals[basket], 0);
    return { totals, sum };
  }, [rows]);

  if (groups.sum <= 0) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 text-center">
        <p className="text-sm text-white/40">Zatiaľ žiadne držania na zobrazenie.</p>
      </div>
    );
  }

  const R = 60, C = 2 * Math.PI * R;
  let offset = 0;
  const segs = BASKET_ORDER.map(cat => {
    const pct = groups.totals[cat] / groups.sum;
    const len = pct * C;
    const seg = { cat, pct, len, offset };
    offset += len;
    return seg;
  });

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 flex items-center gap-5">
      <div className="relative shrink-0">
        <svg width="140" height="140" viewBox="0 0 140 140">
          <circle cx="70" cy="70" r={R} fill="none" stroke="hsl(var(--secondary))" strokeWidth="14" />
          {segs.map(s => s.pct > 0 && (
            <circle
              key={s.cat}
              cx="70" cy="70" r={R} fill="none"
              stroke={CAT_META[s.cat].color}
              strokeWidth="14"
              strokeDasharray={`${s.len} ${C}`}
              strokeDashoffset={-s.offset}
              transform="rotate(-90 70 70)"
              strokeLinecap="butt"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] uppercase text-white/40 font-mono">Total</span>
          <span className="text-sm font-bold text-white font-mono">{formatUsd(groups.sum)}</span>
          <span className="text-[10px] font-mono mt-0.5 text-white/45">4 koše</span>
        </div>
      </div>
      <div className="flex-1 space-y-2">
        <p className="text-[10px] font-mono text-white/45">Graf rozloženia</p>
        {BASKET_ORDER.map(cat => {
          const val = groups.totals[cat];
          const pct = groups.sum > 0 ? (val / groups.sum) * 100 : 0;
          return (
            <div key={cat} className="flex items-center gap-2 text-xs">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: CAT_META[cat].color }} />
              <span className="text-white/70 flex-1">{CAT_META[cat].label}</span>
              <span className="font-mono text-white/90">{formatUsd(val)}</span>
              <span className="font-mono text-white/40 w-14 text-right">{pct.toFixed(1)}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Single token row
// ──────────────────────────────────────────────────────────────────────────
export function TokenRow({
  row,
  onAddTx,
  onTakeProfit,
  onRemove,
  onShowHistory,
}: {
  row: HoldingRow;
  onAddTx: (r: HoldingRow) => void;
  onTakeProfit: (r: HoldingRow) => void;
  onRemove?: (r: HoldingRow) => void;
  onShowHistory: (r: HoldingRow) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [imgErr, setImgErr] = useState(false);
  const isGain = row.pnl >= 0;
  const inProfit = row.pnl > 0 && row.costBasis > 0;
  const src = !imgErr && row.image_url ? row.image_url : FALLBACK_LOGO;
  const rsiAlert = typeof row.rsi === 'number' && row.rsi > 70;
  const has7d = typeof row.change7d === 'number' && Number.isFinite(row.change7d);
  const up7d = has7d && (row.change7d as number) >= 0;

  return (
    <div className="relative flex items-center gap-3 py-3 px-3 rounded-xl hover:bg-white/[0.03] transition-colors">
      <div className="relative shrink-0">
        <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/10 overflow-hidden flex items-center justify-center">
          <img
            src={src}
            alt={row.symbol}
            className="w-full h-full object-cover"
            onError={() => setImgErr(true)}
          />
        </div>
        {rsiAlert && (
          <span
            title={`RSI ${row.rsi?.toFixed(0)} — čas vyberať zisk`}
            className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#F7931A] ring-2 ring-[#0A0A0A] animate-pulse"
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-sm font-semibold text-white">{row.symbol}</span>
          {row.category === 'yield' && (
            <span className="text-[9px] font-mono uppercase tracking-wider text-[#14F195] bg-[#14F195]/10 border border-[#14F195]/30 px-1.5 py-0.5 rounded-full">
              Earning
            </span>
          )}
          {rsiAlert && (
            <span className="text-[9px] font-mono uppercase tracking-wider text-[#F7931A] bg-[#F7931A]/10 border border-[#F7931A]/30 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" /> RSI {row.rsi?.toFixed(0)}
            </span>
          )}
        </div>
        <div className="text-[10px] text-white/45 font-mono truncate flex items-center gap-1.5">
          <span>{row.quantity.toFixed(row.quantity < 1 ? 6 : 4)} {row.symbol}</span>
          {has7d && (
            <span className={`font-mono ${up7d ? 'text-[#14F195]' : 'text-red-400'}`}>
              · 7d {up7d ? '+' : ''}{(row.change7d as number).toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      <div className="text-right shrink-0 min-w-0">
        <div className="text-sm font-mono text-white tabular-nums">{formatUsd(row.value)}</div>
        <div className={`text-[10px] font-mono tabular-nums flex items-center justify-end gap-0.5 ${isGain ? 'text-[#14F195]' : 'text-red-400'}`}>
          {isGain ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
          {isGain ? '+' : ''}{formatUsd(row.pnl)} · {isGain ? '+' : ''}{row.pnlPct.toFixed(1)}%
        </div>
        {!!row.realizedProfit && (
          <div className="text-[10px] font-mono tabular-nums text-[#F7931A]" title="Vybrané zisky (realizované)">
            💰 {row.realizedProfit >= 0 ? '+' : ''}{formatUsd(row.realizedProfit)}
          </div>
        )}
      </div>

      <button
        onClick={() => setMenuOpen(v => !v)}
        className="w-8 h-8 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.06] flex items-center justify-center shrink-0"
        aria-label="Menu"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      <AnimatePresence>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="absolute right-2 top-12 z-50 min-w-[200px] rounded-xl border border-white/10 bg-[#0A0A0A] shadow-2xl overflow-hidden"
            >
              <button
                onClick={() => { setMenuOpen(false); onAddTx(row); }}
                className="w-full text-left px-3 py-2.5 text-xs text-white/90 hover:bg-white/[0.06] transition-colors flex items-center gap-1.5"
              >
                <Plus className="w-3 h-3" /> Pridať transakciu
              </button>
              <button
                onClick={() => { setMenuOpen(false); onShowHistory(row); }}
                className="w-full text-left px-3 py-2.5 text-xs text-white/90 hover:bg-white/[0.06] transition-colors border-t border-white/[0.06] flex items-center gap-1.5"
              >
                <History className="w-3 h-3" /> Zobraziť históriu
              </button>
              {inProfit && (
                <button
                  onClick={() => { setMenuOpen(false); onTakeProfit(row); }}
                  className="w-full text-left px-3 py-2.5 text-xs text-[#14F195] hover:bg-white/[0.06] transition-colors border-t border-white/[0.06] flex items-center gap-1.5"
                >
                  <Sparkles className="w-3 h-3" />
                  Vybrať zisk
                </button>
              )}
              {onRemove && (
                <button
                  onClick={() => { setMenuOpen(false); onRemove(row); }}
                  className="w-full text-left px-3 py-2.5 text-xs text-red-400 hover:bg-white/[0.06] transition-colors border-t border-white/[0.06] flex items-center gap-1.5"
                >
                  <Trash2 className="w-3 h-3" /> Odstrániť token
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Transaction history modal
// ──────────────────────────────────────────────────────────────────────────
export function HistoryModal({ row, onClose }: { row: HoldingRow; onClose: () => void }) {
  const { data: txs = [], isLoading } = useTokenTransactions();
  const del = useDeleteTokenTransaction();
  const list = useMemo(
    () =>
      txs
        .filter(t => t.coingecko_id === row.coingecko_id)
        .sort((a, b) => new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime()),
    [txs, row.coingecko_id],
  );

  const handleDelete = async (id: string) => {
    try {
      await del.mutateAsync(id);
      toast.success('Transakcia zmazaná');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <ModalShell onClose={onClose} title={`História · ${row.symbol}`}>
      {isLoading ? (
        <div className="py-8 text-center text-white/40 text-xs">
          <Loader2 className="w-4 h-4 animate-spin inline mr-2" />Načítavam…
        </div>
      ) : list.length === 0 ? (
        <div className="py-8 text-center text-white/40 text-xs">
          Zatiaľ žiadne manuálne transakcie pre {row.symbol}.
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto space-y-1.5 -mx-1 px-1">
          {list.map(tx => {
            const isBuy = tx.side === 'buy';
            const qty = Number(tx.quantity);
            const price = Number(tx.price_usd);
            const total = qty * price;
            return (
              <div
                key={tx.id}
                className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-white/[0.03] border border-white/[0.05]"
              >
                <span
                  className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${
                    isBuy
                      ? 'text-[#14F195] bg-[#14F195]/10 border border-[#14F195]/30'
                      : 'text-red-400 bg-red-500/10 border border-red-500/30'
                  }`}
                >
                  {isBuy ? 'Nákup' : 'Predaj'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-mono text-white tabular-nums truncate">
                    {qty.toFixed(qty < 1 ? 6 : 4)} @ {formatUsd(price)}
                  </div>
                  <div className="text-[9px] text-white/40 font-mono">
                    {new Date(tx.executed_at).toLocaleString('sk-SK', {
                      day: '2-digit', month: '2-digit', year: 'numeric',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] font-mono text-white/90 tabular-nums">{formatUsd(total)}</div>
                </div>
                <button
                  onClick={() => handleDelete(tx.id)}
                  disabled={del.isPending}
                  className="w-7 h-7 rounded-md text-white/40 hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center disabled:opacity-30"
                  aria-label="Zmazať"
                  title="Zmazať transakciu"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </ModalShell>
  );
}


// ──────────────────────────────────────────────────────────────────────────
// Add asset modal — CoinGecko search
// ──────────────────────────────────────────────────────────────────────────
interface CgHit {
  id: string;
  symbol: string;
  name: string;
  thumb?: string;
  large?: string;
}

const ADD_ASSET_CATEGORIES = (['core', 'satellite'] as const)
  .map(value => {
    const meta = CAT_META[value];
    return meta ? { value, ...meta } : undefined;
  })
  .filter((item): item is NonNullable<typeof item> => item !== undefined);

function isCgHit(item: unknown): item is CgHit {
  if (!item || typeof item !== 'object') return false;
  const candidate = item as Partial<CgHit>;
  return typeof candidate.id === 'string'
    && typeof candidate.symbol === 'string'
    && typeof candidate.name === 'string';
}

export function AddAssetModal({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CgHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<CgHit | null>(null);
  const [category, setCategory] = useState<TokenCategory>('satellite');
  const add = useAddTrackedToken();

  const search = async (term: string) => {
    if (!term.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(term)}`);
      if (!r.ok) throw new Error('CoinGecko chyba');
      const j: unknown = await r.json();
      const coins = j && typeof j === 'object' && 'coins' in j
        ? (j as { coins?: unknown }).coins
        : [];
      setResults((Array.isArray(coins) ? coins : []).filter(isCgHit).slice(0, 15));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!picked) return;
    try {
      await add.mutateAsync({
        coingecko_id: picked.id,
        symbol: picked.symbol,
        name: picked.name,
        image_url: picked.large || picked.thumb || null,
        category,
      });
      toast.success(`${picked.symbol.toUpperCase()} pridané do ${CAT_META[category]?.label ?? category}`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Pridať aktívum">
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            autoFocus
            value={q}
            onChange={e => { setQ(e.target.value); void search(e.target.value); }}
            placeholder="Hľadať token (napr. Pepe, Chainlink…)"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-white/[0.05] border border-white/10 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
          />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1">
          {loading && <div className="p-4 text-center text-white/40 text-xs"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />Hľadám…</div>}
          {!loading && q && results.length === 0 && <div className="p-4 text-center text-white/40 text-xs">Žiadny výsledok</div>}
          {results.filter((hit): hit is CgHit => hit !== undefined).map(hit => (
            <button
              key={hit?.id}
              onClick={() => setPicked(hit)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors ${
                picked?.id === hit?.id ? 'bg-white/[0.08] border border-white/20' : 'hover:bg-white/[0.04] border border-transparent'
              }`}
            >
              {hit?.thumb && <img src={hit.thumb} alt="" className="w-6 h-6 rounded-full" />}
              <div className="flex-1 min-w-0">
                <div className="text-sm text-white truncate">{hit?.name ?? hit?.symbol ?? 'Neznáme aktívum'}</div>
                <div className="text-[10px] text-white/40 uppercase font-mono">{hit?.symbol ?? '—'}</div>
              </div>
              {picked?.id === hit?.id && <Check className="w-4 h-4 text-[#14F195]" />}
            </button>
          ))}
        </div>

        {picked && (
          <div className="pt-2 border-t border-white/[0.06] space-y-2">
            <label className="text-[10px] uppercase text-white/40 font-mono">Kategória</label>
            <div className="grid grid-cols-2 gap-1.5">
              {ADD_ASSET_CATEGORIES.filter(item => item !== undefined).map(item => (
                <button
                  key={item.value}
                  onClick={() => setCategory(item.value)}
                  className={`text-xs py-2 rounded-lg border transition-colors ${
                    category === item.value
                      ? 'text-white border-white/40 bg-white/[0.08]'
                      : 'text-white/50 border-white/10 hover:border-white/25'
                  }`}
                  style={category === item.value ? { borderColor: `${item.color}80` } : undefined}
                >
                  {item?.label ?? item?.value ?? 'Kategória'}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!picked || add.isPending}
          className="w-full mt-2 py-2.5 rounded-lg bg-white text-black text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {add.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Pridať do portfólia
        </button>
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Add transaction modal
// ──────────────────────────────────────────────────────────────────────────
export function AddTransactionModal({ row, onClose }: { row: HoldingRow; onClose: () => void }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [qty, setQty] = useState('');
  const [price, setPrice] = useState(row.price ? row.price.toString() : '');
  const add = useAddTokenTransaction();
  const qc = useQueryClient();

  const isCoreDcaCoin = ['bitcoin', 'ethereum', 'solana'].includes(row.coingecko_id);

  const submit = async () => {
    const q = Number(qty), p = Number(price);
    if (!q || q <= 0) return toast.error('Zadaj množstvo');
    if (!p || p <= 0) return toast.error('Zadaj cenu');
    try {
      await add.mutateAsync({
        coingecko_id: row.coingecko_id,
        symbol: row.symbol,
        side,
        quantity: q,
        price_usd: p,
        note: 'manual entry',
      });
      qc.invalidateQueries({ queryKey: ['token_transactions'] });
      toast.success(`${side === 'buy' ? 'Nákup' : 'Predaj'} uložený do portfólia`);
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <ModalShell onClose={onClose} title={`Transakcia · ${row.symbol}`}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1.5">
          {(['buy', 'sell'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`py-2 rounded-lg text-xs font-semibold uppercase transition-colors border ${
                side === s
                  ? s === 'buy' ? 'bg-[#14F195]/15 text-[#14F195] border-[#14F195]/50' : 'bg-red-500/15 text-red-400 border-red-500/50'
                  : 'text-white/40 border-white/10 hover:border-white/25'
              }`}
            >
              {s === 'buy' ? 'Nákup' : 'Predaj'}
            </button>
          ))}
        </div>

        <Field label="Počet kusov">
          <input
            type="number" step="any" value={qty} onChange={e => setQty(e.target.value)}
            className="w-full py-2 px-3 rounded-lg bg-white/[0.05] border border-white/10 text-sm text-white focus:border-white/30 focus:outline-none"
          />
        </Field>
        <Field label="Cena za kus (USD)">
          <input
            type="number" step="any" value={price} onChange={e => setPrice(e.target.value)}
            className="w-full py-2 px-3 rounded-lg bg-white/[0.05] border border-white/10 text-sm text-white focus:border-white/30 focus:outline-none"
          />
        </Field>

        {qty && price && (
          <div className="text-xs text-white/50 font-mono">
            Celkom: <span className="text-white">{formatUsd(Number(qty) * Number(price))}</span>
          </div>
        )}

        <button
          onClick={submit}
          disabled={add.isPending}
          className="w-full py-2.5 rounded-lg bg-white text-black text-sm font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {add.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
          Uložiť
        </button>
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Profit-taking modal — mirrors the main Portfolio card (single source of truth)
// ──────────────────────────────────────────────────────────────────────────
export function ProfitTakingModal({ row, onClose }: { row: HoldingRow; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const rec = useTakeProfitRecommendation(row.symbol);
  const sk2 = (n: number, d = 2) => n.toFixed(d).replace('.', ',');
  const pnlUsd = rec?.pnlUsd ?? row.pnl;
  const pnlPct = rec ? rec.pnlPct : row.pnlPct;
  const sellQty = rec?.sellQty ?? 0;
  const sellUsd = rec?.sellUsd ?? 0;
  const price = rec?.price ?? row.price;
  const pnlCls = pnlUsd >= 0 ? 'text-[#14F195]' : 'text-red-400';

  const copy = async () => {
    await navigator.clipboard.writeText(sellQty.toFixed(6));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success('Skopírované');
  };

  return (
    <ModalShell onClose={onClose} title={`Vybrať zisk · ${row.symbol}`}>
      <div className="space-y-3">
        <div className="rounded-lg bg-white/[0.04] p-3 space-y-1">
          <Line label="Zisk (USD)" value={`${pnlUsd >= 0 ? '+' : '-'}$${sk2(Math.abs(pnlUsd))}`} valueClass={pnlCls} />
          <Line label="Zisk (%)" value={pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${sk2(pnlPct)} %` : '—'} valueClass={pnlCls} />
          <Line label="Odporúčanie karty" value={rec ? rec.label : 'Načítavam...'} valueClass={rec ? 'text-white' : 'text-amber-300'} />
        </div>

        {!rec ? (
          <div className="text-xs text-amber-300 leading-relaxed">Načítavam odporúčanie z karty portfólia...</div>
        ) : sellQty <= 0 ? (
          <div className="text-xs text-white/50 leading-relaxed">
            Odporúčaný predaj: <span className="font-mono text-white">0 {row.symbol}</span> — rovnako ako na karte portfólia.
          </div>
        ) : (
          <div className="rounded-lg border border-[#F7931A]/30 bg-[#F7931A]/[0.05] p-3 space-y-2">
            <div className="text-[10px] uppercase text-[#F7931A] font-mono tracking-wider">
              → Smerovať do: {rec.destination}
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-mono font-bold text-white tabular-nums">
                {sk2(sellQty, 6)} {row.symbol}
              </span>
              <button
                onClick={copy}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-white/15 text-white/70 hover:text-white text-[11px]"
              >
                {copied ? <Check className="w-3 h-3 text-[#14F195]" /> : <Copy className="w-3 h-3" />}
                {copied ? 'OK' : 'Kopírovať'}
              </button>
            </div>
            <div className="text-[10px] text-white/50 font-mono">
              ≈ ${sk2(sellUsd)} @ ${sk2(price, price >= 1000 ? 2 : 3)}
            </div>
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Shared modal shell
// ──────────────────────────────────────────────────────────────────────────
function ModalShell({
  children, onClose, title,
}: {
  children: React.ReactNode; onClose: () => void; title: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-3"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0A0A0A] p-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <button onClick={onClose} className="w-7 h-7 rounded-lg text-white/50 hover:bg-white/[0.06] flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase text-white/40 font-mono block mb-1">{label}</label>
      {children}
    </div>
  );
}

function Line({ label, value, valueClass = 'text-white' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-white/50">{label}</span>
      <span className={`font-mono ${valueClass}`}>{value}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Add-asset trigger button
// ──────────────────────────────────────────────────────────────────────────
export function AddAssetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-2.5 rounded-xl border border-white/15 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-sm font-semibold text-white flex items-center justify-center gap-1.5"
    >
      <Plus className="w-4 h-4" />
      Pridať aktívum
    </button>
  );
}

export { CAT_META };
export type { TokenPosition };

// ──────────────────────────────────────────────────────────────────────────
// Potvrdenie odstránenia tokenu
// ──────────────────────────────────────────────────────────────────────────
export function RemoveTokenModal({
  row, onCancel, onConfirm,
}: {
  row: HoldingRow;
  onCancel: () => void;
  onConfirm: (r: HoldingRow) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#0A0A0A] p-5 space-y-3"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h3 className="text-sm font-bold text-white">Odstrániť token</h3>
        </div>
        <p className="text-xs text-white/70 leading-relaxed">
          Naozaj chcete odstrániť <span className="font-mono text-white">{row.symbol}</span> z portfólia?
        </p>
        <p className="text-[10px] font-mono text-white/40 leading-relaxed">
          Token sa iba skryje zo zoznamu. Už vybrané zisky ({formatUsd(row.realizedProfit ?? 0)})
          zostávajú zachované v globálnej metrike „Vybrané zisky“.
        </p>
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 rounded-xl text-xs font-semibold border border-white/10 bg-white/[0.04] text-white/80"
          >
            Zrušiť
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onConfirm(row); } finally { setBusy(false); } }}
            className="flex-1 py-2 rounded-xl text-xs font-semibold border border-red-500/40 bg-red-500/15 text-red-300 disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
          >
            {busy && <Loader2 className="w-3 h-3 animate-spin" />} Odstrániť
          </button>
        </div>
      </motion.div>
    </div>
  );
}
