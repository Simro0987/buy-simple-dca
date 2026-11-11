// BTC Multi-API Waterfall — každý zdroj má 3500 ms timeout; pri zlyhaní ide na ďalší.
// Mobula kľúč je výlučne v serverovom tajomstve MOBULA_API_KEY (nikdy v klientovi).
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const TIMEOUT = 3500;
let cache: { ts: number; body: string } | null = null;
const TTL = 60_000;

async function getJson(url: string, headers: Record<string, string> = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: { Accept: 'application/json', ...headers }, signal: ctl.signal });
    if (!r.ok) throw new Error(`${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
type Src<T> = { name: string; run: () => Promise<T | null> };
async function waterfall<T>(sources: Src<T>[]) {
  const errors: string[] = [];
  for (let i = 0; i < sources.length; i++) {
    try {
      const v = await sources[i].run();
      if (v != null) return { value: v, source: sources[i].name, status: 'live', errors };
      errors.push(`${sources[i].name}: prázdne`);
    } catch (e) { errors.push(`${sources[i].name}: ${(e as Error).message}`); }
  }
  return { value: null, source: null, status: 'down', errors };
}
const pos = (n: unknown) => { const v = Number(n); return Number.isFinite(v) && v > 0 ? v : null; };

function rsi14(c: number[]) {
  if (c.length < 15) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= 14; i++) { const d = c[i] - c[i - 1]; if (d > 0) g += d; else l -= d; }
  g /= 14; l /= 14;
  for (let i = 15; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * 13 + Math.max(0, d)) / 14; l = (l * 13 + Math.max(0, -d)) / 14;
  }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (cache && Date.now() - cache.ts < TTL) return new Response(cache.body, { headers: { ...corsHeaders, 'content-type': 'application/json' } });
  const mk = Deno.env.get('MOBULA_API_KEY') ?? '';
  const mh = { Authorization: mk };

  // Cena / 24h / ATH: zlúčenie Binance + CoinPaprika + CoinGecko + DefiLlama (polia sa dopĺňajú navzájom).
  type Px = { price: number | null; ath: number | null; change24h: number | null };
  const num = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? v : null; };
  const pxSources: { name: string; run: () => Promise<Px> }[] = [
    { name: 'Binance', run: async () => { const d = await getJson('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT'); return { price: pos(d?.lastPrice), ath: null, change24h: num(d?.priceChangePercent) }; } },
    { name: 'CoinPaprika', run: async () => { const q = (await getJson('https://api.coinpaprika.com/v1/tickers/btc-bitcoin'))?.quotes?.USD; return { price: pos(q?.price), ath: pos(q?.ath_price), change24h: num(q?.percent_change_24h) }; } },
    { name: 'CoinGecko', run: async () => { const d = (await getJson('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin'))?.[0]; return { price: pos(d?.current_price), ath: pos(d?.ath), change24h: num(d?.price_change_percentage_24h) }; } },
    { name: 'DefiLlama', run: async () => ({ price: pos((await getJson('https://coins.llama.fi/prices/current/coingecko:bitcoin'))?.coins?.['coingecko:bitcoin']?.price), ath: null, change24h: null }) },
  ];
  const priceP = Promise.allSettled(pxSources.map((x) => x.run())).then((rs) => {
    const errors: string[] = []; let price: number | null = null, ath: number | null = null, change24h: number | null = null;
    let source: string | null = null, athSource: string | null = null, changeSource: string | null = null;
    rs.forEach((r, i) => {
      const n = pxSources[i].name;
      if (r.status !== 'fulfilled') { errors.push(`${n}: ${(r.reason as Error)?.message}`); return; }
      if (price == null && r.value.price) { price = r.value.price; source = n; }
      if (change24h == null && r.value.change24h != null) { change24h = r.value.change24h; changeSource = n; }
      if (r.value.ath && (ath == null || r.value.ath > ath)) { ath = r.value.ath; athSource = n; }
    });
    return { value: price != null ? { price, ath, change24h } : null, source, athSource, changeSource, status: price != null ? 'live' : 'down', errors };
  });

  const poolsP = getJson('https://yields.llama.fi/pools').then((d) => {
    const ps = ((d?.data ?? []) as Record<string, unknown>[]).filter((x) => x.project === 'aave-v3' && ['Arbitrum', 'Base', 'Optimism'].includes(String(x.chain)));
    const apys = ps.map((x) => Number(x.apy)).filter(Number.isFinite);
    return ps.length ? { count: ps.length, bestApy: apys.length ? Math.max(...apys.filter((v) => v < 50)) : null } : null;
  }).catch(() => null);

  // Mobula výhradne v2 /token/details (kľúč iba na serveri).
  const mobulaP = !mk ? Promise.resolve([]) : Promise.all([
    ['WBTC', '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'], ['LINK', '0x514910771AF9Ca656af840dff83E8264EcF986CA'],
  ].map(async ([symbol, addr]) => {
    try { const d = (await getJson(`https://api.mobula.io/api/2/token/details?chainId=evm:1&address=${addr}`, mh))?.data; const p = pos(d?.price ?? d?.priceUSD); return p ? { symbol, price: p } : null; } catch { return null; }
  })).then((a) => a.filter(Boolean));

  const candlesP = waterfall<number[]>([
    { name: 'Binance', run: async () => { const k = await getJson('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=205'); const c = (k as unknown[][]).map((r) => Number(r[4])).filter((x) => x > 0); return c.length >= 200 ? c : null; } },
        { name: 'CoinGecko', run: async () => { const d = await getJson('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=205&interval=daily'); const c = (d?.prices ?? []).map((p: number[]) => Number(p[1])).filter((x: number) => x > 0); return c.length >= 200 ? c : null; } },
  ]);

  // MVRV + Z-Score z CoinMetrics, 4-ročné okno (1460 dní). Z = (MC − RC) / σ(MC).
  const mvrvP = waterfall<{ mvrv: number; z: number | null }>([
    { name: 'CoinMetrics', run: async () => {
      const rows = ((await getJson('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMVRVCur,CapMrktCurUSD&frequency=1d&page_size=1460&paging_from=end'))?.data ?? []) as Record<string, string>[];
      const pts = rows.map((r) => ({ m: Number(r.CapMVRVCur), mc: Number(r.CapMrktCurUSD) })).filter((x) => x.m > 0 && x.mc > 0);
      const last = pts.at(-1); if (!last) return null;
      const mean = pts.reduce((a, x) => a + x.mc, 0) / pts.length;
      const sd = Math.sqrt(pts.reduce((a, x) => a + (x.mc - mean) ** 2, 0) / pts.length);
      const rc = last.mc / last.m;
      return { mvrv: last.m, z: sd > 0 ? (last.mc - rc) / sd : null };
    } },
  ]);

  const [price, candles, mvrvR, pools, mobula] = await Promise.all([priceP, candlesP, mvrvP, poolsP, mobulaP]);
  const c = candles.value ?? [];
  const sma200 = c.length >= 200 ? c.slice(-200).reduce((a, b) => a + b, 0) / 200 : null;
  const rsi = c.length >= 15 ? rsi14(c) : null;
  const rets = c.slice(-31).map((x, i, a) => (i ? Math.log(x / a[i - 1]) : 0)).slice(1);
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const vol30 = rets.length ? Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length) * Math.sqrt(365) * 100 : null;
  const px = price.value?.price ?? c.at(-1) ?? null;
  const mayer = px && sma200 ? px / sma200 : null;

  // MVRV: CoinMetrics alebo proxy z Mayer Multiple (MVRV ≈ Mayer × 0.95 historicky).
  let mvrv = mvrvR.value?.mvrv ?? null; let mvrvSource = mvrvR.source; let mvrvStatus = mvrvR.status;
  if (mvrv == null && mayer != null) { mvrv = mayer * 0.95; mvrvSource = 'Proxy (Mayer / 200D SMA)'; mvrvStatus = 'fallback'; }
  const mvrvZ = mvrvR.value?.z ?? (mvrv != null ? (mvrv - 1) / 0.6 : null);

  // F&G: vlastný On-Chain & Technický Motor (RSI, vzdialenosť od 200D SMA, 24h momentum, MVRV) — primárny zdroj.
  let fg: number | null = null;
  { const parts: number[] = [];
    if (rsi != null) parts.push(rsi);
    if (mayer != null) parts.push(Math.max(0, Math.min(100, 50 + (mayer - 1) * 100)));
    const ch = price.value?.change24h; if (ch != null && Number.isFinite(ch)) parts.push(Math.max(0, Math.min(100, 50 + ch * 5)));
    if (mvrv != null) parts.push(Math.max(0, Math.min(100, (mvrv - 0.8) / 2.6 * 100)));
    if (parts.length) fg = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length); }

  const body = JSON.stringify({
    fetchedAt: Date.now(),
    price: { value: px, ath: price.value?.ath ?? null, change24h: price.value?.change24h ?? null, source: price.source, athSource: price.athSource, changeSource: price.changeSource, status: price.status },
    pools, mobula,
    candles: { count: c.length, source: candles.source, status: candles.status },
    rsi14: rsi, sma200, mayer, vol30,
    mvrv: { value: mvrv, z: mvrvZ, source: mvrvSource, status: mvrvStatus },
    fearGreed: { value: fg, source: 'On-Chain Motor', status: fg == null ? 'down' : 'live' },
    errors: [...price.errors, ...candles.errors, ...mvrvR.errors],
  });
  cache = { ts: Date.now(), body };
  return new Response(body, { headers: { ...corsHeaders, 'content-type': 'application/json' } });
});
