/**
 * usePortfolioTelegramAlerts — automatické Telegram notifikácie z Portfólia.
 *
 * Spúšťa sa keď:
 *  • Overheat skóre tokenu prekročí kritický prah (>= 85)
 *  • Nerealizované PnL dosiahne Take-Profit cieľ (pnl% >= tpPct)
 *
 * Deduplikácia: max. 1 upozornenie na token + typ za kalendárny deň (localStorage).
 */
import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const OVERHEAT_CRITICAL = 85;

export interface AlertCandidate {
  symbol: string;
  overheat: number;
  pnlPct: number | null;
  tpPct: number;
  priceUsd: number;
}

type Kind = 'overheat' | 'takeprofit';

const KEY = 'portfolio-telegram-alerts-v1';
const today = () => new Date().toISOString().slice(0, 10);

function readSent(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function markSent(keys: string[]): void {
  const map = readSent();
  const d = today();
  for (const k of keys) map[k] = d;
  try { localStorage.setItem(KEY, JSON.stringify(map)); } catch { /* noop */ }
}
function alreadySent(key: string): boolean {
  return readSent()[key] === today();
}

export function usePortfolioTelegramAlerts(candidates: AlertCandidate[]): void {
  const busy = useRef(false);

  useEffect(() => {
    if (busy.current || candidates.length === 0) return;

    const alerts: Array<AlertCandidate & { kind: Kind }> = [];
    const keys: string[] = [];

    for (const c of candidates) {
      if (!c.symbol || !Number.isFinite(c.priceUsd) || c.priceUsd <= 0) continue;

      if (c.overheat >= OVERHEAT_CRITICAL) {
        const k = `${c.symbol}:overheat`;
        if (!alreadySent(k)) { alerts.push({ ...c, kind: 'overheat' }); keys.push(k); }
      }
      if (c.tpPct > 0 && c.pnlPct != null && c.pnlPct >= c.tpPct) {
        const k = `${c.symbol}:takeprofit`;
        if (!alreadySent(k)) { alerts.push({ ...c, kind: 'takeprofit' }); keys.push(k); }
      }
    }

    if (alerts.length === 0) return;
    busy.current = true;

    void (async () => {
      try {
        const { error } = await supabase.functions.invoke('telegram-portfolio-alert', {
          body: {
            alerts: alerts.map(a => ({
              symbol: a.symbol,
              kind: a.kind,
              overheat: a.overheat,
              pnlPct: a.pnlPct ?? 0,
              tpPct: a.tpPct,
              priceUsd: a.priceUsd,
            })),
          },
        });
        if (!error) markSent(keys);
      } catch {
        /* offline / paused backend — skúsi znova pri ďalšom renderi */
      } finally {
        busy.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidates.map(c => `${c.symbol}:${Math.round(c.overheat)}:${Math.round(c.pnlPct ?? 0)}:${Math.round(c.tpPct)}`).join('|')]);
}
