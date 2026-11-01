import { afterEach, describe, expect, it } from 'bun:test';
import { StatusServer } from '../../src/infrastructure/http/status-server.js';

let server;
afterEach(async () => {
  await server?.stop();
});

function start({ healthy = true } = {}) {
  server = new StatusServer({
    host: '127.0.0.1',
    port: 0,
    isHealthy: () => healthy,
    getStatus: () => ({ timezone: 'Asia/Jakarta', sources: [{ name: 'a', state: 'idle' }] }),
  }).start();
  return server.url.replace(/\/$/, '');
}

describe('StatusServer', () => {
  it('reports health and status', async () => {
    const base = start();

    const health = await fetch(`${base}/health`);
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: 'ok' });

    const status = await fetch(`${base}/status`);
    expect(await status.json()).toEqual({ timezone: 'Asia/Jakarta', sources: [{ name: 'a', state: 'idle' }] });
  });

  it('answers 503 on /health while stopping', async () => {
    const res = await fetch(`${start({ healthy: false })}/health`);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: 'stopping' });
  });

  it('rejects other methods and paths', async () => {
    const base = start();
    expect((await fetch(`${base}/status`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
