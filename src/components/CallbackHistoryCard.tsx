import { useEffect, useState, useCallback, useMemo } from 'react';
import { History, RefreshCw, CheckCircle2, PauseCircle, XCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Lang } from '@/lib/i18n';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface CallbackEntry {
  id: string;
  created_at: string;
  callback_data: string;
  action_type: string;
  token: string | null;
  profit_pct: number | null;
  status: string;
}

interface Props {
  lang: Lang;
}

const ACTION_LABELS: Record<string, { sk: string; en: string; emoji: string }> = {
  profit_sell: { sk: 'Predaj zisku', en: 'Sell profit', emoji: '💰' },
  profit_postpone: { sk: 'Odložený zisk', en: 'Postponed profit', emoji: '⏸️' },
  profit_ignore: { sk: 'Ignorovaný zisk', en: 'Ignored profit', emoji: '❌' },
  dca_execute: { sk: 'DCA vykonané', en: 'DCA executed', emoji: '🔁' },
  dca_postpone: { sk: 'DCA odložené', en: 'DCA postponed', emoji: '⏸️' },
  dca_ignore: { sk: 'DCA preskočené', en: 'DCA skipped', emoji: '❌' },
  news_analyze: { sk: 'Analýza novín', en: 'News analysis', emoji: '📊' },
  news_mute: { sk: 'Stíšené noviny', en: 'News muted', emoji: '🔕' },
  news_ignore: { sk: 'Ignorované noviny', en: 'News ignored', emoji: '❌' },
  price_buy: { sk: 'Cenový nákup', en: 'Price buy', emoji: '🛒' },
  price_postpone: { sk: 'Cenový alert odložený', en: 'Price postponed', emoji: '⏸️' },
  price_ignore: { sk: 'Cenový alert ignorovaný', en: 'Price ignored', emoji: '❌' },
  rebalance_execute: { sk: 'Rebalancing vykonaný', en: 'Rebalance executed', emoji: '⚖️' },
  rebalance_postpone: { sk: 'Rebalancing odložený', en: 'Rebalance postponed', emoji: '⏸️' },
  rebalance_ignore: { sk: 'Rebalancing ignorovaný', en: 'Rebalance ignored', emoji: '❌' },
  staking_execute: { sk: 'Konverzia výnosu', en: 'Yield conversion', emoji: '🥩' },
  staking_postpone: { sk: 'Konverzia odložená', en: 'Conversion postponed', emoji: '⏸️' },
  staking_ignore: { sk: 'Konverzia ignorovaná', en: 'Conversion ignored', emoji: '❌' },
  missed_increase_budget: { sk: 'Zvýšiť rozpočet', en: 'Increase budget', emoji: '📈' },
  missed_adjust_limits: { sk: 'Upraviť limity', en: 'Adjust limits', emoji: '🎯' },
  missed_ignore: { sk: 'Premeškané ignorované', en: 'Missed ignored', emoji: '❌' },
};

function formatRelative(iso: string, lang: Lang): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return lang === 'sk' ? 'pred chvíľou' : 'just now';
  if (m < 60) return lang === 'sk' ? `pred ${m} min` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return lang === 'sk' ? `pred ${h} h` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return lang === 'sk' ? `pred ${d} d` : `${d}d ago`;
}

function getStatusIcon(status: string) {
  if (status === 'executed') return { Icon: CheckCircle2, color: 'text-success' };
  if (status === 'postponed') return { Icon: PauseCircle, color: 'text-warning' };
  return { Icon: XCircle, color: 'text-muted-foreground' };
}

type FilterKey = 'all' | 'profit' | 'dca' | 'news' | 'price' | 'other';

const FILTERS: { key: FilterKey; sk: string; en: string; prefix?: string[] }[] = [
  { key: 'all', sk: 'Všetky', en: 'All' },
  { key: 'profit', sk: 'Zisk', en: 'Profit', prefix: ['profit_'] },
  { key: 'dca', sk: 'DCA', en: 'DCA', prefix: ['dca_'] },
  { key: 'news', sk: 'Noviny', en: 'News', prefix: ['news_'] },
  { key: 'price', sk: 'Cena', en: 'Price', prefix: ['price_'] },
  { key: 'other', sk: 'Iné', en: 'Other', prefix: ['rebalance_', 'staking_', 'missed_'] },
];

