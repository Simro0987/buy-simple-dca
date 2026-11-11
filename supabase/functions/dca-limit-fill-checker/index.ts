import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';
const COIN_CG: Record<string, string> = { BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana' };

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
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: pending } = await supabase
      .from('dca_executions')
      .select('*')
      .eq('kind', 'limit')
      .eq('status', 'PENDING');

    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ ok: true, checked: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ids = Array.from(new Set(pending.map((p: any) => COIN_CG[p.coin]).filter(Boolean))).join(',');
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`);
    if (!priceRes.ok) throw new Error('Failed to fetch prices');
    const prices = await priceRes.json();

    let filled = 0;
    for (const p of pending as any[]) {
      const cg = COIN_CG[p.coin];
      const cur = prices[cg]?.usd;
      if (!cur) continue;
      // Limit BUY fills when current price <= target price
      if (cur <= Number(p.target_price)) {
        const qty = Number(p.amount_usd) / cur;
        await supabase.from('dca_executions').update({
          status: 'FILLED',
          executed_price: cur,
          quantity: qty,
          filled_at: new Date().toISOString(),
        }).eq('id', p.id);

        // History BUY record (dedupe by note — client may also write it).
        const note = `DCA limit fill (${p.id})`;
        const { data: dup } = await supabase.from('token_transactions').select('id').eq('note', note).limit(1);
        if (!dup || dup.length === 0) {
          await supabase.from('token_transactions').insert({
            user_id: p.user_id, coingecko_id: COIN_CG[p.coin], symbol: p.coin, side: 'buy',
            quantity: qty, price_usd: cur, executed_at: new Date().toISOString(), note,
          });
        }

        await notifyTelegram(
          `🎯 <b>LIMIT NAPLNENÝ — ${p.coin}</b>\n` +
          `Suma: $${Number(p.amount_usd).toFixed(2)}\n` +
          `Cena: $${cur.toFixed(4)} (target $${Number(p.target_price).toFixed(4)})\n` +
          `Množstvo: ${qty.toFixed(6)} ${p.coin}\n` +
          `📊 Zapísané do portfólia.`
        );
        filled++;
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: pending.length, filled }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
