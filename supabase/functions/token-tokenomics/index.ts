// KROK 1 (High-Beta) — automatické tokenomics: unlocky a inflácia ponuky.
// Primárne: CoinGecko (cirkulujúca ponuka) · Fallback: Mobula (chainId + adresa).
// Kľúč Mobula je len v serverovom tajomstve MOBULA_API_KEY.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const TOKENS: Record<string, { cgId: string; blockchain?: string; address?: string; name: string }> = {
  PENDLE: { cgId: 'pendle', blockchain: 'ethereum', address: '0x808507121b80c02388fad14726482e061b8da827', name: 'Pendle' },
  TAO: { cgId: 'bittensor', name: 'Bittensor' },
  INJ: { cgId: 'injective-protocol', blockchain: 'ethereum', address: '0xe28b3b32b6c345a34ff64674606124dd5aceca30', name: 'Injective' },
  ENA: { cgId: 'ethena', blockchain: 'ethereum', address: '0x57e114b691db790c35207b2e685d4a43181e6061', name: 'Ethena' },
  PUMP: { cgId: 'pump-fun', blockchain: 'solana', address: 'pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn', name: 'Pump.fun' },
  HYPE: { cgId: 'hyperliquid', name: 'Hyperliquid' },
  HNT: { cgId: 'helium', blockchain: 'solana', address: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', name: 'Helium' },
};

interface Unlock { pct: number; date: string }
interface Row {
  symbol: string;
  circSupply: number | null;
  price: number | null;
  volume24h: number | null;
  supplySource: 'coingecko' | 'mobula' | 'cache' | null;
  supply7dAgo: number | null;
  supplyChange7dPct: number | null;
  historyDays: number;
  unlock: Unlock | null;
  unlockSource: 'mobula' | null;
  errors: string[];
}

const cache = new Map<string, { ts: number; body: string }>();
const TTL = 10 * 60_000;

async function getJson(url: string, init?: RequestInit, ms = 8000): Promise<{ ok: boolean; status: number; json: unknown }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { ...init, signal: ctrl.signal });
    const json = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, json };
  } catch (e) {
    return { ok: false, status: 0, json: String(e) };
  } finally { clearTimeout(t); }
}

// deno-lint-ignore no-explicit-any
const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : typeof v === 'string' && Number(v) > 0 ? Number(v) : null);

// deno-lint-ignore no-explicit-any
function parseMobulaUnlock(d: any, circ: number | null): Unlock | null {
  const now = Date.now();
  const horizon = now + 14 * 86400_000;
  const schedules = d?.release_schedule ?? d?.releaseSchedule ?? d?.vesting_schedule ?? d?.unlocks ?? [];
  if (!Array.isArray(schedules) || !circ) return null;
  let best: Unlock | null = null;
  for (const ev of schedules) {
    const ts = Number(ev?.unlock_date ?? ev?.date ?? ev?.timestamp ?? 0);
    const ms = ts > 1e12 ? ts : ts * 1000;
    if (!(ms >= now && ms <= horizon)) continue;
    const amt = num(ev?.tokens_to_unlock ?? ev?.amount ?? ev?.tokens);
    if (!amt) continue;
    const pct = (amt / circ) * 100;
    if (!best || pct > best.pct) best = { pct, date: new Date(ms).toISOString().slice(0, 10) };
  }
  return best;
}

