import { useCallback, useEffect, useRef, useState } from 'react';
import { syncExecutionStateToTelegram, type ExecutionLeg } from '@/lib/telegramDcaSync';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface SevenDayTelegramSync {
  /** Token symbol, e.g. 'BTC'. */
  token: string;
  /** Order leg this flag belongs to. */
  leg: ExecutionLeg;
  /** Live order details, read at click time. */
  usd?: number;
  price?: number;
}

/**
 * Persisted 7-day activation flag.
 * Stores an expiry timestamp in localStorage; auto-resets once expired.
 * When `sync` is provided, activation/cancellation is mirrored to the
 * Telegram bot (cancel also purges the bot's previous notifications).
 */
export function useSevenDayActivation(key: string, sync?: SevenDayTelegramSync) {
  const read = (): number | null => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const ts = Number(raw);
      if (!Number.isFinite(ts) || ts <= Date.now()) {
        localStorage.removeItem(key);
        return null;
      }
      return ts;
    } catch {
      return null;
    }
  };

  const [activeUntil, setActiveUntil] = useState<number | null>(read);

  // Keep the latest live order details without re-creating callbacks.
  const syncRef = useRef<SevenDayTelegramSync | undefined>(sync);
  syncRef.current = sync;

  // Periodically expire the flag while the page stays open.
  useEffect(() => {
    const tick = () => {
      setActiveUntil(prev => {
        if (prev !== null && prev <= Date.now()) {
          try { localStorage.removeItem(key); } catch { /* noop */ }
          return null;
        }
        return prev;
      });
    };
    const id = window.setInterval(tick, 30_000);
    tick();
    return () => window.clearInterval(id);
  }, [key]);

  const activate = useCallback(() => {
    const until = Date.now() + WEEK_MS;
    try { localStorage.setItem(key, String(until)); } catch { /* noop */ }
    setActiveUntil(until);
    const s = syncRef.current;
    if (s) {
      void syncExecutionStateToTelegram({
        token: s.token,
        leg: s.leg,
        action: 'activate',
        usd: s.usd,
        price: s.price,
        activeUntil: until,
      });
    }
  }, [key]);

  const clear = useCallback(() => {
    try { localStorage.removeItem(key); } catch { /* noop */ }
    setActiveUntil(null);
    const s = syncRef.current;
    if (s) {
      void syncExecutionStateToTelegram({ token: s.token, leg: s.leg, action: 'cancel' });
    }
  }, [key]);

  /** Updates the live order details used in the Telegram notification. */
  const setDetails = useCallback((d: { usd?: number; price?: number }) => {
    if (syncRef.current) {
      syncRef.current = { ...syncRef.current, ...d };
    }
  }, []);

  return { isActive: activeUntil !== null, activeUntil, activate, clear, setDetails };
}

/** Formats a timestamp as "DD.MM." (Slovak style). */
export function formatDdMm(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`;
}
