const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

const TOKENS = [
  { symbol: 'BTC', allocation: 0.59, limitDiscount: 0.97, coingeckoId: 'bitcoin' },
  { symbol: 'ETH', allocation: 0.25, limitDiscount: 0.96, coingeckoId: 'ethereum' },
  { symbol: 'SOL', allocation: 0.11, limitDiscount: 0.95, coingeckoId: 'solana' },
  { symbol: 'HYPE', allocation: 0.05, limitDiscount: 0.90, coingeckoId: 'hyperliquid' },
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

    const { chatId, budget } = await req.json();
    if (!chatId) {
      return new Response(JSON.stringify({ success: false, error: 'chatId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const weeklyBudget = budget || 100;

    // Fetch live prices
    const ids = TOKENS.map(t => t.coingeckoId).join(',');
    const priceRes = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
    );
    if (!priceRes.ok) throw new Error('Failed to fetch prices');
    const prices = await priceRes.json();

    const lines = TOKENS.map(token => {
      const price = prices[token.coingeckoId]?.usd ?? 0;
      const totalUsd = weeklyBudget * token.allocation;
      const marketUsd = totalUsd * 0.60;
      const limitUsd = totalUsd * 0.40;
      const limitPrice = price * token.limitDiscount;
      const marketQty = price > 0 ? marketUsd / price : 0;
      const limitQty = price > 0 ? limitUsd / limitPrice : 0;

      return [
        `<b>${token.symbol}</b> — $${totalUsd.toFixed(2)}`,
        `  🟢 Market: $${marketUsd.toFixed(2)} (${formatQty(marketQty, token.symbol)})`,
        `  🟡 Limit: $${limitUsd.toFixed(2)} @ $${formatPrice(limitPrice)} (${formatQty(limitQty, token.symbol)})`,
      ].join('\n');
    });

    const text = [
      `📅 <b>Týždenný DCA – $${weeklyBudget}</b>`,
      '',
      ...lines,
      '',
      `💡 <i>60% market · 40% limit</i>`,
    ].join('\n');

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
    console.error('Error sending DCA reminder:', error);
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

function formatQty(q: number, symbol: string): string {
  if (symbol === 'BTC') return q.toFixed(6) + ' BTC';
  if (symbol === 'ETH') return q.toFixed(5) + ' ETH';
  return q.toFixed(2) + ' ' + symbol;
}
