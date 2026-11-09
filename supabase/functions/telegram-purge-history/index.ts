import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

/**
 * "VYMAZAŤ VŠETKO" — purge signal.
 * Deletes every message the bot has sent (tracked message IDs), plus a
 * best-effort sweep of recent message IDs below the newest tracked one,
 * and clears local notification/callback logs.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // ── Auth guard (shared cron secret OR valid user JWT) ──
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
    }
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    if (!TELEGRAM_API_KEY) throw new Error('TELEGRAM_API_KEY is not configured');

    const body = await req.json().catch(() => ({}));
    const sweepRaw = Number(body.sweep);
    // How many message IDs below the newest tracked ID to also try deleting.
    const sweep = Number.isFinite(sweepRaw) ? Math.max(0, Math.min(300, sweepRaw)) : 100;

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

    const del = async (messageId: number): Promise<boolean> => {
      const res = await fetch(`${GATEWAY_URL}/deleteMessage`, {
        method: 'POST',
        headers: tgHeaders,
        body: JSON.stringify({ chat_id: chatId, message_id: messageId }),
      });
      if (!res.ok) return false;
      const j = await res.json().catch(() => null);
      return Boolean(j?.ok);
    };

    const { data: tracked } = await supabase
      .from('telegram_sent_messages')
      .select('id, message_id')
      .eq('chat_id', chatId);

    const ids = (tracked ?? []).map((r) => Number(r.message_id)).filter(Number.isFinite);
    let deleted = 0;
    for (const id of ids) {
      if (await del(id)) deleted++;
    }

    // Best-effort sweep for untracked older bot messages.
    let sweptDeleted = 0;
    if (sweep > 0) {
      const newest = ids.length > 0 ? Math.max(...ids) : 0;
      if (newest > 0) {
        for (let id = newest - 1; id > Math.max(0, newest - sweep); id--) {
          if (ids.includes(id)) continue;
          if (await del(id)) sweptDeleted++;
        }
      }
    }

    // Clear local logs / notification stack.
    await supabase.from('telegram_sent_messages').delete().eq('chat_id', chatId);
    const { count: logCount } = await supabase
      .from('telegram_callback_log')
      .delete({ count: 'exact' })
      .not('id', 'is', null);

    return new Response(
      JSON.stringify({
        success: true,
        trackedDeleted: deleted,
        trackedTotal: ids.length,
        sweptDeleted,
        logsCleared: logCount ?? 0,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('telegram-purge-history error:', msg);
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
