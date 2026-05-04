import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

function getMondayWeek(d = new Date()): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

async function notifyTelegram(text: string) {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return;
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await supabase.from('telegram_config').select('chat_id').eq('id', 1).single();
  if (!cfg?.chat_id) return;
  await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': TELEGRAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chat_id: cfg.chat_id, text, parse_mode: 'HTML' }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { coin, kind, amount_usd, target_price } = body as {
      coin: 'btc'|'eth'|'sol'; kind: 'market'|'limit'; amount_usd: number; target_price: number;
    };
    if (!coin || !kind || !amount_usd || !target_price) {
      return new Response(JSON.stringify({ error: 'Missing fields' }), { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const week = getMondayWeek();

    if (kind === 'market') {
      const qty = amount_usd / target_price;
      await supabase.from('dca_executions').insert({
        week_number: week, coin: coin.toUpperCase(), kind, amount_usd,
        target_price, executed_price: target_price, quantity: qty,
        status: 'EXECUTED', filled_at: new Date().toISOString(),
      });
      // Update manual_holdings
      const { data: s } = await supabase.from('app_settings').select('id, manual_holdings').limit(1).maybeSingle();
      if (s) {
        const mh = (s.manual_holdings ?? {}) as Record<string, number>;
        mh[coin] = Number(mh[coin] ?? 0) + qty;
        await supabase.from('app_settings').update({ manual_holdings: mh }).eq('id', s.id);
      }
      await notifyTelegram(
        `✅ <b>MARKET vykonaný — ${coin.toUpperCase()}</b>\n` +
        `Suma: $${amount_usd.toFixed(2)}\n` +
        `Cena: $${target_price.toFixed(4)}\n` +
        `Množstvo: ${qty.toFixed(6)} ${coin.toUpperCase()}\n` +
        `📊 Zapísané do portfólia.`
      );
      return new Response(JSON.stringify({ ok: true, quantity: qty }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // LIMIT — pending, fill checker will resolve
    await supabase.from('dca_executions').insert({
      week_number: week, coin: coin.toUpperCase(), kind, amount_usd,
      target_price, status: 'PENDING',
    });
    await notifyTelegram(
      `🟡 <b>LIMIT zadaný — ${coin.toUpperCase()}</b>\n` +
      `Suma: $${amount_usd.toFixed(2)} @ $${target_price.toFixed(4)}\n` +
      `⏳ Sleduje sa cena…`
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