async function fromMobula(sym: string, key: string) {
  const t = TOKENS[sym];
  const qs = t.blockchain && t.address
    ? `blockchain=${encodeURIComponent(t.blockchain)}&address=${encodeURIComponent(t.address)}`
    : `asset=${encodeURIComponent(t.name)}`;
  const r = await getJson(`https://api.mobula.io/api/2/token/details?${qs}`, { headers: { Authorization: key } });
  if (!r.ok) throw new Error(`mobula ${r.status}`);
  // deno-lint-ignore no-explicit-any
  const d = (r.json as any)?.data ?? r.json;
  return {
    circ: num(d?.circulating_supply ?? d?.circulatingSupply),
    price: num(d?.price ?? d?.priceUSD),
    volume: num(d?.volume ?? d?.volume_24h ?? d?.volume24h),
    raw: d,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  try {
    const url = new URL(req.url);
    const symbols = (url.searchParams.get('symbols') ?? Object.keys(TOKENS).join(','))
      .split(',').map((s) => s.trim().toUpperCase()).filter((s) => s in TOKENS);
    if (symbols.length === 0) return json({ error: 'no valid symbols' }, 400);
    const ck = symbols.join(',');
    const hit = cache.get(ck);
    if (hit && Date.now() - hit.ts < TTL) return new Response(hit.body, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const mobulaKey = Deno.env.get('MOBULA_API_KEY') ?? '';

    // Primárny zdroj: CoinGecko markets (jeden request pre všetky tokeny).
    const ids = symbols.map((s) => TOKENS[s].cgId).join(',');
    const cg = await getJson(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}`);
    // deno-lint-ignore no-explicit-any
    const cgById = new Map<string, any>(Array.isArray(cg.json) ? (cg.json as any[]).map((x) => [x.id, x]) : []);

    const today = new Date().toISOString().slice(0, 10);
    const rows: Row[] = [];
    for (const sym of symbols) {
      const t = TOKENS[sym];
      const row: Row = { symbol: sym, circSupply: null, price: null, volume24h: null, supplySource: null, supply7dAgo: null, supplyChange7dPct: null, historyDays: 0, unlock: null, unlockSource: null, errors: [] };
      const c = cgById.get(t.cgId);
      if (c) {
        row.circSupply = num(c.circulating_supply);
        row.price = num(c.current_price);
        row.volume24h = num(c.total_volume);
        if (row.circSupply) row.supplySource = 'coingecko';
      } else row.errors.push(`coingecko ${cg.status}`);

      // Failover + unlock schedule: Mobula
      if (mobulaKey) {
        try {
          const m = await fromMobula(sym, mobulaKey);
          if (!row.circSupply && m.circ) { row.circSupply = m.circ; row.supplySource = 'mobula'; }
          if (!row.price && m.price) row.price = m.price;
          if (!row.volume24h && m.volume) row.volume24h = m.volume;
          const u = parseMobulaUnlock(m.raw, row.circSupply);
          if (u) { row.unlock = u; row.unlockSource = 'mobula'; }
        } catch (e) { row.errors.push(String((e as Error).message ?? e)); }
      } else row.errors.push('mobula key missing');

      // Snapshot histórie ponuky (inflácia 7D)
      if (row.circSupply) {
        await sb.from('token_supply_snapshots').upsert({ symbol: sym, day: today, circ_supply: row.circSupply, source: row.supplySource ?? 'unknown' });
      }
      const since = new Date(Date.now() - 10 * 86400_000).toISOString().slice(0, 10);
      const { data: hist } = await sb.from('token_supply_snapshots').select('day,circ_supply').eq('symbol', sym).gte('day', since).order('day', { ascending: true });
      const h = (hist ?? []) as Array<{ day: string; circ_supply: number }>;
      if (!row.circSupply && h.length) { row.circSupply = Number(h[h.length - 1].circ_supply); row.supplySource = 'cache'; }
      const target = Date.now() - 7 * 86400_000;
      const old = h.filter((x) => new Date(x.day).getTime() <= target).pop();
      if (h.length) row.historyDays = Math.round((Date.now() - new Date(h[0].day).getTime()) / 86400_000);
      if (old && row.circSupply) {
        row.supply7dAgo = Number(old.circ_supply);
        row.supplyChange7dPct = ((row.circSupply - row.supply7dAgo) / row.supply7dAgo) * 100;
      }
      rows.push(row);
    }
    const body = JSON.stringify({ generatedAt: new Date().toISOString(), tokens: rows });
    cache.set(ck, { ts: Date.now(), body });
    return new Response(body, { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
