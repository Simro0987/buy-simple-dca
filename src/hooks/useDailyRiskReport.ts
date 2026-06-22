/**
 * useDailyRiskReport — plánovač dennej analytiky (19:00 SEČ) + Telegram odoslanie.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSyncExternalStore } from 'react';
import type { DailyRiskReportInput } from '@/lib/portfolio/dailyRiskReport';
import {
  generateDailyRiskReport,
  loadDailyReportState,
  saveDailyReportState,
  todayReportKey,
  isPastReportTime,
  isReportSlot,
  type DailyReportState,
} from '@/lib/portfolio/dailyRiskReport';
import { sendDailyReportToTelegram } from '@/lib/telegramService';

const TICK_MS = 60_000;

function subscribe(cb: () => void) {
  window.addEventListener('daily-report-updated', cb);
  window.addEventListener('storage', cb);
  return () => {
    window.removeEventListener('daily-report-updated', cb);
    window.removeEventListener('storage', cb);
  };
}

function getSnapshot(): DailyReportState | null {
  return loadDailyReportState();
}

async function maybeSendTelegram(state: DailyReportState): Promise<void> {
  const today = todayReportKey();
  if (state.telegramSentDate === today) return;

  const result = await sendDailyReportToTelegram(state.report);
  if (result.ok) {
    const updated: DailyReportState = {
      ...state,
      telegramSentAt: new Date().toISOString(),
      telegramSentDate: today,
    };
    saveDailyReportState(updated);
    console.info('[DailyReport] Report odoslaný na Telegram.');
  } else if (!result.skipped) {
    console.error('[DailyReport] Telegram odoslanie zlyhalo:', result.reason);
  }
}

export function useDailyRiskReport(input: DailyRiskReportInput | null, enabled = true) {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const generatingRef = useRef(false);
  const sendingRef = useRef(false);
  const inputRef = useRef(input);
  inputRef.current = input;

  const generate = useCallback((reason: 'scheduled' | 'catchup' | 'manual' = 'manual') => {
    const cur = inputRef.current;
    if (!cur || generatingRef.current) return null;
    if (cur.assets.every(a => a.value <= 0 && a.invested <= 0) && cur.freeCash <= 0) return null;

    generatingRef.current = true;
    try {
      const report = generateDailyRiskReport(cur);
      const next: DailyReportState = {
        generatedAt: report.generatedAt,
        reportDate: report.reportDate,
        reportText: report.reportText,
        report,
      };
      saveDailyReportState(next);
      if (reason === 'manual') {
        console.info('[DailyReport] Manuálne vygenerovaný report.');
      }
      void maybeSendTelegram(next);
      return next;
    } finally {
      generatingRef.current = false;
    }
  }, []);

  const maybeAutoGenerate = useCallback(() => {
    if (!enabled || !inputRef.current) return;
    const today = todayReportKey();
    const existing = loadDailyReportState();

    const now = new Date();
    const atSlot = isReportSlot(now);
    const catchUp = isPastReportTime(now);

    if (existing?.reportDate === today) {
      if (existing.telegramSentDate !== today && !sendingRef.current) {
        sendingRef.current = true;
        void maybeSendTelegram(existing).finally(() => { sendingRef.current = false; });
      }
      return;
    }

    if (atSlot || catchUp) {
      generate(atSlot ? 'scheduled' : 'catchup');
    }
  }, [enabled, generate]);

  useEffect(() => {
    if (!enabled) return;
    maybeAutoGenerate();
    const id = setInterval(maybeAutoGenerate, TICK_MS);
    return () => clearInterval(id);
  }, [enabled, maybeAutoGenerate]);

  const needsToday = useMemo(() => {
    const today = todayReportKey();
    return !state || state.reportDate !== today;
  }, [state]);

  const sendToTelegram = useCallback(async () => {
    const cur = state ?? loadDailyReportState();
    if (!cur) return false;
    const result = await sendDailyReportToTelegram(cur.report);
    if (result.ok) {
      saveDailyReportState({
        ...cur,
        telegramSentAt: new Date().toISOString(),
        telegramSentDate: todayReportKey(),
      });
    }
    return result.ok;
  }, [state]);

  return {
    state,
    report: state?.report ?? null,
    reportText: state?.reportText ?? null,
    needsToday,
    generate,
    sendToTelegram,
    telegramSentAt: state?.telegramSentAt ?? null,
    lastGeneratedAt: state?.generatedAt ?? null,
  };
}
