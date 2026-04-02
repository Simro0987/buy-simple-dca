const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

const TOKENS = [
  { symbol: 'BTC', limitDiscount: 0.97, coingeckoId: 'bitcoin' },
  { symbol: 'ETH', limitDiscount: 0.96, coingeckoId: 'ethereum' },
  { symbol: 'SOL', limitDiscount: 0.95, coingeckoId: 'solana' },
  { symbol: 'HYPE', limitDiscount: 0.90, coingeckoId: 'hyperliquid' },
];

const PROXIMITY_THRESHOLD = 0.03; // 3%

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY is not configured');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    if (!TELEGRAM_API_KEY) throw new Error('TELEGRAM_API_KEY is not configured');

    const { chatId, limitPrices } = await req.json();
    if (!chatId) {
      return new Response(JSON.stringify({ success: false, error: 'chatId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch live prices
    const ids = TOKENS.map(t => t.coingeckoId).join(',');
    const priceRes = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    );
    if (!priceRes.ok) throw new Error('Failed to fetch prices');
    const prices = await priceRes.json();

    // Check proximity for each token
    const alerts: string[] = [];
    for (const token of TOKENS) {
      const currentPrice = prices[token.coingeckoId]?.usd ?? 0;
      if (currentPrice === 0) continue;

      // Use custom limit prices if provided, otherwise calculate from discount
      const limitPrice = limitPrices?.[token.symbol] || (currentPrice * token.limitDiscount);
      
      // Only alert if price is ABOVE limit (approaching from above) and within threshold
      if (currentPrice > limitPrice) {
        const distancePct = (currentPrice - limitPrice) / currentPrice;
        if (distancePct <= PROXIMITY_THRESHOLD) {
          const pctStr = (distancePct * 100).toFixed(1);
          alerts.push(
            `⚡ <b>${token.symbol}</b> je ${pctStr}% od tvojho limitu!\n` +
            `   Aktuálna: $${formatPrice(currentPrice)}\n` +
            `   Limit: $${formatPrice(limitPrice)}`
          );
        }
      }
    }

    if (alerts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No tokens near limit prices' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const text = `🎯 <b>Limit Proximity Alert</b>\n\n${alerts.join('\n\n')}\n\n<i>Cena sa blíži k tvojmu limit orderu!</i>`;

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
      JSON.stringify({ success: true, sent: alerts.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending price alert:', error);
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
