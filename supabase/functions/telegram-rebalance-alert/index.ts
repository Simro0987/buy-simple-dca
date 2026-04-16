import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    let chatId: string | undefined;
    let drifts: any[] | undefined;
    let actions: any[] | undefined;
    let totalValue: number | undefined;

    try {
      const body = await req.json();
      chatId = body.chatId;
      drifts = body.drifts;
      actions = body.actions;
      totalValue = body.totalValue;
    } catch {
      // cron trigger
    }

    if (!chatId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: config } = await supabase
        .from('telegram_config')
        .select('chat_id')
        .eq('id', 1)
        .single();

      if (!config?.chat_id) {
        return new Response(JSON.stringify({ success: false, error: 'No config' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      chatId = config.chat_id;
    }

    if (!chatId || chatId.trim() === '') {
      return new Response(JSON.stringify({ success: false, error: 'chatId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!drifts || drifts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No drifts to report' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lines: string[] = [];

    // Drift overview
    for (const d of drifts) {
      const icon = d.diff > 0 ? '📈' : '📉';
      const status = d.diff > 0 ? 'Prevážený' : 'Podvážený';
      lines.push(
        `${icon} <b>${d.symbol}</b> — ${status}\n` +
        `   Aktuálne: ${d.current.toFixed(1)}% → Cieľ: ${d.target}%\n` +
        `   Odchýlka: ${d.diff > 0 ? '+' : ''}${d.diff.toFixed(1)}%`
      );
    }

    // Transfer suggestions
    if (actions && actions.length > 0) {
      lines.push('\n📋 <b>Odporúčané presuny:</b>');
      for (const a of actions) {
        lines.push(`   → Presuň $${a.amount.toFixed(0)} z ${a.from} do ${a.to}`);
      }
    }

    const text = [
      `⚖️ <b>Rebalancing Alert</b>`,
      totalValue ? `\n💰 Celková hodnota: $${totalValue.toFixed(0)}` : '',
      '',
      ...lines,
      '',
      `<i>Len spot obchody — žiadna páka!</i>`,
    ].filter(Boolean).join('\n');

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
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Vykonaj rebalancing', callback_data: 'rebalance_execute' },
              { text: '⏸️ Odlož', callback_data: 'rebalance_postpone' },
            ],
            [
              { text: '❌ Ignoruj', callback_data: 'rebalance_ignore' },
            ],
          ],
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`Telegram API failed [${response.status}]: ${JSON.stringify(data)}`);

    return new Response(
      JSON.stringify({ success: true, sent: drifts.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending rebalance alert:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
