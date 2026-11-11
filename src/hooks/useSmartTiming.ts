import { useEffect, useState } from 'react';
import type { TimingState } from '@/components/dca/SmartTimingEngineCard';

export interface SmartTimingResult {
  state: TimingState;
  verdict: string;
  reason: string;
  rsi4h: number | null;
  loading: boolean;
}

const DEFAULT: SmartTimingResult = {
  state: 'go',
  verdict: 'Odporúčaný nákup: Dnes',
  reason: 'Trh je v štandardnom režime mimo víkendových anomálií.',
  rsi4h: null,
  loading: true,
};

interface Kline4h {
  openTime: number;
  close: number;
}

async function fetchBtc4hKlines(): Promise<Kline4h[] | null> {
  try {
    const r = await fetch(
      'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=4h&limit=50',
    );
    if (!r.ok) return null;
    const raw = (await r.json()) as unknown[];
    if (!Array.isArray(raw)) return null;
    return raw
      .map(k => {
        const arr = k as [number, string, string, string, string, ...unknown[]];
        return { openTime: arr[0], close: parseFloat(arr[4]) };
      })
      .filter(k => Number.isFinite(k.close) && k.close > 0);
  } catch {
    return null;
  }
}

function computeRsi14(closes: number[]): number | null {
  if (closes.length < 15) return null;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= 14; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / 14;
  let avgLoss = losses / 14;
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * 13 + g) / 14;
    avgLoss = (avgLoss * 13 + l) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.max(0, Math.min(100, 100 - 100 / (1 + rs)));
}

/** Return UTC hour+minute equivalent to the current CET/CEST wall-clock. */
function cetNow(): { day: number; hour: number; minute: number } {
  // Use Intl for correct CET/CEST DST handling.
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Bratislava',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date());
  const weekdayStr = parts.find(p => p.type === 'weekday')?.value ?? 'Mon';
  const hour = parseInt(parts.find(p => p.type === 'hour')?.value ?? '0', 10);
  const minute = parseInt(parts.find(p => p.type === 'minute')?.value ?? '0', 10);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { day: map[weekdayStr] ?? new Date().getDay(), hour, minute };
}

/** Find the close of the 4h candle whose openTime is closest to Friday 23:00 UTC of last week. */
function findFridayClose(klines: Kline4h[]): number | null {
  const now = new Date();
  // Compute last Friday 23:00 UTC
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 0, 0));
  const dow = d.getUTCDay(); // 0=Sun ... 5=Fri
  const daysBack = (dow - 5 + 7) % 7 || 7; // most recent Friday strictly in the past
  d.setUTCDate(d.getUTCDate() - daysBack);
  const targetTs = d.getTime();
  let best: Kline4h | null = null;
  let bestDiff = Infinity;
  for (const k of klines) {
    const diff = Math.abs(k.openTime - targetTs);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = k;
    }
  }
  return best?.close ?? null;
}

export function useSmartTiming(): SmartTimingResult {
  const [result, setResult] = useState<SmartTimingResult>(DEFAULT);

  useEffect(() => {
    let cancelled = false;

    async function evaluate() {
      const { day, hour, minute } = cetNow();
      const isMonday = day === 1;

      if (!isMonday) {
        if (!cancelled) {
          setResult({
            state: 'go',
            verdict: 'Odporúčaný nákup: Dnes',
            reason: 'Trh je v štandardnom režime mimo víkendových anomálií.',
            rsi4h: null,
            loading: false,
          });
        }
        return;
      }

      const klines = await fetchBtc4hKlines();
      const closes = klines?.map(k => k.close) ?? [];
      const rsi = closes.length ? computeRsi14(closes) : null;
      const spot = closes[closes.length - 1] ?? null;
      const fridayClose = klines ? findFridayClose(klines) : null;
      const pumpPct =
        spot && fridayClose && fridayClose > 0
          ? ((spot - fridayClose) / fridayClose) * 100
          : 0;

      // Rule 1 — DELAY
      if ((rsi !== null && rsi > 72) || pumpPct > 2.5) {
        if (!cancelled) {
          setResult({
            state: 'delay',
            verdict: 'Odporúčaný nákup: Utorok / Streda',
            reason:
              'Detekovaný víkendový pump (4H RSI je prekúpené > 70). Vyššia pravdepodobnosť začiatku týždňa v korekcii.',
            rsi4h: rsi,
            loading: false,
          });
        }
        return;
      }

      // Rule 2 — WAIT (before 15:30 CET)
      const beforeCutoff = hour < 15 || (hour === 15 && minute < 30);
      if (beforeCutoff) {
        if (!cancelled) {
          setResult({
            state: 'wait',
            verdict: 'Odporúčaný nákup: Dnes po 15:30',
            reason:
              'Čaká sa na otvorenie amerických trhov a ETF tokov (15:30 CET) pre potvrdenie denného trendu.',
            rsi4h: rsi,
            loading: false,
          });
        }
        return;
      }

      // Rule 3 — GO
      if (!cancelled) {
        setResult({
          state: 'go',
          verdict: 'Odporúčaný nákup: Dnes (Pondelok)',
          reason:
            'Trh po otvorení US trhov stabilizovaný. Podmienky na DCA nákup sú priaznivé.',
          rsi4h: rsi,
          loading: false,
        });
      }
    }

    evaluate();
    const id = setInterval(evaluate, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return result;
}
