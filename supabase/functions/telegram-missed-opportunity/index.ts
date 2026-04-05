import { corsHeaders } from '@supabase/supabase-js/cors'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    if (!TELEGRAM_API_KEY) throw new Error('TELEGRAM_API_KEY is not configured');

    const body = await req.json();
    const { chatId, missedItems } = body;

    if (!chatId || !Array.isArray(missedItems) || missedItems.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'chatId and missedItems required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const lines = missedItems.map((m: any) =>
      `🔴 <b>${m.symbol}</b> (${m.weekId})\n` +
      `   Limit: $${formatPrice(m.limitPrice)} → Aktuálna: $${formatPrice(m.currentPrice)}\n` +
      `   📈 +${m.gainPct.toFixed(1)}% — Zmeškaný zisk: <b>~$${m.missedGainUsd.toFixed(0)}</b>`
    );

    const totalMissed = missedItems.reduce((s: number, m: any) => s + m.missedGainUsd, 0);

    const text =
      `⚠️ <b>Zmeškaný zisk presiahol $50!</b>\n\n` +
      `${lines.join('\n\n')}\n\n` +
      `💰 Celkový zmeškaný zisk: <b>~$${totalMissed.toFixed(0)}</b>\n\n` +
      `<i>Zvýš rozpočet alebo nastav agresívnejšie limity.</i>`;

    const response = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TELEGRAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`Telegram API failed [${response.status}]: ${JSON.stringify(data)}`);

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending missed opportunity alert:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function formatPrice(p: number): string {
  if (p >= 1000) return p.toFixed(0);
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}
