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

    const body = await req.json();
    const { chatId, token, profitPct, sellPct, currentPrice, avgCost, sellUsd, toBtcUsd, toStableUsd, btcPct } = body;

    if (!chatId || !token || profitPct === undefined) {
      return new Response(
        JSON.stringify({ success: false, error: 'chatId, token, profitPct are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const profitPctStr = profitPct.toFixed(1);
    const priceStr = formatPrice(currentPrice);
    const avgStr = formatPrice(avgCost);

    const text = [
      `🎯 <b>Profit Alert — ${token}</b>`,
      ``,
      `📈 Zisk dosiahol <b>+${profitPctStr}%</b>`,
      `💰 Aktuálna cena: <b>$${priceStr}</b>`,
      `📊 Priemerná cena: $${avgStr}`,
      ``,
      `📋 <b>Akcia: Predaj ${sellPct}% ${token}</b>`,
      sellUsd ? `   💵 Hodnota predaja: <b>${formatUsd(sellUsd)}</b>` : '',
      toBtcUsd ? `   🪙 ${btcPct}% → BTC: ${formatUsd(toBtcUsd)}` : '',
      toStableUsd ? `   💲 ${100 - btcPct}% → Stablecoin: ${formatUsd(toStableUsd)}` : '',
      ``,
      `⚠️ <i>Dodržuj stratégiu, nepreskakuj levely!</i>`,
    ].filter(Boolean).join('\n');

    const inline_keyboard = [
      [
        { text: '✅ Predaj', callback_data: `profit_sell_${token}_${profitPct}` },
        { text: '⏸️ Odlož', callback_data: `profit_postpone_${token}_${profitPct}` },
        { text: '❌ Ignoruj', callback_data: `profit_ignore_${token}_${profitPct}` },
      ],
    ];

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
        reply_markup: { inline_keyboard },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(`Telegram API failed [${response.status}]: ${JSON.stringify(data)}`);
    }

    return new Response(
      JSON.stringify({ success: true, message_id: data.result?.message_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending profit alert:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function formatPrice(p: number): string {
  if (p >= 1000) return p.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  if (p >= 1) return p.toFixed(2);
  return p.toFixed(4);
}

function formatUsd(v: number): string {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
