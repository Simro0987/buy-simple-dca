import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

type AssetSymbol = 'BTC' | 'ETH' | 'SOL';

interface ReportAsset {
  symbol: AssetSymbol;
  allocationPct: number;
  spotPrice: number;
  holdings: number;
  investedUsd: number;
}

interface DailyRiskReportInput {
  totalPortfolioValueUsd: number;
  cleanLiquidityUsd: number;
  pnl24hUsd: number;
  cumulativePnlUsd: number;
  globalRiskScore: number;
  assets: ReportAsset[];
}

interface AppSettingsRow {
  manual_holdings?: { btc?: number; eth?: number; sol?: number } | null;
  initial_cost_basis?: { btc?: number; eth?: number; sol?: number } | null;
  total_capital?: number | null;
}

interface DcaPurchaseRow {
  btc_amount: number;
  eth_amount: number;
  sol_amount: number;
  btc_price: number;
  eth_price: number;
  sol_price: number;
}

const fmtUsd = (n: number) =>
  `$${Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0.00'}`;

const fmtPrice = (n: number) =>
  `$${Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: n >= 1000 ? 2 : 4 }) : '0'}`;

const fmtPct = (n: number) =>
  `${Number.isFinite(n) ? n.toFixed(2) : '0.00'}%`;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function formatQty(symbol: AssetSymbol, qty: number): string {
  const d = symbol === 'BTC' ? 6 : symbol === 'ETH' ? 5 : 3;
  return Number.isFinite(qty) ? qty.toFixed(d) : '0';
}

function generateDailyRiskReport(input: DailyRiskReportInput): string {
  const dateStamp = new Date().toLocaleString('sk-SK', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Bratislava',
  });

  const allocationLines = input.assets.map((asset) =>
    `- *${asset.symbol}* · ${fmtPct(asset.allocationPct)} · Spot ${fmtPrice(asset.spotPrice)} · Qty ${formatQty(asset.symbol, asset.holdings)}`,
  );

  const wacbLines = input.assets.map((asset) => {
    const wacb = asset.holdings > 0 ? asset.investedUsd / asset.holdings : 0;
    const diffPct = wacb > 0 ? ((asset.spotPrice - wacb) / wacb) * 100 : 0;
    const diffTag = diffPct >= 0 ? `+${fmtPct(diffPct)}` : fmtPct(diffPct);
    return `- *${asset.symbol}* · WACB ${fmtPrice(wacb)} vs Spot ${fmtPrice(asset.spotPrice)} (${diffTag})`;
  });

  const btcAllocation = input.assets.find((a) => a.symbol === 'BTC')?.allocationPct ?? 0;
  const concentrationLine = btcAllocation > 50
    ? `⚠️ *Koncentračné riziko:* BTC alokácia ${fmtPct(btcAllocation)} je nad 50%.`
    : `✅ *Koncentračné riziko:* BTC alokácia ${fmtPct(btcAllocation)} je v tolerancii.`;

  const conservativeSummary =
    `🛡️ *Konzervatívne aktívum:* BTC funguje ako hlavný štít proti volatilite ` +
    `vďaka ${fmtPct(btcAllocation)} podielu a najvyššej likvidite.`;

  const pnl24h = input.pnl24hUsd >= 0 ? `+${fmtUsd(input.pnl24hUsd)}` : fmtUsd(input.pnl24hUsd);
  const cumulative = input.cumulativePnlUsd >= 0 ? `+${fmtUsd(input.cumulativePnlUsd)}` : fmtUsd(input.cumulativePnlUsd);

  return [
    `*Daily Risk Report* · ${dateStamp}`,
    '',
    `- *Celková hodnota portfólia:* ${fmtUsd(input.totalPortfolioValueUsd)}`,
    `- *Čistá likvidita:* ${fmtUsd(input.cleanLiquidityUsd)}`,
    `- *24H PnL:* ${pnl24h}`,
    `- *Kumulatívne PnL:* ${cumulative}`,
    '',
    '*Aktuálne alokácie & spot ceny*',
    ...allocationLines,
    '',
    `- *Globálny index rizika (LiveRiskScore):* ${fmtPct(input.globalRiskScore)}`,
    '',
    '*WACB vs Spot*',
    ...wacbLines,
    '',
    concentrationLine,
    conservativeSummary,
  ].join('\n');
}

async function safeJson<T>(url: string, fallback: T): Promise<T> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return fallback;
    return await res.json() as T;
  } catch {
    return fallback;
  }
}

