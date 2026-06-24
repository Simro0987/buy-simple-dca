import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';
const MAX_RUNTIME_MS = 55_000;
const MIN_REMAINING_MS = 5_000;

const ACTION_RESPONSES: Record<string, string> = {
  // Profit alerts
  profit_sell: '✅ Level označený ako vykonaný. Predaj podľa plánu!',
  profit_postpone: '⏸️ Odložené. Pripomeniem neskôr.',
  profit_ignore: '❌ Ignorované. Level preskočený.',
  // DCA
  dca_execute: '✅ DCA označené ako vykonané!',
  dca_postpone: '⏸️ DCA odložené na neskôr.',
  dca_ignore: '❌ DCA tento týždeň preskočené.',
  // News
  news_analyze: '📊 Analyzujem dopad na portfólio...',
  news_mute: '🔕 Novinky stíšené na 1 hodinu.',
  news_ignore: '❌ Ignorované.',
  // Price alerts
  price_buy: '✅ Nákup označený! Vykonaj na burze.',
  price_postpone: '⏸️ Cenový alert odložený.',
  price_ignore: '❌ Cenový alert ignorovaný.',
  // Rebalance
  rebalance_execute: '✅ Rebalancing označený ako vykonaný!',
  rebalance_postpone: '⏸️ Rebalancing odložený.',
  rebalance_ignore: '❌ Rebalancing ignorovaný.',
  // Staking
  staking_execute: '✅ Konverzia výnosov vykonaná!',
  staking_postpone: '⏸️ Konverzia odložená.',
  staking_ignore: '❌ Konverzia ignorovaná.',
  // Missed opportunity
  missed_increase_budget: '📈 Zvýšenie rozpočtu zaznamenané.',
  missed_adjust_limits: '🎯 Úprava limitov zaznamenená.',
  missed_ignore: '❌ Ignorované.',
};

function parseCallbackData(data: string): { actionType: string; token?: string; profitPct?: number } {
  // Profit callbacks: profit_sell_BTC_20, profit_postpone_ETH_35
  const profitMatch = data.match(/^(profit_(?:sell|postpone|ignore))_([A-Z]+)_(.+)$/);
  if (profitMatch) {
    return {
      actionType: profitMatch[1],
      token: profitMatch[2],
      profitPct: parseFloat(profitMatch[3]),
    };
  }
  // All other callbacks are simple action types
  return { actionType: data };
}

function getResponseText(actionType: string): string {
  return ACTION_RESPONSES[actionType] || '✅ Akcia zaznamenaná.';
}

Deno.serve(async () => {
  const startTime = Date.now();

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
  const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
  if (!TELEGRAM_API_KEY) throw new Error('TELEGRAM_API_KEY is not configured');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) throw new Error('SUPABASE_URL is not configured');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseServiceKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let totalProcessed = 0;

  // Read current offset
  const { data: state, error: stateErr } = await supabase
    .from('telegram_bot_state')
    .select('update_offset')
    .eq('id', 1)
    .single();

  if (stateErr) {
    return new Response(JSON.stringify({ error: stateErr.message }), { status: 500 });
  }

  let currentOffset = state.update_offset;

  while (true) {
    const elapsed = Date.now() - startTime;
    const remainingMs = MAX_RUNTIME_MS - elapsed;
    if (remainingMs < MIN_REMAINING_MS) break;

    const timeout = Math.min(50, Math.floor(remainingMs / 1000) - 5);
    if (timeout < 1) break;

    const response = await fetch(`${GATEWAY_URL}/getUpdates`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TELEGRAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        offset: currentOffset,
        timeout,
        allowed_updates: ['callback_query'],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('getUpdates failed:', data);
      return new Response(JSON.stringify({ error: data }), { status: 502 });
    }

    const updates = data.result ?? [];
    if (updates.length === 0) continue;

    for (const update of updates) {
      const cbq = update.callback_query;
      if (!cbq) continue;

      const callbackData = cbq.data || '';
      const chatId = cbq.message?.chat?.id;
      const messageId = cbq.message?.message_id;
      const { actionType, token, profitPct } = parseCallbackData(callbackData);
      const responseText = getResponseText(actionType);

      // 1. Answer callback query (removes loading spinner)
      try {
        await fetch(`${GATEWAY_URL}/answerCallbackQuery`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'X-Connection-Api-Key': TELEGRAM_API_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            callback_query_id: cbq.id,
            text: responseText,
            show_alert: actionType.includes('sell') || actionType.includes('execute'),
          }),
        });
      } catch (e) {
        console.error('answerCallbackQuery failed:', e);
      }

      // 2. Edit original message to show the action taken
      if (chatId && messageId) {
        const statusEmoji = actionType.includes('ignore') ? '❌' :
          actionType.includes('postpone') ? '⏸️' : '✅';
        try {
          await fetch(`${GATEWAY_URL}/editMessageReplyMarkup`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${LOVABLE_API_KEY}`,
              'X-Connection-Api-Key': TELEGRAM_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              chat_id: chatId,
              message_id: messageId,
              reply_markup: {
                inline_keyboard: [
                  [{ text: `${statusEmoji} ${responseText}`, callback_data: 'noop' }],
                ],
              },
            }),
          });
        } catch (e) {
          console.error('editMessageReplyMarkup failed:', e);
        }
      }

      // 3. Log to database
      try {
        await supabase.from('telegram_callback_log').insert({
          callback_data: callbackData,
          action_type: actionType,
          token: token || null,
          profit_pct: profitPct ?? null,
          message_id: messageId,
          status: actionType.includes('postpone') ? 'postponed' :
            actionType.includes('ignore') ? 'ignored' : 'executed',
        });
      } catch (e) {
        console.error('Failed to log callback:', e);
      }

      totalProcessed++;
    }

    // Advance offset
    const newOffset = Math.max(...updates.map((u: { update_id: number }) => u.update_id)) + 1;
    await supabase
      .from('telegram_bot_state')
      .update({ update_offset: newOffset, updated_at: new Date().toISOString() })
      .eq('id', 1);

    currentOffset = newOffset;
  }

  return new Response(JSON.stringify({ ok: true, processed: totalProcessed, finalOffset: currentOffset }));
});
