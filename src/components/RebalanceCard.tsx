import { useState } from 'react';
import { Lang } from '@/lib/i18n';
import { PriceData, TOKENS, formatUsd } from '@/lib/crypto';
import { Scale, ArrowRight, ArrowUpRight, ArrowDownRight, AlertTriangle, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  lang: Lang;
  prices?: PriceData;
  selected?: 'BTC' | 'ETH' | 'SOL' | null;
}

const TARGET: Record<string, number> = { BTC: 64, ETH: 25, SOL: 11 };
const DRIFT_THRESHOLD = 3;
const ACTION_THRESHOLD = 5;

function getHoldings(): Record<string, number> {
  try {
    const raw = localStorage.getItem('smart-alloc-holdings');
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

interface Drift {
  symbol: string;
  current: number;
  target: number;
  diff: number;
  color: string;
  valueUsd: number;
  targetValueUsd: number;
  adjustUsd: number;
}

export function RebalanceCard({ lang, prices, selected }: Props) {
  const sk = lang === 'sk';
  const holdings = getHoldings();
  const [sending, setSending] = useState(false);

  if (!prices) return null;

  let totalValue = 0;
  const tokenValues: Record<string, number> = {};
  for (const token of TOKENS) {
    const key = token.symbol.toLowerCase();
    const qty = holdings[key] || 0;
    const price = prices[token.coingeckoId]?.usd || 0;
    const value = qty * price;
    tokenValues[token.symbol] = value;
    totalValue += value;
  }

  if (totalValue <= 0) return null;

  const drifts: Drift[] = [];
  for (const token of TOKENS) {
    const currentPct = (tokenValues[token.symbol] / totalValue) * 100;
    const targetPct = TARGET[token.symbol] || 0;
    const diff = currentPct - targetPct;
    const targetValueUsd = totalValue * (targetPct / 100);
    const adjustUsd = tokenValues[token.symbol] - targetValueUsd;

    if (Math.abs(diff) >= DRIFT_THRESHOLD) {
      drifts.push({
        symbol: token.symbol,
        current: currentPct,
        target: targetPct,
        diff,
        color: token.color,
        valueUsd: tokenValues[token.symbol],
        targetValueUsd,
        adjustUsd,
      });
    }
  }

  if (drifts.length === 0) return null;

  drifts.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  // Filter by selected asset (show only drifts/actions involving it)
  const filteredDrifts = selected ? drifts.filter(d => d.symbol === selected) : drifts;

  const hasActionable = drifts.some(d => Math.abs(d.diff) >= ACTION_THRESHOLD);
  const overweighted = drifts.filter(d => d.diff > 0);
  const underweighted = drifts.filter(d => d.diff < 0);

  // Generate specific rebalancing actions
  const actions: { from: string; to: string; amount: number; fromColor: string; toColor: string }[] = [];
  if (hasActionable && overweighted.length > 0 && underweighted.length > 0) {
    const sellPool = overweighted.map(d => ({ ...d, remaining: d.adjustUsd }));
    const buyPool = underweighted.map(d => ({ ...d, remaining: Math.abs(d.adjustUsd) }));

    for (const sell of sellPool) {
      for (const buy of buyPool) {
        if (sell.remaining <= 0 || buy.remaining <= 0) continue;
        const transfer = Math.min(sell.remaining, buy.remaining);
        if (transfer >= 10) {
          actions.push({
            from: sell.symbol,
            to: buy.symbol,
            amount: transfer,
            fromColor: sell.color,
            toColor: buy.color,
          });
          sell.remaining -= transfer;
          buy.remaining -= transfer;
        }
      }
    }
  }

  const budget = Number(localStorage.getItem('dca-budget') || '100');

  const dcaAdjustments = underweighted
    .filter(d => Math.abs(d.diff) >= ACTION_THRESHOLD)
    .map(d => {
      const token = TOKENS.find(t => t.symbol === d.symbol)!;
      const currentDcaPct = token.allocation * 100;
      const suggestedBoost = Math.min(10, Math.abs(d.diff));
      return { symbol: d.symbol, currentDcaPct, suggestedBoost, color: d.color };
    });

  const handleSendRebalanceAlert = async () => {
    const chatId = localStorage.getItem('telegram_chat_id')?.trim();
    if (!chatId) {
      toast.error(sk ? 'Nastav Telegram Chat ID v nastaveniach' : 'Set Telegram Chat ID in settings');
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.functions.invoke('telegram-rebalance-alert', {
        body: {
          chatId,
          drifts: drifts.map(d => ({ symbol: d.symbol, current: d.current, target: d.target, diff: d.diff, adjustUsd: d.adjustUsd })),
          actions: actions.map(a => ({ from: a.from, to: a.to, amount: a.amount })),
          totalValue,
        },
      });

      if (error) throw error;
      toast.success(sk ? 'Rebalancing alert odoslaný na Telegram ✓' : 'Rebalancing alert sent to Telegram ✓');
    } catch (err) {
      console.error('Rebalance alert error:', err);
      toast.error(sk ? 'Nepodarilo sa odoslať alert' : 'Failed to send alert');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Scale className="w-5 h-5 text-warning" />
        <span className="text-sm font-semibold text-foreground">
          {sk ? 'Rebalancing odporúčania' : 'Rebalancing Suggestions'}
        </span>
        {hasActionable && (
          <span className="ml-auto px-2 py-0.5 rounded-full bg-warning/20 text-warning text-[10px] font-bold">
            {sk ? 'Akcia potrebná' : 'Action needed'}
          </span>
        )}
      </div>

      {/* Drift overview */}
      <div className="space-y-2">
        {filteredDrifts.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            {sk ? `Žiadny drift pre ${selected}.` : `No drift for ${selected}.`}
          </p>
        )}
        {filteredDrifts.map(d => (
          <div key={d.symbol} className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ backgroundColor: d.color + '20', color: d.color }}
            >
              {d.symbol.slice(0, 2)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">{d.current.toFixed(1)}%</span>
                <ArrowRight className="w-3 h-3 text-muted-foreground" />
                <span className="font-bold text-foreground">{d.target}%</span>
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {formatUsd(d.valueUsd)} → {formatUsd(d.targetValueUsd)}
                </span>
              </div>
              <div className="flex items-center gap-1.5 mt-1">
                {d.diff > 0 ? (
                  <ArrowUpRight className="w-3 h-3 text-loss" />
                ) : (
                  <ArrowDownRight className="w-3 h-3 text-gain" />
                )}
                <p className="text-[11px] text-muted-foreground">
                  {d.diff > 0
                    ? (sk ? `Prevážený — zníž o ${formatUsd(Math.abs(d.adjustUsd))}` : `Overweight — reduce by ${formatUsd(Math.abs(d.adjustUsd))}`)
                    : (sk ? `Podvážený — doplň ${formatUsd(Math.abs(d.adjustUsd))}` : `Underweight — add ${formatUsd(Math.abs(d.adjustUsd))}`)
                  }
                </p>
              </div>
            </div>
            <span className={`text-sm font-bold flex-shrink-0 ${d.diff > 0 ? 'text-loss' : 'text-gain'}`}>
              {d.diff > 0 ? '+' : ''}{d.diff.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {/* Specific rebalancing actions */}
      {actions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-warning" />
            {sk ? 'Odporúčané presúvania' : 'Suggested Transfers'}
          </p>
          {actions.map((a, i) => (
            <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-warning/5 border border-warning/20">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{ backgroundColor: a.fromColor + '20', color: a.fromColor }}
              >
                {a.from.slice(0, 2)}
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-warning flex-shrink-0" />
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                style={{ backgroundColor: a.toColor + '20', color: a.toColor }}
              >
                {a.to.slice(0, 2)}
              </div>
              <span className="text-xs text-foreground font-medium">
                {sk ? `Presuň ${formatUsd(a.amount)} z ${a.from} do ${a.to}` : `Move ${formatUsd(a.amount)} from ${a.from} to ${a.to}`}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* DCA adjustment suggestions */}
      {dcaAdjustments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-foreground">
            {sk ? 'Alebo uprav DCA alokáciu' : 'Or adjust DCA allocation'}
          </p>
          {dcaAdjustments.map(a => (
            <p key={a.symbol} className="text-[11px] text-muted-foreground pl-2 border-l-2" style={{ borderColor: a.color }}>
              {sk
                ? `Zvýš ${a.symbol} DCA o ~${a.suggestedBoost.toFixed(0)}% na najbližšie 2-4 týždne`
                : `Boost ${a.symbol} DCA by ~${a.suggestedBoost.toFixed(0)}% for the next 2-4 weeks`
              }
            </p>
          ))}
        </div>
      )}

      {/* Telegram alert button */}
      <button
        onClick={handleSendRebalanceAlert}
        disabled={sending}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary/10 text-primary text-xs font-medium border border-primary/20 active:bg-primary/20 disabled:opacity-50"
      >
        <Send className={`w-3.5 h-3.5 ${sending ? 'animate-pulse' : ''}`} />
        {sk ? 'Pošli na Telegram' : 'Send to Telegram'}
      </button>

      <p className="text-[10px] text-muted-foreground">
        {sk
          ? `⚠️ Odchýlka ≥${DRIFT_THRESHOLD}% od cieľa. Len spotové obchody — žiadna páka!`
          : `⚠️ Drift ≥${DRIFT_THRESHOLD}% from target. Spot trades only — no leverage!`}
      </p>
    </div>
  );
}
