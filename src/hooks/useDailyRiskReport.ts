/**
 * useDailyRiskReport — plánovač dennej analytiky (19:00) + persistencia.
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
  type DailyReportState,
} from '@/lib/portfolio/dailyRiskReport';

const REPORT_HOUR = 19;
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

export function useDailyRiskReport(input: DailyRiskReportInput | null, enabled = true) {
  const state = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const generatingRef = useRef(false);
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
      return next;
    } finally {
      generatingRef.current = false;
    }
  }, []);

  const maybeAutoGenerate = useCallback(() => {
    if (!enabled || !inputRef.current) return;
    const today = todayReportKey();
    const existing = loadDailyReportState();
    if (existing?.reportDate === today) return;

    const now = new Date();
    const atSlot = now.getHours() === REPORT_HOUR && now.getMinutes() === 0;
    const catchUp = isPastReportTime(now);

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

  return {
    state,
    report: state?.report ?? null,
    reportText: state?.reportText ?? null,
    needsToday,
    generate,
    lastGeneratedAt: state?.generatedAt ?? null,
  };
}
