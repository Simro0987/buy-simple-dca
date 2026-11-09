// Portfolio alerts → Telegram.
// Body: { alerts: [{ symbol, kind: 'overheat' | 'takeprofit', overheat, pnlPct, tpPct, priceUsd }] }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

interface AlertItem {
  symbol: string;
  kind: 'overheat' | 'takeprofit';
  overheat?: number;
  pnlPct?: number;
  tpPct?: number;
  priceUsd?: number;
}

const fmt = (n: number, d = 2) => n.toFixed(d).replace('.', ',');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // ── Auth guard: shared edge secret (cron) or valid user JWT ──
  {
    const edgeSecret = Deno.env.get('EDGE_FUNCTION_SECRET') ?? '';
    const providedSecret = req.headers.get('x-edge-secret') ?? '';
    const secretOk = edgeSecret.length > 0 && providedSecret === edgeSecret;
    if (!secretOk) {
      const authHeader = req.headers.get('authorization') ?? '';
      if (!authHeader.toLowerCase().startsWith('bearer ')) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const verify = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
        headers: { Authorization: authHeader, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
      });
      if (!verify.ok) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    if (!TELEGRAM_API_KEY) throw new Error('TELEGRAM_API_KEY is not configured');

    let body: { alerts?: AlertItem[]; chatId?: string } = {};
    try { body = await req.json(); } catch { /* empty body */ }

    const alerts = (body.alerts ?? []).filter(
      (a) => a && typeof a.symbol === 'string' && (a.kind === 'overheat' || a.kind === 'takeprofit'),
    ).slice(0, 20);

    if (alerts.length === 0) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no alerts' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let chatId = body.chatId;
    if (!chatId) {
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );
      const { data: config } = await supabase
        .from('telegram_config')
        .select('chat_id')
        .eq('id', 1)
        .maybeSingle();
      chatId = config?.chat_id ?? undefined;
    }
    if (!chatId || chatId.trim() === '') {
      return new Response(JSON.stringify({ success: false, error: 'chatId is required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const lines = alerts.map((a) => {
      if (a.kind === 'overheat') {
        return `🌡 <b>${a.symbol}</b> — kritický Overheat ${fmt(Number(a.overheat ?? 0), 0)}/100\n` +
          `   Cena: $${fmt(Number(a.priceUsd ?? 0))} · PnL ${fmt(Number(a.pnlPct ?? 0), 1)} %\n` +
          `   ➜ Zváž výber zisku podľa Harvest plánu.`;
      }
      return `🎯 <b>${a.symbol}</b> — dosiahnutý Take-Profit cieľ\n` +
        `   PnL ${fmt(Number(a.pnlPct ?? 0), 1)} % · TP ${fmt(Number(a.tpPct ?? 0), 2)} %\n` +
        `   Cena: $${fmt(Number(a.priceUsd ?? 0))}\n` +
        `   ➜ Vyber podiel a smeruj podľa routingu.`;
    });

    const text = `📊 <b>Portfólio · upozornenie</b>\n\n${lines.join('\n\n')}`;

    const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TELEGRAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });

    if (!res.ok) {
      const details = await res.text();
      console.error(`Telegram gateway failed [${res.status}]: ${details}`);
      return new Response(JSON.stringify({ error: 'Telegram request failed', status: res.status, details }), {
        status: res.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const json = await res.json();
    if (json?.ok === false) {
      console.error('Telegram error:', json);
      return new Response(JSON.stringify({ error: json.error ?? 'telegram_error', details: json }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, sent: alerts.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('telegram-portfolio-alert error:', e);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
