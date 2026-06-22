/**
 * Generic Telegram message sender.
 * Uses TELEGRAM_BOT_TOKEN + direct Bot API, or falls back to Lovable connector gateway.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

async function sendViaBotApi(token: string, chatId: string, text: string, parseMode: string) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

async function sendViaGateway(apiKey: string, lovableKey: string, chatId: string, text: string, parseMode: string) {
  const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      'X-Connection-Api-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data, status: res.status };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const text = String(body.text ?? '');
    const parseMode = String(body.parse_mode ?? 'Markdown');
    let chatId = String(body.chatId ?? body.chat_id ?? '').trim();

    if (!text) {
      return new Response(JSON.stringify({ success: false, error: 'text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!chatId) {
      chatId = Deno.env.get('TELEGRAM_CHAT_ID')?.trim() ?? '';
    }

    if (!chatId) {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: cfg } = await supabase.from('telegram_config').select('chat_id').eq('id', 1).single();
      chatId = cfg?.chat_id?.trim() ?? '';
    }

    if (!chatId) {
      return new Response(JSON.stringify({ success: false, skipped: true, reason: 'no_chat_id' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')?.trim();
    let result;

    if (botToken) {
      result = await sendViaBotApi(botToken, chatId, text, parseMode);
    } else {
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
      if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
        return new Response(JSON.stringify({ success: false, skipped: true, reason: 'telegram not configured' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      result = await sendViaGateway(TELEGRAM_API_KEY, LOVABLE_API_KEY, chatId, text, parseMode);
    }

    if (!result.ok) {
      console.error('[telegram-send-message] failed:', result.status, result.data);
      return new Response(JSON.stringify({ success: false, error: JSON.stringify(result.data) }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const messageId = result.data?.result?.message_id ?? result.data?.message_id;
    return new Response(JSON.stringify({ success: true, message_id: messageId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[telegram-send-message] error:', e);
    return new Response(JSON.stringify({ success: false, error: String(e) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
