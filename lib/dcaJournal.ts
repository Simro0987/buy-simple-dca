import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import { formatRsi } from "@/lib/numberFormat";
import type { MacroTrend } from "@/lib/macroTrend";
import type { ShortTermTrend } from "@/lib/shortTermTrend";

export const DCA_JOURNAL_STORAGE_KEY = "bsdca-dca-journal";
export const DCA_JOURNAL_UPDATED_EVENT = "bsdca-dca-journal-updated";

export type DcaJournalTrigger = "activate_limit" | "copy_limit_price";

export interface DcaJournalEntry {
  id: string;
  recordedAt: string;
  symbol: string;
  tokenName: string;
  spotPrice: number;
  limitPrice: number;
  limitUsd: number;
  rsi14: number | null;
  macroTrend: MacroTrend | null;
  shortTermTrend: ShortTermTrend | null;
  trigger: DcaJournalTrigger;
  note: string;
}

function notifyUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DCA_JOURNAL_UPDATED_EVENT));
}

export function readDcaJournal(): DcaJournalEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DCA_JOURNAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DcaJournalEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeDcaJournal(entries: DcaJournalEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    DCA_JOURNAL_STORAGE_KEY,
    JSON.stringify(entries.slice(0, 300)),
  );
}

function formatJournalDate(iso: string): string {
  return new Intl.DateTimeFormat("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function buildJournalNote(plan: TokenExecutionPlan, recordedAt: string): string {
  const rsiText =
    plan.rsi14 != null ? formatRsi(plan.rsi14) : "—";
  const macro = plan.macroTrend?.toUpperCase() ?? "—";
  const weekly = plan.shortTermTrend?.toUpperCase() ?? "—";

  return (
    `Vypočítané ${formatJournalDate(recordedAt)} pri RSI ${rsiText} ` +
    `(makro: ${macro}, týždenný: ${weekly}).`
  );
}

export function appendDcaJournalEntry(input: {
  plan: TokenExecutionPlan;
  trigger: DcaJournalTrigger;
}): DcaJournalEntry[] {
  const { plan, trigger } = input;
  if (plan.limitPrice <= 0 || plan.noTradeActive) {
    return readDcaJournal();
  }

  const recordedAt = new Date().toISOString();
  const entry: DcaJournalEntry = {
    id: `journal-${plan.symbol}-${Date.now()}`,
    recordedAt,
    symbol: plan.symbol,
    tokenName: plan.name,
    spotPrice: plan.spotPrice,
    limitPrice: plan.limitPrice,
    limitUsd: plan.limitUsd,
    rsi14: plan.rsi14,
    macroTrend: plan.macroTrend,
    shortTermTrend: plan.shortTermTrend,
    trigger,
    note: buildJournalNote(plan, recordedAt),
  };

  const merged = [entry, ...readDcaJournal()].slice(0, 300);
  writeDcaJournal(merged);
  notifyUpdated();
  return merged;
}

export function downloadDcaJournalJson(): void {
  const payload = JSON.stringify(readDcaJournal(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dca-journal-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function escapeCsv(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function downloadDcaJournalCsv(): void {
  const entries = readDcaJournal();
  const header = [
    "recordedAt",
    "symbol",
    "tokenName",
    "spotPrice",
    "limitPrice",
    "limitUsd",
    "rsi14",
    "macroTrend",
    "shortTermTrend",
    "trigger",
    "note",
  ];
  const rows = entries.map((entry) =>
    [
      entry.recordedAt,
      entry.symbol,
      entry.tokenName,
      entry.spotPrice,
      entry.limitPrice,
      entry.limitUsd,
      entry.rsi14,
      entry.macroTrend,
      entry.shortTermTrend,
      entry.trigger,
      entry.note,
    ]
      .map(escapeCsv)
      .join(","),
  );
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `dca-journal-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
