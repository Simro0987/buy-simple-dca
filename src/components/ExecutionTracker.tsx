import { useState, useMemo, useEffect, useRef } from 'react';
import { Lang } from '@/lib/i18n';
import { TOKENS } from '@/lib/crypto';
import { CheckCircle, AlertTriangle, XCircle, Target, TrendingUp, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface WeekRecord {
  weekId: string; // e.g. "2026-W14"
  dcaExecuted: boolean;
  limits: { symbol: string; filled: boolean; limitPrice: number; currentPrice?: number }[];
}

const STORAGE_KEY = 'execution_history';

function getCurrentWeekId(): string {
  const now = new Date();
  const oneJan = new Date(now.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((now.getTime() - oneJan.getTime()) / 86400000 + oneJan.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getHistory(): WeekRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function saveHistory(records: WeekRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(-12)));
}

interface Props {
  lang: Lang;
  prices?: Record<string, { usd: number }>;
}

export function ExecutionTracker({ lang, prices }: Props) {
  const [history, setHistory] = useState<WeekRecord[]>(getHistory);
  const weekId = getCurrentWeekId();

  // Live limit prices per token (recomputed from current prices, so they
  // always render even if the stored history snapshot was missing a price).
  const liveLimitBySymbol = useMemo(() => {
    const map: Record<string, number> = {};
    TOKENS.forEach(t => {
      const p = prices?.[t.coingeckoId]?.usd ?? 0;
      map[t.symbol] = p * t.limitDiscount;
    });
    return map;
  }, [prices]);

  const storedWeek = history.find(r => r.weekId === weekId);
  const baseWeek: WeekRecord = storedWeek ?? {
    weekId,
    dcaExecuted: false,
    limits: TOKENS.map(t => ({
      symbol: t.symbol,
      filled: false,
      limitPrice: liveLimitBySymbol[t.symbol] ?? 0,
    })),
  };

  // Ensure every token has a row + a non-zero limit price when we have live data.
  const currentWeek: WeekRecord = {
    ...baseWeek,
    limits: TOKENS.map(t => {
      const existing = baseWeek.limits.find(l => l.symbol === t.symbol);
      const live = liveLimitBySymbol[t.symbol] ?? 0;
      const stored = existing?.limitPrice ?? 0;
      return {
        symbol: t.symbol,
        filled: existing?.filled ?? false,
        limitPrice: stored > 0 ? stored : live,
        currentPrice: existing?.currentPrice,
      };
    }),
  };

  const toggleDca = () => {
    const updated = { ...currentWeek, dcaExecuted: !currentWeek.dcaExecuted };
    const newHistory = history.filter(r => r.weekId !== weekId);
    newHistory.push(updated);
    setHistory(newHistory);
    saveHistory(newHistory);
  };

  const toggleLimit = (symbol: string) => {
    const updated = {
      ...currentWeek,
      limits: currentWeek.limits.map(l =>
        l.symbol === symbol ? { ...l, filled: !l.filled } : l
      ),
    };
    const newHistory = history.filter(r => r.weekId !== weekId);
    newHistory.push(updated);
    setHistory(newHistory);
    saveHistory(newHistory);
  };

  // Calculate score
  const recentWeeks = history.slice(-4);
  const totalDca = recentWeeks.length;
  const doneDca = recentWeeks.filter(w => w.dcaExecuted).length;
  const totalLimits = recentWeeks.reduce((s, w) => s + w.limits.length, 0);
  const doneLimits = recentWeeks.reduce((s, w) => s + w.limits.filter(l => l.filled).length, 0);
  const totalActions = totalDca + totalLimits;
  const doneActions = doneDca + doneLimits;
  const score = totalActions > 0 ? Math.round((doneActions / totalActions) * 100) : 0;

  const sk = lang === 'sk';

  // Notify when score drops below 50%
  useEffect(() => {
    if (totalActions === 0 || score >= 50) return;
    const key = `low_score_notified_${weekId}`;
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
    toast.warning(
      sk ? `⚠️ Execution Score klesol na ${score}% — zlepši disciplínu!` : `⚠️ Execution Score dropped to ${score}% — improve your discipline!`,
      { duration: 8000 }
    );
  }, [score, weekId, totalActions, sk]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-foreground">
        {sk ? 'Exekúcia' : 'Execution'}
      </h1>

      {/* Score Card */}
      <div className="glass-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Target className="w-6 h-6 text-primary" />
            <span className="font-bold text-foreground text-lg">
              {sk ? 'Execution Score' : 'Execution Score'}
            </span>
          </div>
          <span className={`text-3xl font-extrabold ${
            score >= 75 ? 'text-gain' : score >= 50 ? 'text-warning' : 'text-loss'
          }`}>
            {score}%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-secondary/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">DCA</p>
            <p className="text-lg font-bold text-foreground">{doneDca}/{totalDca}</p>
            {doneDca === totalDca && totalDca > 0 ? (
              <CheckCircle className="w-4 h-4 text-gain mx-auto mt-1" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-warning mx-auto mt-1" />
            )}
          </div>
          <div className="bg-secondary/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground mb-1">Limit</p>
            <p className="text-lg font-bold text-foreground">{doneLimits}/{totalLimits}</p>
            {totalLimits > 0 && doneLimits / totalLimits >= 0.5 ? (
              <CheckCircle className="w-4 h-4 text-gain mx-auto mt-1" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-warning mx-auto mt-1" />
            )}
          </div>
        </div>
      </div>

      {/* 8-Week History Chart */}
      <WeeklyHistoryChart history={history} lang={lang} />

      {/* This Week */}
      <div className="glass-card p-4 space-y-3">
        <h2 className="font-semibold text-foreground">
          {sk ? `Tento týždeň (${weekId})` : `This Week (${weekId})`}
        </h2>

        {/* DCA toggle */}
        <button
          onClick={toggleDca}
          className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
            currentWeek.dcaExecuted
              ? 'bg-gain/10 border border-gain/30'
              : 'bg-secondary/50 border border-border'
          }`}
        >
          <span className="font-medium text-foreground">
            {sk ? 'DCA vykonaný' : 'DCA Executed'}
          </span>
          {currentWeek.dcaExecuted ? (
            <CheckCircle className="w-5 h-5 text-gain" />
          ) : (
            <XCircle className="w-5 h-5 text-muted-foreground" />
          )}
        </button>

        {/* Limit toggles */}
        {currentWeek.limits.map(limit => (
          <button
            key={limit.symbol}
            onClick={() => toggleLimit(limit.symbol)}
            className={`w-full flex items-center justify-between p-3 rounded-lg transition-colors ${
              limit.filled
                ? 'bg-gain/10 border border-gain/30'
                : 'bg-secondary/50 border border-border'
            }`}
          >
            <div className="text-left">
              <span className="font-medium text-foreground">{limit.symbol} Limit</span>
              {limit.limitPrice > 0 && (
                <p className="text-xs text-muted-foreground">
                  ${limit.limitPrice >= 1000 ? limit.limitPrice.toFixed(0) : limit.limitPrice.toFixed(2)}
                </p>
              )}
            </div>
            {limit.filled ? (
              <CheckCircle className="w-5 h-5 text-gain" />
            ) : (
              <XCircle className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        ))}
      </div>

      {/* Missed Opportunities */}
      <MissedOpportunities history={history} prices={prices} lang={lang} />
    </div>
  );
}

function getWeekScore(week: WeekRecord): number {
  const totalActions = 1 + week.limits.length; // 1 DCA + limits
  const doneActions = (week.dcaExecuted ? 1 : 0) + week.limits.filter(l => l.filled).length;
  return totalActions > 0 ? Math.round((doneActions / totalActions) * 100) : 0;
}

function WeeklyHistoryChart({ history, lang }: { history: WeekRecord[]; lang: Lang }) {
  const sk = lang === 'sk';
  const weeks = history.slice(-8);

  if (weeks.length < 2) return null;

  const data = weeks.map(w => ({
    weekId: w.weekId.replace(/^\d{4}-/, ''),
    score: getWeekScore(w),
  }));

  const maxScore = Math.max(...data.map(d => d.score), 1);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-primary" />
        <h2 className="font-semibold text-foreground text-sm">
          {sk ? 'História (posledných 8 týždňov)' : 'History (last 8 weeks)'}
        </h2>
      </div>

      {/* Mini bar chart */}
      <div className="flex items-end gap-1.5 h-20">
        {data.map((d, i) => {
          const height = Math.max(4, (d.score / 100) * 100);
          const color = d.score >= 75 ? 'bg-gain' : d.score >= 50 ? 'bg-warning' : d.score > 0 ? 'bg-loss' : 'bg-secondary';
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <span className="text-[8px] text-muted-foreground font-medium">
                {d.score > 0 ? `${d.score}%` : ''}
              </span>
              <div
                className={`w-full rounded-t-sm ${color} transition-all`}
                style={{ height: `${height}%` }}
              />
              <span className="text-[7px] text-muted-foreground truncate w-full text-center">
                {d.weekId}
              </span>
            </div>
          );
        })}
      </div>

      {/* Average */}
      {data.length > 0 && (
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{sk ? 'Priemer' : 'Average'}</span>
          <span className="font-bold text-foreground">
            {Math.round(data.reduce((s, d) => s + d.score, 0) / data.length)}%
          </span>
        </div>
      )}
    </div>
  );
}

function MissedOpportunities({ history, prices, lang }: {
  history: WeekRecord[];
  prices?: Record<string, { usd: number }>;
  lang: Lang;
}) {
  const sk = lang === 'sk';
  const notifiedRef = useRef<string | null>(null);
  const budget = Number(localStorage.getItem('dca-budget') || '100');

  const missed = useMemo(() => {
    const result: { symbol: string; weekId: string; limitPrice: number; currentPrice: number; gainPct: number; missedGainUsd: number }[] = [];
    for (const week of history.slice(-4)) {
      for (const limit of week.limits) {
        if (limit.filled) continue;
        const token = TOKENS.find(t => t.symbol === limit.symbol);
        if (!token) continue;
        const currentPrice = prices?.[token.coingeckoId]?.usd ?? 0;
        if (currentPrice > 0 && limit.limitPrice > 0 && currentPrice > limit.limitPrice) {
          const gainPct = ((currentPrice - limit.limitPrice) / limit.limitPrice) * 100;
          if (gainPct > 1) {
            const allocationPct = token.allocation;
            const limitUsd = budget * allocationPct * 0.4;
            const missedGainUsd = limitUsd * (gainPct / 100);
            result.push({ symbol: limit.symbol, weekId: week.weekId, limitPrice: limit.limitPrice, currentPrice, gainPct, missedGainUsd });
          }
        }
      }
    }
    return result;
  }, [history, prices, budget]);

  const totalMissedGain = missed.reduce((s, m) => s + m.missedGainUsd, 0);

  // Auto-send Telegram notification when total missed gain > $50
  useEffect(() => {
    if (totalMissedGain < 50 || missed.length === 0) return;

    const chatId = localStorage.getItem('telegram_chat_id')?.trim();
    if (!chatId) return;

    // Deduplicate: only notify once per unique set of missed items
    const key = missed.map(m => `${m.symbol}-${m.weekId}`).sort().join('|');
    const lastNotified = localStorage.getItem('missed_opp_notified_key');
    if (lastNotified === key || notifiedRef.current === key) return;

    notifiedRef.current = key;

    supabase.functions.invoke('telegram-missed-opportunity', {
      body: { chatId, missedItems: missed },
    }).then(({ error }) => {
      if (error) {
        console.error('Failed to send missed opp alert:', error);
      } else {
        localStorage.setItem('missed_opp_notified_key', key);
        toast.success(sk ? 'Telegram notifikácia o zmeškanom zisku odoslaná' : 'Missed opportunity alert sent to Telegram');
      }
    });
  }, [totalMissedGain, missed, sk]);

  if (missed.length === 0) return null;

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-warning" />
          {sk ? 'Zmeškané príležitosti' : 'Missed Opportunities'}
        </h2>
        {totalMissedGain >= 50 && (
          <span className="flex items-center gap-1 text-xs text-primary">
            <Send className="w-3 h-3" />
            {sk ? 'Notifikácia odoslaná' : 'Alert sent'}
          </span>
        )}
      </div>

      {missed.map((m, i) => (
        <div key={i} className="bg-loss/5 border border-loss/20 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">{m.symbol}</span>
            <span className="text-xs text-muted-foreground">{m.weekId}</span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {sk
              ? `Limit nevyplnený → cena +${m.gainPct.toFixed(1)}%`
              : `Limit unfilled → price +${m.gainPct.toFixed(1)}%`
            }
          </p>
          <p className="text-sm font-semibold text-loss mt-0.5">
            {sk
              ? `Zmeškaný zisk: ~$${m.missedGainUsd.toFixed(0)}`
              : `Missed gain: ~$${m.missedGainUsd.toFixed(0)}`
            }
          </p>
        </div>
      ))}

      {totalMissedGain >= 50 && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 text-center">
          <p className="text-sm font-bold text-warning">
            {sk ? `Celkový zmeškaný zisk: ~$${totalMissedGain.toFixed(0)}` : `Total missed gain: ~$${totalMissedGain.toFixed(0)}`}
          </p>
        </div>
      )}
    </div>
  );
}
