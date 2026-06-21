import { supabase } from '@/integrations/supabase/client';

export interface TelegramSendResult {
  success: boolean;
  error?: string;
}

export async function sendDailyRiskReportToTelegram(
  report: string,
  chatId?: string,
): Promise<TelegramSendResult> {
  try {
    const { data, error } = await supabase.functions.invoke('telegram-daily-risk-report', {
      body: { report, chatId },
    });
    if (error) throw error;
    if (!data?.success) {
      return { success: false, error: data?.error ?? 'Unknown telegram error' };
    }
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}
