/**
 * Telegram Service — odosielanie správ cez Supabase edge function.
 * Formátovanie reportu (Markdown) + bezpečné volanie API (bez pádu appky).
 */
import { supabase } from '@/integrations/supabase/client';
import type { DailyRiskReport } from '@/lib/portfolio/dailyRiskReport';
import { formatUsd, formatPrice } from '@/lib/crypto';

export type TelegramParseMode = 'Markdown' | 'HTML';

export interface TelegramSendResult {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  messageId?: number;
}

function resolveChatId(override?: string): string | null {
  const fromEnv = import.meta.env.VITE_TELEGRAM_CHAT_ID?.trim();
  const fromArg = override?.trim();
  const fromStorage = (() => {
    try { return localStorage.getItem('telegram_chat_id')?.trim() ?? ''; } catch { return ''; }
  })();
  return fromArg || fromEnv || fromStorage || null;
}

/** Escapuje špeciálne znaky pre Telegram Markdown (legacy). */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*`\[])/g, '\\$1');
}

/** Formátuje denný report pre Telegram — tučné nadpisy, odrážky, monospace sekcie. */
export function formatDailyReportForTelegram(report: DailyRiskReport): string {
  const lines: string[] = [
    `*📊 DENNÝ ANALYTICKÝ REPORT · PORTFÓLIO*`,
    `_${report.reportDate} · ${new Date(report.generatedAt).toLocaleString('sk-SK')}_`,
    '',
    `*▸ Executive Summary*`,
    escapeMarkdown(report.executiveSummary),
    '',
    `*▸ Prehľad portfólia*`,
    `• Hodnota: *${escapeMarkdown(formatUsd(report.totalValue))}*`,
    `• Likvidita: ${escapeMarkdown(formatUsd(report.netLiquidity))}`,
    `• 24H PnL: ${report.pnl24hUsd >= 0 ? '+' : ''}${escapeMarkdown(formatUsd(report.pnl24hUsd))}`,
    `• Kum. PnL: ${report.cumulativePnlUsd >= 0 ? '+' : ''}${escapeMarkdown(formatUsd(report.cumulativePnlUsd))} (${report.cumulativePnlPct >= 0 ? '+' : ''}${report.cumulativePnlPct.toFixed(2)} %)`,
    '',
    `*▸ Alokácia*`,
    ...report.allocations.map(a =>
      `• *${a.symbol}*: ${escapeMarkdown(formatUsd(a.value))} · ${a.actualPct.toFixed(1)} % (cieľ ${(a.targetPct * 100).toFixed(0)} %)`,
    ),
    '',
    `*▸ Spot · 24H*`,
    ...(['BTC', 'ETH', 'SOL'] as const).map(sym => {
      const ch = report.change24h[sym];
      return `• *${sym}*: ${escapeMarkdown(formatPrice(report.spotPrices[sym]))} · ${ch >= 0 ? '+' : ''}${ch.toFixed(2)} %`;
    }),
    '',
    `*▸ WACB vs Spot*`,
    ...report.wacb.map(w => {
      if (w.holdings <= 0) return `• ${w.symbol}: bez pozície`;
      const prem = w.premiumPct >= 0 ? `+${w.premiumPct.toFixed(2)}` : w.premiumPct.toFixed(2);
      return `• *${w.symbol}*: WACB ${escapeMarkdown(formatUsd(w.wacb))} · Spot ${escapeMarkdown(formatUsd(w.spot))} · ${prem} %`;
    }),
    '',
    `*▸ Rizikový index*`,
    `• Fear & Greed: *${report.fearGreed}*`,
    `• LiveRiskScore: *${report.liveRiskScore.toFixed(1)}* / 100`,
    '',
    `*▸ Koncentrácia*`,
    ...(report.concentrationAlerts.length > 0
      ? report.concentrationAlerts.map(a => `⚠️ ${escapeMarkdown(a.message)}`)
      : ['✓ V limite (≤ 50 %)']),
    '',
    `*▸ Konzervatívne aktívum*`,
    `• *${report.conservativeAsset}*: ${escapeMarkdown(report.conservativeSummary)}`,
    '',
    `_Report · auto 19:00 SEČ_`,
  ];
  return lines.join('\n');
}

/** Rozdelí dlhý text na časti (limit Telegramu 4096 znakov). */
function chunkMessage(text: string, max = 4000): string[] {
  if (text.length <= max) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max * 0.5) cut = max;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) chunks.push(rest);
  return chunks;
}

/**
 * Odošle textovú správu na Telegram.
 * Token sa rieši na serveri (TELEGRAM_BOT_TOKEN / TELEGRAM_API_KEY) — klient nevolá api.telegram.org priamo (CORS).
 */
export async function sendTelegramMessage(
  text: string,
  options?: { chatId?: string; parseMode?: TelegramParseMode },
): Promise<TelegramSendResult> {
  const chatId = resolveChatId(options?.chatId);
  if (!chatId) {
    console.warn('[Telegram] Chýba Chat ID — nastav VITE_TELEGRAM_CHAT_ID alebo telegram_chat_id v nastaveniach.');
    return { ok: false, skipped: true, reason: 'no_chat_id' };
  }

  const parseMode = options?.parseMode ?? 'Markdown';
  const chunks = chunkMessage(text);

  try {
    let lastMessageId: number | undefined;
    for (const chunk of chunks) {
      const { data, error } = await supabase.functions.invoke('telegram-send-message', {
        body: { chatId, text: chunk, parse_mode: parseMode },
      });
      if (error) {
        console.error('[Telegram] Edge function error:', error.message);
        return { ok: false, reason: error.message };
      }
      if (!data?.success) {
        console.error('[Telegram] Send failed:', data?.error ?? data);
        return { ok: false, reason: data?.error ?? 'send_failed' };
      }
      lastMessageId = data.message_id;
    }
    return { ok: true, messageId: lastMessageId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Telegram] Network error:', msg);
    return { ok: false, reason: msg };
  }
}

/** Odošle denný analytický report na Telegram. Nikdy nehodí výnimku. */
export async function sendDailyReportToTelegram(report: DailyRiskReport): Promise<TelegramSendResult> {
  try {
    const text = formatDailyReportForTelegram(report);
    return await sendTelegramMessage(text, { parseMode: 'Markdown' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Telegram] Daily report send error:', msg);
    return { ok: false, reason: msg };
  }
}