export function CallbackHistoryCard({ lang }: Props) {
  const [entries, setEntries] = useState<CallbackEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [cleaning, setCleaning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbError } = await supabase
        .from('telegram_callback_log')
        .select('id, created_at, callback_data, action_type, token, profit_pct, status')
        .order('created_at', { ascending: false })
        .limit(50);
      if (dbError) throw dbError;
      setEntries(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const channel = supabase
      .channel('callback-log-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'telegram_callback_log' },
        () => { load(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const filtered = useMemo(() => {
    if (!entries) return null;
    if (filter === 'all') return entries;
    const f = FILTERS.find(x => x.key === filter);
    if (!f?.prefix) return entries;
    return entries.filter(e => f.prefix!.some(p => e.action_type.startsWith(p)));
  }, [entries, filter]);

  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleCleanup = async () => {
    setConfirmOpen(false);
    setCleaning(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'telegram-callback-cleanup',
        { body: { olderThanDays: 7 } }
      );
      if (fnError) throw fnError;
      const deleted = (data as { deleted?: number } | null)?.deleted ?? 0;
      toast.success(
        lang === 'sk' ? `Vymazaných ${deleted} záznamov` : `Deleted ${deleted} entries`
      );
      load();
    } catch (e) {
      toast.error(lang === 'sk' ? 'Mazanie zlyhalo' : 'Cleanup failed');
      console.error('Cleanup error:', e);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <History className="w-5 h-5 text-primary" />
          <h3 className="font-semibold text-foreground">
            {lang === 'sk' ? 'História Telegram akcií' : 'Telegram action history'}
          </h3>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCleanup}
            disabled={cleaning || !entries || entries.length === 0}
            title={lang === 'sk' ? 'Vymazať staršie ako 7 dní' : 'Delete older than 7 days'}
            className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          >
            <Trash2 className={`w-3.5 h-3.5 ${cleaning ? 'animate-pulse' : ''}`} />
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium whitespace-nowrap transition-colors ${
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground'
              }`}
            >
              {f[lang]}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="text-xs text-destructive bg-destructive/10 rounded p-2 mb-2">{error}</div>
      )}

      {!entries && !error && (
        <p className="text-xs text-muted-foreground">{lang === 'sk' ? 'Načítavam…' : 'Loading…'}</p>
      )}

      {filtered && filtered.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {filter === 'all'
            ? (lang === 'sk'
                ? 'Žiadne akcie. Klikni v Telegrame na inline tlačidlo a tu sa zobrazí záznam.'
                : 'No actions yet. Tap an inline button in Telegram and the entry will appear here.')
            : (lang === 'sk' ? 'Žiadne záznamy v tomto filtri.' : 'No entries in this filter.')}
        </p>
      )}

      {filtered && filtered.length > 0 && (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {filtered.map(entry => {
            const meta = ACTION_LABELS[entry.action_type] ?? {
              sk: entry.action_type,
              en: entry.action_type,
              emoji: '•',
            };
            const { Icon, color } = getStatusIcon(entry.status);
            return (
              <div
                key={entry.id}
                className="p-2.5 rounded-lg bg-secondary/50 flex items-start gap-2.5"
              >
                <span className="text-base leading-none mt-0.5">{meta.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground text-xs truncate">
                      {meta[lang]}
                      {entry.token && (
                        <span className="text-muted-foreground"> · {entry.token}</span>
                      )}
                      {entry.profit_pct != null && (
                        <span className="text-muted-foreground"> +{entry.profit_pct}%</span>
                      )}
                    </span>
                    <Icon className={`w-3.5 h-3.5 flex-shrink-0 ${color}`} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {formatRelative(entry.created_at, lang)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