function calcRsi(closes: number[]): number {
  const p = 14;
  if (closes.length < p + 1) return 50;
  const sl = closes.slice(-(p + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < sl.length; i++) {
    const d = sl[i] - sl[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  const ag = gains / p;
  const al = losses / p;
  if (al === 0) return 99;
  return Math.round(clamp(100 - 100 / (1 + ag / al), 0, 100));
}

async function fetchRsi(symbol: string): Promise<number> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=30`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return 50;
    const rows = await res.json() as [number, string, string, string, string, string, ...unknown[]][];
    const closes = rows.map((r) => Number(r[4])).filter((n) => Number.isFinite(n));
    return calcRsi(closes);
  } catch {
    return 50;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const TELEGRAM_API_KEY = Deno.env.get('TELEGRAM_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!LOVABLE_API_KEY || !TELEGRAM_API_KEY || !supabaseUrl || !serviceKey) {
      return new Response(JSON.stringify({ success: false, error: 'Missing environment secrets' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    let reportOverride: string | undefined;
    let chatIdOverride: string | undefined;
    try {
      const body = await req.json();
      reportOverride = body?.report;
      chatIdOverride = body?.chatId;
    } catch {
      // cron payload may be empty
    }

    let chatId = chatIdOverride?.trim();
    if (!chatId) {
      const { data: cfg } = await supabase
        .from('telegram_config')
        .select('chat_id')
        .eq('id', 1)
        .single();
      chatId = cfg?.chat_id?.trim();
    }
    if (!chatId) {
      return new Response(JSON.stringify({ success: false, error: 'No telegram chat id configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let report = reportOverride;
    if (!report) {
      const { data: settings } = await supabase
        .from('app_settings')
        .select('manual_holdings, initial_cost_basis, total_capital')
        .limit(1)
        .maybeSingle();
      const { data: purchases } = await supabase
        .from('dca_purchases')
        .select('btc_amount, eth_amount, sol_amount, btc_price, eth_price, sol_price')
        .order('created_at', { ascending: true });

      const app = (settings ?? {}) as AppSettingsRow;
      const rows = (purchases ?? []) as DcaPurchaseRow[];

      const aggHoldings = {
        BTC: rows.reduce((s, r) => s + Number(r.btc_amount || 0), 0),
        ETH: rows.reduce((s, r) => s + Number(r.eth_amount || 0), 0),
        SOL: rows.reduce((s, r) => s + Number(r.sol_amount || 0), 0),
      };
      const aggInvested = {
        BTC: rows.reduce((s, r) => s + Number(r.btc_amount || 0) * Number(r.btc_price || 0), 0),
        ETH: rows.reduce((s, r) => s + Number(r.eth_amount || 0) * Number(r.eth_price || 0), 0),
        SOL: rows.reduce((s, r) => s + Number(r.sol_amount || 0) * Number(r.sol_price || 0), 0),
      };

      const manual = app.manual_holdings ?? {};
      const initialCost = app.initial_cost_basis ?? {};

      const prices = await safeJson<Record<string, { usd: number; usd_24h_change: number }>>(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true',
        {
          bitcoin: { usd: 0, usd_24h_change: 0 },
          ethereum: { usd: 0, usd_24h_change: 0 },
          solana: { usd: 0, usd_24h_change: 0 },
        },
      );
      const fgData = await safeJson<{ data: Array<{ value: string }> }>('https://api.alternative.me/fng/?limit=1', { data: [{ value: '50' }] });
      const fgValue = Number.parseInt(fgData.data?.[0]?.value ?? '50', 10) || 50;
      const [rsiBtc, rsiEth, rsiSol] = await Promise.all([fetchRsi('BTCUSDT'), fetchRsi('ETHUSDT'), fetchRsi('SOLUSDT')]);
      const avgRsi = (rsiBtc + rsiEth + rsiSol) / 3;

      const assets: ReportAsset[] = ([
        { symbol: 'BTC', cg: 'bitcoin', m: 'btc' },
        { symbol: 'ETH', cg: 'ethereum', m: 'eth' },
        { symbol: 'SOL', cg: 'solana', m: 'sol' },
      ] as const).map((entry) => {
        const manualHold = Number((manual as Record<string, number | undefined>)[entry.m] ?? 0);
        const holdings = manualHold > 0 ? manualHold : aggHoldings[entry.symbol];
        const invested = aggInvested[entry.symbol] + Number((initialCost as Record<string, number | undefined>)[entry.m] ?? 0);
        const spot = Number(prices[entry.cg]?.usd ?? 0);
        return {
          symbol: entry.symbol,
          allocationPct: 0,
          spotPrice: spot,
          holdings,
          investedUsd: invested,
        };
      });

      const totalValue = assets.reduce((s, a) => s + a.holdings * a.spotPrice, 0);
      const totalInvested = assets.reduce((s, a) => s + a.investedUsd, 0);
      const cumulativePnl = totalValue - totalInvested;
      const pnlPct = totalInvested > 0 ? (cumulativePnl / totalInvested) * 100 : 0;
      const pnl24h = assets.reduce((sum, a) => {
        const cg = a.symbol === 'BTC' ? 'bitcoin' : a.symbol === 'ETH' ? 'ethereum' : 'solana';
        const ch = Number(prices[cg]?.usd_24h_change ?? 0);
        const value = a.holdings * a.spotPrice;
        return sum + (value * ch) / 100;
      }, 0);
      const cleanLiquidity = Math.max(0, Number(app.total_capital ?? 0) - totalInvested);
      const globalRiskScore = clamp((fgValue * 0.4) + (avgRsi * 0.4) + (pnlPct * 0.2), 0, 100);

      for (const a of assets) {
        a.allocationPct = totalValue > 0 ? (a.holdings * a.spotPrice / totalValue) * 100 : 0;
      }

      report = generateDailyRiskReport({
        totalPortfolioValueUsd: totalValue,
        cleanLiquidityUsd: cleanLiquidity,
        pnl24hUsd: pnl24h,
        cumulativePnlUsd: cumulativePnl,
        globalRiskScore,
        assets,
      });
    }

    const tgRes = await fetch(`${GATEWAY_URL}/sendMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'X-Connection-Api-Key': TELEGRAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: report,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
      }),
    });

    const tgData = await tgRes.json().catch(() => ({}));
    if (!tgRes.ok) {
      return new Response(JSON.stringify({ success: false, error: 'Telegram send failed', telegram: tgData }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
