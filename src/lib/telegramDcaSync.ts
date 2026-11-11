import { supabase } from '@/integrations/supabase/client';

export type ExecutionLeg = 'market' | 'limit';

export interface DcaSyncPayload {
  token: string;
  leg: ExecutionLeg;
  action: 'activate' | 'cancel';
  usd?: number;
  price?: number;
  activeUntil?: number | null;
}

export interface TelegramResult {
  success: boolean;
  error?: string;
  data?: unknown;
}

function chatIdFromStorage(): string | undefined {
  try {
    return localStorage.getItem('telegram_chat_id') || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Syncs a 7-day execution card state to the Telegram bot.
 * On `cancel` the bot also deletes its previous notifications for that token/leg.
 */
export async function syncExecutionStateToTelegram(p: DcaSyncPayload): Promise<TelegramResult> {
  try {
    const { data, error } = await supabase.functions.invoke('telegram-dca-sync', {
      body: { ...p, chatId: chatIdFromStorage() },
    });
    if (error) throw error;
    return { success: Boolean((data as { success?: boolean })?.success), data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

/**
 * "VYMAZAŤ VŠETKO" — purge signal: wipes all past bot messages,
 * notifications and logs from the Telegram chat.
 */
export async function purgeTelegramHistory(sweep = 100): Promise<TelegramResult> {
  try {
    const { data, error } = await supabase.functions.invoke('telegram-purge-history', {
      body: { chatId: chatIdFromStorage(), sweep },
    });
    if (error) throw error;
    return { success: Boolean((data as { success?: boolean })?.success), data };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
