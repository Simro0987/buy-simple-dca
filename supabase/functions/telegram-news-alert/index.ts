import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

const PORTFOLIO_TOKENS = ['BTC', 'ETH', 'SOL'];

const HIGH_IMPACT_KEYWORDS = [
  'hack', 'exploit', 'breach', 'sec', 'etf', 'ban', 'regulation', 'crash',
  'halving', 'lawsuit', 'arrest', 'fraud', 'bankruptcy', 'blackrock',
  'fed', 'rate', 'approval', 'reject', 'emergency', 'attack', 'vulnerability',
];

function detectTokens(text: string): string[] {
  const upper = text.toUpperCase();
  const found: string[] = [];
  if (/\bBTC\b/.test(upper) || /\bBITCOIN\b/.test(upper)) found.push('BTC');
  if (/\bETH\b/.test(upper) || /\bETHEREUM\b/.test(upper)) found.push('ETH');
  if (/\bSOL\b/.test(upper) || /\bSOLANA\b/.test(upper)) found.push('SOL');
  return found;
}

function isHighImpact(title: string): boolean {
  const lower = title.toLowerCase();
  return HIGH_IMPACT_KEYWORDS.some(k => lower.includes(k));
}

function isRelevant(title: string): boolean {
  const tokens = detectTokens(title);
  return tokens.some(t => PORTFOLIO_TOKENS.includes(t)) || isHighImpact(title);
}

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
    let news: Array<Record<string, unknown>> | undefined;

    // Try reading body (manual trigger from UI sends news directly)
    try {
      const body = await req.json();
      chatId = body.chatId;
      news = body.news;
    } catch {
      // No body — cron trigger
    }

    // If no chatId, read from telegram_config
    if (!chatId) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const { data: config, error: cfgErr } = await supabase
        .from('telegram_config')
        .select('chat_id, news_alert_enabled')
        .eq('id', 1)
        .single();

      if (cfgErr || !config) {
        return new Response(JSON.stringify({ success: false, error: 'No config found' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!config.news_alert_enabled) {
        return new Response(JSON.stringify({ success: true, skipped: true, reason: 'News alerts disabled' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      chatId = config.chat_id;
    }

    if (!chatId || chatId.trim() === '') {
      return new Response(JSON.stringify({ success: false, error: 'chatId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // If no news provided (cron trigger), fetch from CryptoPanic
    if (!news || !Array.isArray(news) || news.length === 0) {
      const CRYPTOPANIC_API_KEY = Deno.env.get('CRYPTOPANIC_API_KEY');
      if (!CRYPTOPANIC_API_KEY) throw new Error('CRYPTOPANIC_API_KEY is not configured');

      const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${CRYPTOPANIC_API_KEY}&filter=hot&currencies=BTC,ETH,SOL&kind=news&public=true`;
      const cpRes = await fetch(url);
      if (!cpRes.ok) throw new Error(`CryptoPanic API failed [${cpRes.status}]`);
      const cpData = await cpRes.json();

      const results = cpData.results || [];

      // Filter high-impact and relevant news from last hour
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      news = results
        .filter((item: { published_at: string; title?: string }) => {
          const pubDate = new Date(item.published_at).getTime();
          if (pubDate < oneHourAgo) return false;
          const title = item.title || '';
          return isHighImpact(title) || isRelevant(title);
        })
        .slice(0, 5)
        .map((item: { title?: string; url?: string; votes?: { positive?: number; negative?: number } }) => ({
          title: item.title,
          url: item.url,
          tokens: detectTokens(item.title || ''),
          sentiment: (item.votes?.positive ?? 0) > (item.votes?.negative ?? 0) ? 'bullish'
            : (item.votes?.negative ?? 0) > (item.votes?.positive ?? 0) ? 'bearish' : 'neutral',
        }));
    }

    if (!news || news.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: 'No high-impact news in last hour' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format message
    const lines = news.map((item: Record<string, unknown> & { sentiment?: string; tokens?: string[]; summary?: string; title?: string; url?: string }) => {
      const sentimentEmoji = item.sentiment === 'bullish' ? '🟢' : item.sentiment === 'bearish' ? '🔴' : '⚪';
      const tokens = item.tokens?.join(', ') || '';
      const summaryLine = item.summary ? `\n<i>${item.summary}</i>` : '';
      return `${sentimentEmoji} <b>[${tokens}]</b>\n${item.title}${summaryLine}\n<a href="${item.url}">Čítať viac →</a>`;
    });

    const text = `🚨 <b>Vysoký dopad – Crypto novinky</b>\n\n${lines.join('\n\n')}`;

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
              { text: '📊 Analyzuj dopad', callback_data: 'news_analyze' },
              { text: '🔕 Stíšiť', callback_data: 'news_mute' },
            ],
            [
              { text: '❌ Ignoruj', callback_data: 'news_ignore' },
            ],
          ],
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(`Telegram API failed [${response.status}]: ${JSON.stringify(data)}`);

    return new Response(
      JSON.stringify({ success: true, sent: news.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error sending news alert:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
