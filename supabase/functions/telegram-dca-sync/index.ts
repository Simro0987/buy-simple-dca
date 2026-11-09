import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

const TOKENS = ['BTC', 'ETH', 'SOL', 'HYPE', 'LINK', 'AAVE'];
const LEGS = ['market', 'limit'];
const ACTIONS = ['activate', 'cancel'];

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number, dec = 2): string {
  return n.toFixed(dec).replace('.', ',');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Auth guard (shared cron secret OR valid user JWT) ──
  let userId: string | null = null;
  {
    const edgeSecret = Deno.env.get('EDGE_FUNCTION_SECRET') ?? '';
    const providedSecret = req.headers.get('x-edge-secret') ?? '';
    const secretOk = edgeSecret.length > 0 && providedSecret === edgeSecret;
    if (!secretOk) {
      const authHeader = req.headers.get('authorization') ?? '';
      if (!authHeader.toLowerCase().startsWith('bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const verify = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
        headers: { Authorization: authHeader, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
      });
      if (!verify.ok) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const u = await verify.json().catch(() => null);
      userId = u?.id ?? null;
    }
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    if (!TELEGRAM_API_KEY) throw new Error('TELEGRAM_API_KEY is not configured');

    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? '').toUpperCase();
    const leg = String(body.leg ?? '').toLowerCase();
    const action = String(body.action ?? '').toLowerCase();

    if (!TOKENS.includes(token) || !LEGS.includes(leg) || !ACTIONS.includes(action)) {
      return new Response(
        JSON.stringify({ error: 'Invalid token, leg or action' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const usd = num(body.usd);
    const price = num(body.price);
    const activeUntil = num(body.activeUntil);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let chatId: string | null = typeof body.chatId === 'string' && body.chatId ? body.chatId : null;
    if (!chatId) {
      const { data: cfg } = await supabase
        .from('telegram_config')
        .select('chat_id')
        .eq('id', 1)
        .maybeSingle();
      chatId = cfg?.chat_id ?? null;
    }
    if (!chatId) {
      return new Response(JSON.stringify({ success: false, error: 'No chat_id configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const tgHeaders = {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': TELEGRAM_API_KEY,
      'Content-Type': 'application/json',
    };

    // ── Cancel: wipe previous notifications for this token/leg ──
    const { data: prev } = await supabase
      .from('telegram_sent_messages')
      .select('id, message_id')
      .eq('chat_id', chatId)
      .eq('token', token)
      .eq('leg', leg);

    let deleted = 0;
    for (const row of prev ?? []) {
      const res = await fetch(`${GATEWAY_URL}/deleteMessage`, {
        method: 'POST',
        headers: tgHeaders,
        body: JSON.stringify({ chat_id: chatId, message_id: row.message_id }),
      });
      if (res.ok) deleted++;
    }
    if ((prev ?? []).length > 0) {
      await supabase
        .from('telegram_sent_messages')
        .delete()
        .in('id', (prev ?? []).map((r) => r.id));
    }

    if (action === 'cancel') {
      return new Response(JSON.stringify({ success: true, cleared: deleted }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const legLabel = leg === 'market' ? 'MARKET' : 'LIMIT';
    const until = activeUntil
      ? new Date(activeUntil).toLocaleDateString('sk-SK', { day: '2-digit', month: '2-digit' })
      : null;

    const lines = [
      `⚡️ <b>${token} · ${legLabel} AKTIVOVANÝ</b>`,
      usd !== null ? `Suma: <b>$${fmt(usd)}</b>` : null,
      price !== null ? `Cena: <b>$${fmt(price, price < 10 ? 4 : 2)}</b>` : null,
      until ? `Aktívne do: <b>${until}</b>` : null,
      '',
      '<i>Zrušením príkazu v aplikácii sa táto správa automaticky vymaže.</i>',
    ].filter(Boolean);

    const send = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: 'POST',
      headers: tgHeaders,
      body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML' }),
    });

    if (!send.ok) {
      const details = await send.text();
      console.error(`Telegram sendMessage failed [${send.status}]: ${details}`);
      return new Response(JSON.stringify({ success: false, status: send.status, details }),
        { status: send.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const payload = await send.json();
    if (!payload?.ok) {
      console.error('Telegram sendMessage error body:', JSON.stringify(payload));
      return new Response(JSON.stringify({ success: false, details: payload }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabase.from('telegram_sent_messages').insert({
      user_id: userId,
      chat_id: chatId,
      message_id: payload.result.message_id,
      kind: 'dca',
      token,
      leg,
    });

    return new Response(JSON.stringify({ success: true, messageId: payload.result.message_id, cleared: deleted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('telegram-dca-sync error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
