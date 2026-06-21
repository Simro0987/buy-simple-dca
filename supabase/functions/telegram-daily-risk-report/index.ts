/**
 * Daily portfolio risk report — server-side generation + Telegram (cron 19:00 SEČ).
 * Spúšťa sa z pg_cron každú hodinu; odosiela len v 19:00 Europe/Bratislava.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';
const REPORT_TZ = 'Europe/Bratislava';
const REPORT_HOUR = 19;

const TOKENS = [
  { symbol: 'BTC', allocation: 0.64, coingeckoId: 'bitcoin', key: 'btc' },
  { symbol: 'ETH', allocation: 0.25, coingeckoId: 'ethereum', key: 'eth' },
  { symbol: 'SOL', allocation: 0.11, coingeckoId: 'solana', key: 'sol' },
] as const;

function zonedParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: REPORT_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  return {
    hour: Number(parts.find(p => p.type === 'hour')?.value ?? 0),
    minute: Number(parts.find(p => p.type === 'minute')?.value ?? 0),
    dateKey: new Intl.DateTimeFormat('en-CA', { timeZone: REPORT_TZ }).format(d),
  };
}

function fmtUsd(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtPrice(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function calcRSI(closes: number[]): number {
  const p = 14;
  if (closes.length < p + 1) return 50;
  const sl = closes.slice(-(p + 1));
  let g = 0, l = 0;
  for (let i = 1; i < sl.length; i++) { const d = sl[i] - sl[i - 1]; d > 0 ? g += d : l -= d; }
  const ag = g / p, al = l / p;
  if (al === 0) return 99;
  return Math.round(Math.max(0, Math.min(100, 100 - 100 / (1 + ag / al))));
}

function liveRiskScore(fg: number, rsi: number, pnlPct: number): number {
  return (fg * 0.4) + (rsi * 0.4) + (pnlPct * 0.2);
}

async function sendTelegram(chatId: string, text: string): Promise<boolean> {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN')?.trim();
  if (botToken) {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
    return res.ok;
  }
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
  if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY) return false;
  const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': TELEGRAM_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
  });
  return res.ok;
}

function buildTelegramText(data: {
  dateKey: string;
  totalValue: number;
  totalPnl: number;
  totalPnlPct: number;
  pnl24h: number;
  fg: number;
  liveScore: number;
  assets: Array<{ sym: string; value: number; pct: number; target: number; wacb: number; spot: number; pnlPct: number }>;
  alerts: string[];
  conservative: string;
  summary: string;
}): string {
  return [
    `*📊 DENNÝ ANALYTICKÝ REPORT · PORTFÓLIO*`,
    `_${data.dateKey} · server cron_`,
    '',
    `*▸ Executive Summary*`,
    data.summary,
    '',
    `*▸ Prehľad*`,
    `• Hodnota: *${fmtUsd(data.totalValue)}*`,
    `• 24H PnL: ${data.pnl24h >= 0 ? '+' : ''}${fmtUsd(data.pnl24h)}`,
    `• Kum. PnL: ${data.totalPnl >= 0 ? '+' : ''}${fmtUsd(data.totalPnl)} (${data.totalPnlPct >= 0 ? '+' : ''}${data.totalPnlPct.toFixed(2)} %)`,
    '',
    `*▸ Alokácia*`,
    ...data.assets.map(a => `• *${a.sym}*: ${fmtUsd(a.value)} · ${a.pct.toFixed(1)} %`),
    '',
    `*▸ WACB vs Spot*`,
    ...data.assets.map(a => `• *${a.sym}*: WACB ${fmtUsd(a.wacb)} · Spot ${fmtUsd(a.spot)} · PnL ${a.pnlPct >= 0 ? '+' : ''}${a.pnlPct.toFixed(1)} %`),
    '',
    `*▸ Riziko*`,
    `• F&G: *${data.fg}* · LiveRiskScore: *${data.liveScore.toFixed(1)}*`,
    '',
    `*▸ Koncentrácia*`,
    ...(data.alerts.length ? data.alerts.map(a => `⚠️ ${a}`) : ['✓ V limite']),
    '',
    `*▸ Konzervatívne aktívum*`,
    data.conservative,
    '',
    `_Report · auto 19:00 SEČ_`,
  ].join('\n');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let force = false;
    let prebuiltText: string | undefined;
    try {
      const body = await req.json();
      force = Boolean(body?.force);
      prebuiltText = body?.text;
    } catch { /* cron */ }

    const now = new Date();
    const { hour, dateKey } = zonedParts(now);

    const { data: cfg } = await supabase
      .from('telegram_config')
      .select('chat_id, daily_report_enabled, last_daily_report_date')
      .eq('id', 1)
      .single();

    if (!cfg?.daily_report_enabled && !force) {
      return new Response(JSON.stringify({ skipped: true, reason: 'disabled' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!force && hour !== REPORT_HOUR) {
      return new Response(JSON.stringify({ skipped: true, reason: 'not_report_hour', hour }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!force && cfg?.last_daily_report_date === dateKey) {
      return new Response(JSON.stringify({ skipped: true, reason: 'already_sent_today' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let chatId = cfg?.chat_id?.trim() || Deno.env.get('TELEGRAM_CHAT_ID')?.trim() || '';
    if (!chatId) {
      return new Response(JSON.stringify({ skipped: true, reason: 'no_chat_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let text = prebuiltText;
    if (!text) {
      const [{ data: purchases }, { data: settings }] = await Promise.all([
        supabase.from('dca_purchases').select('*').order('created_at', { ascending: true }),
        supabase.from('app_settings').select('manual_holdings, initial_cost_basis').limit(1).maybeSingle(),
      ]);

      const manual = (settings?.manual_holdings ?? {}) as Record<string, number>;
      const initialCost = (settings?.initial_cost_basis ?? {}) as Record<string, number>;
      const rows = purchases ?? [];

      const aggHoldings = { btc: 0, eth: 0, sol: 0 };
      const aggInvested = { btc: 0, eth: 0, sol: 0 };
      for (const r of rows) {
        aggHoldings.btc += Number(r.btc_amount || 0);
        aggHoldings.eth += Number(r.eth_amount || 0);
        aggHoldings.sol += Number(r.sol_amount || 0);
        aggInvested.btc += Number(r.btc_amount || 0) * Number(r.btc_price || 0);
        aggInvested.eth += Number(r.eth_amount || 0) * Number(r.eth_price || 0);
        aggInvested.sol += Number(r.sol_amount || 0) * Number(r.sol_price || 0);
      }

      const ids = TOKENS.map(t => t.coingeckoId).join(',');
      const priceRes = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
      );
      const prices = priceRes.ok ? await priceRes.json() : {};

      const fgRes = await fetch('https://api.alternative.me/fng/?limit=1');
      const fgData = fgRes.ok ? await fgRes.json() : { data: [{ value: '50' }] };
      const fg = parseInt(fgData?.data?.[0]?.value ?? '50', 10);

      const rsiEntries = await Promise.all(TOKENS.map(async t => {
        try {
          const r = await fetch(`https://api.binance.com/api/v3/klines?symbol=${t.symbol}USDT&interval=1d&limit=30`);
          if (!r.ok) return [t.symbol, 50] as const;
          const d = await r.json() as [number, string, string, string, string, string, ...unknown[]][];
          return [t.symbol, calcRSI(d.map(k => parseFloat(k[4])))] as const;
        } catch { return [t.symbol, 50] as const; }
      }));
      const rsiMap = Object.fromEntries(rsiEntries) as Record<string, number>;

      const assetRows = TOKENS.map(t => {
        const manualAmt = Number(manual[t.key] ?? 0);
        const holdings = manualAmt > 0 ? manualAmt : aggHoldings[t.key];
        const invested = aggInvested[t.key] + Number(initialCost[t.key] ?? 0);
        const spot = prices[t.coingeckoId]?.usd ?? 0;
        const ch24 = prices[t.coingeckoId]?.usd_24h_change ?? 0;
        const value = holdings * spot;
        const wacb = holdings > 0 ? invested / holdings : 0;
        const pnlPct = invested > 0 ? ((value - invested) / invested) * 100 : 0;
        return { sym: t.symbol, holdings, invested, spot, ch24, value, wacb, pnlPct, target: t.allocation };
      });

      const totalValue = assetRows.reduce((s, a) => s + a.value, 0);
      const totalInvested = assetRows.reduce((s, a) => s + a.invested, 0);
      const totalPnl = totalValue - totalInvested;
      const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
      const pnl24h = assetRows.reduce((s, a) => s + a.value * a.ch24 / 100, 0);

      const assets = assetRows.map(a => ({
        sym: a.sym,
        value: a.value,
        pct: totalValue > 0 ? (a.value / totalValue) * 100 : 0,
        target: a.target * 100,
        wacb: a.wacb,
        spot: a.spot,
        pnlPct: a.pnlPct,
      }));

      const alerts: string[] = [];
      for (const a of assets) {
        if (a.pct > 50) alerts.push(`${a.sym} tvorí ${a.pct.toFixed(1)} % portfólia (>50 %).`);
      }

      const btcPct = assets.find(a => a.sym === 'BTC')?.pct ?? 0;
      const scores = assetRows
        .filter(a => a.holdings > 0 && a.invested > 0)
        .map(a => liveRiskScore(fg, rsiMap[a.sym] ?? 50, Math.max(0, a.pnlPct)));
      const liveScore = scores.length ? Math.max(...scores) : liveRiskScore(fg, 50, 0);

      const summary = [
        `Portfólio ${fmtUsd(totalValue)}.`,
        `24H ${pnl24h >= 0 ? '+' : ''}${fmtUsd(pnl24h)}.`,
        `LiveRiskScore ${liveScore.toFixed(0)}.`,
      ].join(' ');

      const conservative = btcPct >= 40
        ? `BTC (${btcPct.toFixed(1)} %) — konzervatívna kotva portfólia.`
        : `BTC ako strategický štít (64/25/11).`;

      text = buildTelegramText({
        dateKey, totalValue, totalPnl, totalPnlPct, pnl24h, fg, liveScore, assets, alerts, conservative, summary,
      });
    }

    const sent = await sendTelegram(chatId, text);
    if (!sent) {
      console.error('[telegram-daily-risk-report] send failed');
      return new Response(JSON.stringify({ success: false, error: 'telegram_send_failed' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    await supabase.from('telegram_config').update({
      last_daily_report_date: dateKey,
      updated_at: new Date().toISOString(),
    }).eq('id', 1);

    return new Response(JSON.stringify({ success: true, date: dateKey }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[telegram-daily-risk-report] error:', e);
    return new Response(JSON.stringify({ success: false, error: String(e) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
