/**
 * End-to-end against a running API + Postgres (CI starts them; locally: see api/README).
 * Skipped unless API_TEST_URL is set, e.g. API_TEST_URL=http://localhost:58070
 */
import { createClient } from '../../shared/apiClient';
import { describe, expect, it } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';

const API = process.env.API_TEST_URL;
const d = API ? describe : describe.skip;

async function siweLogin(pk = generatePrivateKey(), opts: { domain?: string; issuedAt?: Date } = {}) {
  const acct = privateKeyToAccount(pk);
  const url = new URL(API!);
  const { nonce } = await (await fetch(`${API}/auth/v1/siwe/nonce`)).json();
  const message = createSiweMessage({
    domain: opts.domain ?? url.host,
    uri: opts.domain ? `http://${opts.domain}` : url.origin,
    address: acct.address,
    chainId: 1,
    nonce,
    version: '1',
    issuedAt: opts.issuedAt ?? new Date(),
    statement: 'Sign in to buy-simple-dca',
  });
  const signature = await acct.signMessage({ message });
  const res = await fetch(`${API}/auth/v1/siwe/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, signature }) });
  return { res, body: await res.json(), message, signature, acct };
}

function client() {
  return createClient(API!, 'public-anon', { auth: { persistSession: false, autoRefreshToken: false } });
}

d('API end-to-end (SIWE + PostgREST/RLS + functions)', () => {
  it('logs in with SIWE and issues a GoTrue-shaped session; nonce is single-use', async () => {
    const { res, body, message, signature, acct } = await siweLogin();
    expect(res.status).toBe(200);
    expect(body.token_type).toBe('bearer');
    expect(body.user.user_metadata.wallet_address).toBe(acct.address);
    const replay = await fetch(`${API}/auth/v1/siwe/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message, signature }) });
    expect(replay.status).toBe(401);
  });

  it('rejects foreign domains and stale messages', async () => {
    expect((await siweLogin(undefined, { domain: 'evil.example' })).res.status).toBe(401);
    expect((await siweLogin(undefined, { issuedAt: new Date(Date.now() - 3600_000) })).res.status).toBe(401);
  });

  it('password/email login is disabled', async () => {
    const r = await fetch(`${API}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', password: 'xxxxxxxx' }),
    });
    expect(r.status).toBe(400);
    expect((await fetch(`${API}/auth/v1/signup`, { method: 'POST', body: '{}' })).status).toBe(400);
  });

  it('own client: setSession, getUser, RLS isolates users, anon is denied', async () => {
    const a = (await siweLogin()).body;
    const b = (await siweLogin()).body;
    const ca = client();
    const cb = client();
    await ca.auth.setSession({ access_token: a.access_token, refresh_token: a.refresh_token });
    await cb.auth.setSession({ access_token: b.access_token, refresh_token: b.refresh_token });
    const { data: u } = await ca.auth.getUser();
    expect(u.user?.id).toBe(a.user.id);

    const ins = await ca.from('capital_entries').insert({ amount: 123, user_id: a.user.id, note: 'it' }).select('id, amount').single();
    expect(ins.error).toBeNull();
    expect(Number(ins.data?.amount)).toBe(123);
    const mine = await ca.from('capital_entries').select('*').eq('note', 'it');
    expect(mine.data?.length).toBe(1);
    const theirs = await cb.from('capital_entries').select('*').eq('id', ins.data!.id);
    expect(theirs.data).toEqual([]);
    const forged = await cb.from('capital_entries').insert({ amount: 1, user_id: a.user.id });
    expect(forged.error).toBeTruthy(); // RLS WITH CHECK
    const upd = await cb.from('capital_entries').update({ amount: 0 }).eq('id', ins.data!.id).select();
    expect(upd.data).toEqual([]);
    const anon = await client().from('capital_entries').select('*');
    expect(anon.error).toBeTruthy();

    const cnt = await ca.from('capital_entries').select('*', { count: 'exact', head: true });
    expect(cnt.count).toBe(1);
    const inQ = await ca.from('capital_entries').select('id').in('id', [ins.data!.id, '00000000-0000-0000-0000-000000000000']);
    expect(inQ.data?.length).toBe(1);
    const maybe = await ca.from('capital_entries').select('id').eq('id', '00000000-0000-0000-0000-000000000000').maybeSingle();
    expect(maybe.error).toBeNull();
    expect(maybe.data).toBeNull();
    const ordered = await ca.from('capital_entries').select('id, amount').order('created_at', { ascending: false }).limit(5);
    expect(ordered.error).toBeNull();
    const up = await ca.from('capital_entries').upsert({ id: ins.data!.id, user_id: a.user.id, amount: 222, note: 'it' }, { onConflict: 'id' }).select('amount').single();
    expect(up.error).toBeNull();
    expect(Number(up.data?.amount)).toBe(222);
    const fn = await ca.functions.invoke('dca-execute', { body: {} });
    expect(fn.error?.status).toBe(400); // reached the function with the session ("Missing fields")
    const del = await ca.from('capital_entries').delete().eq('id', ins.data!.id);
    expect(del.error).toBeNull();
    const rpc = await ca.rpc('get_cron_jobs_status');
    expect(rpc.error).toBeNull();
    expect(Array.isArray(rpc.data)).toBe(true);
  });

  it('refresh tokens rotate; re-use revokes the session; logout revokes', async () => {
    const s = (await siweLogin()).body;
    const r1 = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
    expect(r1.status).toBe(200);
    const s2 = await r1.json();
    const reuse = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
    expect(reuse.status).toBe(400);
    const r2 = await fetch(`${API}/auth/v1/token?grant_type=refresh_token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ refresh_token: s2.refresh_token }) });
    expect(r2.status).toBe(400); // whole session revoked after re-use

    const s3 = (await siweLogin()).body;
    const user = await fetch(`${API}/auth/v1/user`, { headers: { authorization: `Bearer ${s3.access_token}` } });
    expect(user.status).toBe(200);
    const out = await fetch(`${API}/auth/v1/logout`, { method: 'POST', headers: { authorization: `Bearer ${s3.access_token}` } });
    expect(out.status).toBe(204);
    const after = await fetch(`${API}/auth/v1/user`, { headers: { authorization: `Bearer ${s3.access_token}` } });
    expect(after.status).toBe(401);
  });

  it('functions: public ones open, protected ones need a session; unknown -> 404', async () => {
    const s = (await siweLogin()).body;
    const pub = await fetch(`${API}/functions/v1/gas-prices`, { method: 'OPTIONS' });
    expect(pub.status).toBeLessThan(300);
    const prot = await fetch(`${API}/functions/v1/dca-execute`, { method: 'POST', body: '{}' });
    expect(prot.status).toBe(401);
    const ok = await fetch(`${API}/functions/v1/dca-execute`, { method: 'POST', headers: { authorization: `Bearer ${s.access_token}`, 'content-type': 'application/json' }, body: '{}' });
    expect(ok.status).toBe(400); // reached the function: "Missing fields"
    expect((await fetch(`${API}/functions/v1/does-not-exist`, { method: 'POST', headers: { authorization: `Bearer ${s.access_token}` } })).status).toBe(404);
  });

  it('health is green and unknown routes 404', async () => {
    expect((await fetch(`${API}/healthz`)).status).toBe(200);
    expect((await fetch(`${API}/rest/v1/`, { method: 'HEAD' })).status).toBe(200);
    expect((await fetch(`${API}/rest/v1/`)).status).toBe(200);
    expect((await fetch(`${API}/nope`)).status).toBe(404);
    expect((await fetch(`${API}/sb/auth/v1/health`)).status).toBe(200);
    expect((await fetch(`${API}/api/auth/v1/health`)).status).toBe(200);
  });
});
