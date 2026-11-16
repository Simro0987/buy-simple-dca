import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { createStatusServer } from '../src/statusServer';

let close: (() => void) | null = null;
afterEach(() => close?.());

async function start(token?: string) {
  const srv = createStatusServer(() => ({ ok: 1 }), { token });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  close = () => srv.close();
  return `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
}

describe('status API (read-only)', () => {
  it('serves GET /status and /healthz only', async () => {
    const u = await start();
    expect((await fetch(`${u}/status`)).status).toBe(200);
    expect((await fetch(`${u}/healthz`)).status).toBe(200);
    expect((await fetch(`${u}/trade`)).status).toBe(404);
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      expect((await fetch(`${u}/status`, { method })).status).toBe(405);
    }
  });

  it('optional bearer token', async () => {
    const u = await start('s3cret');
    expect((await fetch(`${u}/status`)).status).toBe(401);
    expect((await fetch(`${u}/status`, { headers: { Authorization: 'Bearer s3cret' } })).status).toBe(200);
    expect((await fetch(`${u}/healthz`)).status).toBe(200);
  });
});
