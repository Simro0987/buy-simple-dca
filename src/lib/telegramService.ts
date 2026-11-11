import { supabase } from '@/integrations/supabase/client';
import { collectActiveExecutions } from '@/lib/sevenDayStates';
import { computePortfolioPnl, getHoldings, pnlPctMap } from '@/lib/portfolioHoldings';
import { HARVEST_TOKENS, type HarvestToken } from '@/lib/harvestEngine';
import { fetchTokenPrice } from '@/lib/apiManager';

/** Live spot prices for the harvest tokens; a failed lookup simply yields 0. */
async function livePrices(): Promise<Partial<Record<HarvestToken, number>>> {
  const out: Partial<Record<HarvestToken, number>> = {};
  const rows = await Promise.all(HARVEST_TOKENS.map(async (t) => {
    const p = await fetchTokenPrice(t).catch(() => 0);
    return [t, Number.isFinite(p) && p > 0 ? p : 0] as const;
  }));
  for (const [t, p] of rows) out[t] = p;
  return out;
}

export interface TelegramSendResult {
  success: boolean;
  error?: string;
  /** Server-rendered report text (live indicator driven). */
  report?: string;
}

/**
 * Triggers the live Daily Risk Report.
 * The report itself is computed server-side from live Binance indicators;
 * the client only contributes state it alone knows (7D flags, free cash).
 */
export async function sendDailyRiskReportToTelegram(
  options?: { chatId?: string; cleanLiquidityUsd?: number },
): Promise<TelegramSendResult> {
  try {
    const prices = await livePrices().catch(() => ({}));
    const { data, error } = await supabase.functions.invoke('telegram-daily-risk-report', {
      body: {
        chatId: options?.chatId,
        cleanLiquidityUsd: options?.cleanLiquidityUsd,
        // Real unrealized PnL % per token — gates the TP recommendations server-side.
        unrealizedPnlPct: pnlPctMap(computePortfolioPnl(getHoldings(), prices)),
        activeExecutions: collectActiveExecutions().map((a) => ({
          token: a.token,
          leg: a.leg,
          activeUntil: a.activeUntil,
        })),
      },
    });
    if (error) throw error;
    if (!data?.success) {
      return { success: false, error: data?.error ?? 'Unknown telegram error', report: data?.report };
    }
    return { success: true, report: data.report };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}
