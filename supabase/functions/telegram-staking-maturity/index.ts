import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

// Staking/lending positions with yield conversion dates
const YIELD_SCHEDULE = [
  { symbol: 'ETH', protocol: 'Rocket Pool', type: 'staking', yieldDay: 15, yieldDirection: 'BTC' },
  { symbol: 'ETH', protocol: 'Lido (wstETH)', type: 'staking', yieldDay: 15, yieldDirection: 'BTC' },
  { symbol: 'ETH', protocol: 'Aave V3', type: 'lending', yieldDay: 15, yieldDirection: 'BTC' },
  { symbol: 'SOL', protocol: 'Jito', type: 'staking', yieldDay: 15, yieldDirection: 'BTC' },
  { symbol: 'SOL', protocol: 'Kamino', type: 'lending', yieldDay: 15, yieldDirection: 'BTC' },
];

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
    let maturityItems: any[] | undefined;

    try {
      const body = await req.json();
      chatId = body.chatId;
      maturityItems = body.maturityItems;
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

    // Determine what's due
    const now = new Date();
    const dayOfMonth = now.getUTCDate();
    const alerts: string[] = [];

    if (maturityItems && maturityItems.length > 0) {
      // Manual trigger with specific items
      for (const item of maturityItems) {
        alerts.push(
          `📌 <b>${item.symbol}</b> — ${item.protocol}\n` +
          `   Typ: ${item.type === 'staking' ? '🥩 Staking' : '🏦 Lending'}\n` +
          `   ${item.action || 'Konvertuj výnos do BTC'}`
        );
      }
    } else {
      // Auto/cron: check which yields are due
      for (const pos of YIELD_SCHEDULE) {
        if (pos.yieldDay > 0) {
          // Notify 1 day before and on the day
          if (dayOfMonth === pos.yieldDay - 1) {
            alerts.push(
              `⏰ <b>${pos.symbol}</b> — ${pos.protocol}\n` +
              `   Zajtra je deň konverzie výnosov do BTC!\n` +
              `   Priprav si objednávku.`
            );
          } else if (dayOfMonth === pos.yieldDay) {
            alerts.push(
              `🔔 <b>${pos.symbol}</b> — ${pos.protocol}\n` +
              `   Dnes konvertuj ${pos.type === 'staking' ? 'staking' : 'lending'} výnosy do BTC!\n` +
              `   → Predaj výnos → nakúp BTC`
            );
          }
        }
      }
    }

    if (alerts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No maturity alerts due' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = `🥩 <b>Staking & Lending Alert</b>\n\n${alerts.join('\n\n')}\n\n<i>Skontroluj svoje pozície!</i>`;

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
              { text: '✅ Vykonaj konverziu', callback_data: 'staking_execute' },
              { text: '⏸️ Odlož', callback_data: 'staking_postpone' },
            ],
            [
              { text: '❌ Ignoruj', callback_data: 'staking_ignore' },
            ],
          ],
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`Telegram API failed [${response.status}]: ${JSON.stringify(data)}`);

    return new Response(
      JSON.stringify({ success: true, sent: alerts.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending staking maturity alert:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
