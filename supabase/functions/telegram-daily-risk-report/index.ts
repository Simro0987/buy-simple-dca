import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  REPORT_TOKENS,
  loadAllIndicators,
  computeLiveRiskScore,
  type ReportToken,
} from '../_shared/riskIndicators.ts';
import {
  buildDailyRiskReport,
  type ActiveExecution,
  type ReportPosition,
} from '../_shared/dailyRiskReport.ts';
import { loadHarvestVerdicts } from '../_shared/harvestEngine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

interface RequestBody {
  /** Optional pre-rendered report (legacy override). */
  report?: string;
  chatId?: string;
  /** 7D execution flags mirrored from the client localStorage. */
  activeExecutions?: ActiveExecution[];
  /** Free cash + stable reservoir known only on the client. */
  cleanLiquidityUsd?: number;
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function safeJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
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

    let body: RequestBody = {};
    try {
      body = (await req.json()) as RequestBody;
    } catch {
      // cron payload may be empty
    }

    // ── Resolve chat + owner ────────────────────────────────────────────────
    const { data: cfg } = await supabase
      .from('telegram_config')
      .select('chat_id, user_id')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const chatId = (body.chatId ?? cfg?.chat_id ?? '').trim();
    if (!chatId) {
      return new Response(JSON.stringify({ success: false, error: 'No telegram chat id configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const ownerId = cfg?.user_id as string | undefined;

    let report = body.report?.trim();

    if (!report) {
      // ── Holdings & cost basis from the cloud ─────────────────────────────
      const holdings: Record<string, number> = {};
      const invested: Record<string, number> = {};
      const add = (sym: string, qty: number, usd: number) => {
        holdings[sym] = (holdings[sym] ?? 0) + qty;
        invested[sym] = (invested[sym] ?? 0) + usd;
      };

      let txQuery = supabase
        .from('token_transactions')
        .select('symbol, side, quantity, price_usd');
      if (ownerId) txQuery = txQuery.eq('user_id', ownerId);
      const { data: txs } = await txQuery;

      for (const t of (txs ?? []) as Array<{ symbol: string; side: string; quantity: number; price_usd: number }>) {
        const sym = String(t.symbol ?? '').toUpperCase();
        const qty = num(t.quantity);
        const usd = qty * num(t.price_usd);
        if (t.side === 'sell') add(sym, -qty, -usd);
        else add(sym, qty, usd);
      }

      let dcaQuery = supabase
        .from('dca_purchases')
        .select('btc_amount, eth_amount, sol_amount, btc_price, eth_price, sol_price');
      if (ownerId) dcaQuery = dcaQuery.eq('user_id', ownerId);
      const { data: purchases } = await dcaQuery;

      for (const r of (purchases ?? []) as Array<Record<string, number>>) {
        add('BTC', num(r.btc_amount), num(r.btc_amount) * num(r.btc_price));
        add('ETH', num(r.eth_amount), num(r.eth_amount) * num(r.eth_price));
        add('SOL', num(r.sol_amount), num(r.sol_amount) * num(r.sol_price));
      }

      let stakeQuery = supabase.from('staking_positions').select('symbol, amount');
      if (ownerId) stakeQuery = stakeQuery.eq('user_id', ownerId);
      const { data: staked } = await stakeQuery;
      for (const s of (staked ?? []) as Array<{ symbol: string; amount: number }>) {
        const sym = String(s.symbol ?? '').toUpperCase();
        if (!holdings[sym]) holdings[sym] = 0;
        // Staked balances count towards exposure but carry no extra cost basis.
        holdings[sym] += num(s.amount);
      }

      // ── Live indicators (Binance daily candles) ──────────────────────────
      const indicators = await loadAllIndicators();
      const fgData = await safeJson<{ fearGreed?: { value?: number } }>(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/btc-indicators`,
      );
      const fearGreed = Math.max(0, Math.min(100, Math.round(Number(fgData?.fearGreed?.value ?? 50)) || 50));

      const rawPositions = REPORT_TOKENS.map((token) => {
        const ind = indicators[token];
        const qty = Math.max(0, num(holdings[token]));
        return {
          token,
          holdings: qty,
          investedUsd: Math.max(0, num(invested[token])),
          valueUsd: qty * ind.price,
          prevValueUsd: qty * (ind.prevClose || ind.price),
        };
      });

      const totalValue = rawPositions.reduce((s, p) => s + p.valueUsd, 0);
      const prevValue = rawPositions.reduce((s, p) => s + p.prevValueUsd, 0);
      const totalInvested = rawPositions.reduce((s, p) => s + p.investedUsd, 0);

      const positions: ReportPosition[] = rawPositions.map((p) => ({
        token: p.token,
        holdings: p.holdings,
        investedUsd: p.investedUsd,
        valueUsd: p.valueUsd,
        weight: totalValue > 0 ? p.valueUsd / totalValue : 0,
      }));

      const weights: Partial<Record<ReportToken, number>> = {};
      for (const p of positions) if (p.weight > 0) weights[p.token] = p.weight;

      const risk = computeLiveRiskScore({ weights, indicators, fearGreed });

      // Multi-factor harvest scoring (0–10) + continuous TP % per token.
      // UNIFIED PnL STATE: the same Qty / WACB used by the allocations section
      // above is what feeds the heatmap, so both sections always agree.
      const pnlByToken: Record<string, number | null> = {};
      for (const p of positions) {
        const ind = indicators[p.token];
        const wacb = p.holdings > 0 ? p.investedUsd / p.holdings : 0;
        pnlByToken[p.token] = p.holdings > 0 && wacb > 0 && ind.price > 0
          ? ((ind.price - wacb) / wacb) * 100
          : null;
      }
      // Client-supplied PnL (manual Qty/WACB overrides) wins when present.
      const rawPnl = (body as { unrealizedPnlPct?: unknown }).unrealizedPnlPct;
      if (rawPnl && typeof rawPnl === 'object') {
        for (const [k, v] of Object.entries(rawPnl as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v)) pnlByToken[k.toUpperCase()] = v;
        }
      }
      const harvest = await loadHarvestVerdicts(fearGreed, pnlByToken)
        .catch(() => ({ verdicts: [], contrarian: '' }));


      let cleanLiquidity = num(body.cleanLiquidityUsd);
      if (!cleanLiquidity) {
        let settingsQuery = supabase.from('app_settings').select('total_capital');
        if (ownerId) settingsQuery = settingsQuery.eq('user_id', ownerId);
        const { data: settings } = await settingsQuery.limit(1).maybeSingle();
        cleanLiquidity = Math.max(0, num(settings?.total_capital) - totalInvested);
      }

      const degradedTokens = positions
        .filter((p) => p.holdings > 0 && indicators[p.token].source === 'unavailable')
        .map((p) => p.token as string);

      report = buildDailyRiskReport({
        generatedAt: new Date(),
        totalValueUsd: totalValue,
        prevValueUsd: prevValue,
        pnl24hUsd: totalValue - prevValue,
        cumulativePnlUsd: totalValue - totalInvested,
        investedUsd: totalInvested,
        cleanLiquidityUsd: cleanLiquidity,
        positions,
        indicators,
        risk,
        fearGreed,
        activeExecutions: Array.isArray(body.activeExecutions) ? body.activeExecutions : [],
        degradedTokens,
        harvest: harvest.verdicts,
        contrarian: harvest.contrarian,
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
    if (!tgRes.ok || tgData?.ok === false) {
      console.error(`Telegram send failed [${tgRes.status}]:`, JSON.stringify(tgData));
      return new Response(
        JSON.stringify({ success: false, error: 'Telegram send failed', status: tgRes.status, telegram: tgData, report }),
        { status: tgRes.ok ? 502 : tgRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ success: true, report }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('daily risk report failed:', e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
