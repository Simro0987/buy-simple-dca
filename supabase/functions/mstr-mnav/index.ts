// Automatické mNAV pre MSTR: 1) saylortracker.com scrape, 2) výpočet
// EV / (BTC cena × BTC v držbe), EV = Market Cap + dlh + preferované − hotovosť (Yahoo, záloha SEC/konštanty).
// akcie v obehu zo SEC XBRL (záloha: posledná známa hodnota).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const UA = 'Mozilla/5.0 (buy-simple-dca)';
const FALLBACK_SHARES = 421_978_000; // Basic Shares Outstanding k 27. 9. 2026 (strategy.com/shares), len záloha
const FALLBACK_BTC = 847_666;
// Posledná známa záloha dlhu a hotovosti (Yahoo financialData, 10/2026) — len ak zlyhajú všetky živé zdroje.
const FALLBACK_DEBT = 6_770_777_088;
const FALLBACK_CASH = 2_447_982_080;
// Preferované akcie (STRK/STRF/STRD/STRC) — odvodené z Yahoo EV − (Market Cap + dlh − hotovosť), len záloha.
const FALLBACK_PREF = 12_100_000_000;

interface YahooFund { shares: number; debt: number; cash: number; ev: number; marketCap: number }
/** Yahoo quoteSummary (cookie + crumb) — živé akcie v obehu, celkový dlh, hotovosť, EV. */
async function yahooFundamentals(): Promise<YahooFund | null> {
  try {
    const c = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(8000) });
    const cookie = (c.headers.get('set-cookie') ?? '').split(',').map((x) => x.split(';')[0].trim()).filter((x) => x.includes('=')).join('; ');
    const cr = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, cookie }, signal: AbortSignal.timeout(8000) });
    const crumb = (await cr.text()).trim();
    if (!cr.ok || !crumb || crumb.includes('<')) return null;
    const r = await fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/MSTR?modules=defaultKeyStatistics,financialData,price&crumb=${encodeURIComponent(crumb)}`,
      { headers: { 'User-Agent': UA, cookie }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const j = (await r.json())?.quoteSummary?.result?.[0];
    const n = (x: unknown) => Number((x as { raw?: number })?.raw) || 0;
    const out = {
      shares: n(j?.defaultKeyStatistics?.sharesOutstanding),
      debt: n(j?.financialData?.totalDebt),
      cash: n(j?.financialData?.totalCash),
      ev: n(j?.defaultKeyStatistics?.enterpriseValue),
      marketCap: n(j?.price?.marketCap),
    };
    return out.shares > 1e8 ? out : null;
  } catch { return null; }
}
let cache: { ts: number; body: string } | null = null;
const TTL = 15 * 60_000;

async function yahooPrice(t: string): Promise<number> {
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=5d&interval=1d`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`yahoo ${r.status}`);
  const j = await r.json();
  return Number(j?.chart?.result?.[0]?.meta?.regularMarketPrice) || 0;
}

async function scrapeOne(url: string, re: RegExp): Promise<number | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const text = (await r.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const m = text.match(re);
    const v = m ? Number(m[1]) : NaN;
    return Number.isFinite(v) && v > 0.2 && v < 10 ? v : null;
  } catch { return null; }
}
async function scrapeSaylor(): Promise<{ v: number; src: string } | null> {
  const a = await scrapeOne('https://saylortracker.com/', /mNAV[^0-9]{0,40}?([0-9]+\.[0-9]+)\s*x/i);
  if (a !== null) return { v: a, src: 'saylortracker.com' };
  const b = await scrapeOne('https://strategyviewer.com/', /EV mNAV\s*([0-9]+\.[0-9]+)\s*x/i);
  if (b !== null) return { v: b, src: 'strategyviewer.com (SaylorTracker feed)' };
  return null;
}

async function btcHoldings(): Promise<{ v: number; live: boolean }> {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/companies/public_treasury/bitcoin', { headers: { 'User-Agent': UA } });
    const j = await r.json();
    const c = (j?.companies ?? []).find((x: { symbol?: string }) => String(x.symbol).startsWith('MSTR'));
    const v = Number(c?.total_holdings);
    if (v > 0) return { v, live: true };
  } catch { /* noop */ }
  return { v: FALLBACK_BTC, live: false };
}

async function sharesOutstanding(): Promise<{ v: number; live: boolean }> {
  try {
    const r = await fetch('https://data.sec.gov/api/xbrl/companyconcept/CIK0001050446/dei/EntityCommonStockSharesOutstanding.json',
      { headers: { 'User-Agent': 'buy-simple-dca admin@buy-simple-dca.app' }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(String(r.status));
    const j = await r.json();
    const rows: Array<{ end: string; accn: string; val: number }> = j?.units?.shares ?? [];
    const sum = new Map<string, number>();
    for (const x of rows) sum.set(`${x.end}|${x.accn}`, (sum.get(`${x.end}|${x.accn}`) ?? 0) + x.val);
    const last = [...sum.entries()].sort((a, b) => a[0].localeCompare(b[0])).at(-1);
    if (last && last[1] > 1e8) return { v: last[1], live: true };
  } catch { /* noop */ }
  return { v: FALLBACK_SHARES, live: false };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const send = (body: string) => new Response(body, { headers: { ...corsHeaders, 'content-type': 'application/json' } });
  if (!new URL(req.url).searchParams.has('calc') && cache && Date.now() - cache.ts < TTL) return send(cache.body);
  try {
    const forceCalc = new URL(req.url).searchParams.get('calc') === '1';
    const scraped = forceCalc ? null : await scrapeSaylor();
    if (scraped !== null) {
      const body = JSON.stringify({ mnav: scraped.v, method: 'scraped', source: scraped.src, at: new Date().toISOString() });
      cache = { ts: Date.now(), body };
      return send(body);
    }
    const [mstr, btc, hold, yf] = await Promise.all([yahooPrice('MSTR'), yahooPrice('BTC-USD'), btcHoldings(), yahooFundamentals()]);
    if (!(mstr > 0 && btc > 0)) throw new Error('missing prices');
    const sec = yf ? null : await sharesOutstanding();
    const shares = yf?.shares ?? sec!.v;
    const debt = yf ? yf.debt : FALLBACK_DEBT;
    const cash = yf ? yf.cash : FALLBACK_CASH;
    const marketCap = mstr * shares;
    // EV mNAV = (Market Cap + Dlh − Hotovosť) / (BTC × držba) — rovnaká definícia ako primárny zdroj.
    // Yahoo EV už obsahuje dlh, preferované akcie aj hotovosť → preferovaný živý údaj.
    const pref = yf && yf.ev > 0 && yf.marketCap > 0 ? Math.max(0, yf.ev - (yf.marketCap + yf.debt - yf.cash)) : FALLBACK_PREF;
    const ev = yf && yf.ev > 0 ? yf.ev : marketCap + debt + pref - cash;
    const nav = btc * hold.v;
    const body = JSON.stringify({
      mnav: ev / nav, method: 'calculated', source: yf ? 'EV / BTC NAV · Yahoo Finance' : sec!.live ? 'EV / BTC NAV · SEC (dlh: záloha)' : 'EV / BTC NAV · záloha',
      marketCap, debt, preferred: pref, cash, enterpriseValue: ev, btcNav: nav, btcHoldings: hold.v, shares,
      estimated: !hold.live || !yf,
      at: new Date().toISOString(),
    });
    if (!forceCalc) cache = { ts: Date.now(), body };
    return send(body);
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }
});
