// Daily 08:00 DCA audit report — consumes market-data-service + fear/greed
// and pushes a Unicode terminal-style report to the Telegram channel.
// Graceful: never throws; on failure logs and returns 200 with skipped=true.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

interface MarketData {
  btc: { ma200w: number; mayerMultiple: number; ma200d: number; price: number; realizedPrice: number; miningCost: number };
  eth: { ma200w: number };
  sol: { tvl: number };
  unlocks: Array<{ symbol: string; pct: number; date: string }>;
  degraded?: boolean;
}

async function safeJson<T>(url: string, init?: RequestInit, fallback?: T): Promise<T | undefined> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return fallback;
    return await res.json() as T;
  } catch { return fallback; }
}

function zone(mayer: number, distance200w: number): string {
  if (distance200w < 0 || mayer < 0.9) return 'MACRO SUPPORT';
  if (mayer > 2.4) return 'OVERHEATED';
  if (mayer < 1.1) return 'HARD ACCUMULATION';
  return 'NEUTRAL';
}

function riskScore(mayer: number, fg: number): number {
  // 1 = deep buy, 10 = extreme greed
  const m = Math.max(0, Math.min(10, (mayer - 0.6) * 4)); // ~0.6→0, ~3.1→10
  const f = (fg / 100) * 10;
  return Math.round(Math.max(1, Math.min(10, (m + f) / 2)));
}

function matrixSplit(fg: number): { mkt: number; dyn: number } {
  if (fg <= 30) return { mkt: 70, dyn: 30 };
  if (fg >= 75) return { mkt: 20, dyn: 80 };
  const t = (fg - 30) / 45;
  const mkt = Math.round(70 - t * 50);
  return { mkt, dyn: 100 - mkt };
}

function status(risk: number, zoneName: string): string {
  if (zoneName === 'OVERHEATED' || risk >= 8) return 'ABORT';
  if (zoneName === 'MACRO SUPPORT' || risk <= 3) return 'BUY';
  return 'WAIT';
}

function fmt(n: number, d = 0): string {
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function buildReport(md: MarketData, fg: number, btcPrice: number): string {
  const distance200w = md.btc.ma200w > 0 ? ((btcPrice - md.btc.ma200w) / md.btc.ma200w) * 100 : 0;
  const rsiProxy = Math.round(50 + distance200w / 2); // rough proxy
  const z = zone(md.btc.mayerMultiple, distance200w);
  const risk = riskScore(md.btc.mayerMultiple, fg);
  const split = matrixSplit(fg);
  const st = status(risk, z);
  const unlockFlag = md.unlocks.length > 0 ? '🔴' : '🟢';

  return [
    '<pre>',
    '╔══════════════════════════════════════╗',
    '║   📊 DCA AUDIT — DAILY 08:00 UTC    ║',
    '╚══════════════════════════════════════╝',
    `🛡️ RISK SCORE: ${risk}/10  |  FEAR & GREED: ${fg}/100`,
    `─────────────────────────────────────`,
    `• ZÓNA: ${z}`,
    `• 200WMA DIST / RSI: ${distance200w.toFixed(1)}% / ${rsiProxy}`,
    `• UNLOCK/INFLOW PRESS: ${unlockFlag}${md.unlocks.length ? ' (' + md.unlocks.map(u => u.symbol).join(',') + ')' : ''}`,
    `• MATRIX SPLIT: MKT ${split.mkt}% / DYN ${split.dyn}%`,
    `• MAYER: ${md.btc.mayerMultiple.toFixed(2)}  |  BTC: $${fmt(btcPrice)}`,
    `• 200WMA BTC: $${fmt(md.btc.ma200w)}  ETH: $${fmt(md.eth.ma200w)}`,
    `• SOL TVL: $${fmt(md.sol.tvl / 1e9, 2)}B`,
    `─────────────────────────────────────`,
    `🟢 STATUS: ${st}`,
    md.degraded ? '⚠️ Degraded mode — používajú sa cached/fallback dáta.' : '',
    '</pre>',
  ].filter(Boolean).join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) {
      return new Response(JSON.stringify({ skipped: true, reason: 'telegram not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Resolve chat id (manual override via body, otherwise config table)
    let chatId: string | undefined;
    try { chatId = (await req.json())?.chatId; } catch { /* cron */ }
    if (!chatId) {
      const supabase = createClient(supabaseUrl, serviceKey);
      const { data: cfg } = await supabase.from('telegram_config').select('chat_id').eq('id', 1).single();
      chatId = cfg?.chat_id;
    }
    if (!chatId) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no chat_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const base = supabaseUrl.replace(/\/$/, '');
    const md = await safeJson<MarketData>(`${base}/functions/v1/market-data-service`, undefined, {
      btc: { ma200w: 48500, mayerMultiple: 1.15, ma200d: 0, price: 0, realizedPrice: 53600, miningCost: 50000 },
      eth: { ma200w: 2350 }, sol: { tvl: 11_500_000_000 }, unlocks: [], degraded: true,
    });
    const fg = await safeJson<{ data: Array<{ value: string }> }>('https://api.alternative.me/fng/?limit=1', undefined, { data: [{ value: '50' }] });
    const fgVal = parseInt(fg?.data?.[0]?.value ?? '50', 10);
    const cg = await safeJson<{ bitcoin?: { usd?: number } }>('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd', undefined, {});
    const btcPrice = cg?.bitcoin?.usd ?? md!.btc.price ?? 0;

    const text = buildReport(md!, fgVal, btcPrice);

    const tgRes = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TELEGRAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const tgData = await tgRes.json().catch(() => ({}));
    if (!tgRes.ok) {
      return new Response(JSON.stringify({ success: false, status: tgRes.status, telegram: tgData }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
