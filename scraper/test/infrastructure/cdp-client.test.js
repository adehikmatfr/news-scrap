import { afterEach, describe, expect, it } from 'bun:test';
import { CdpClient } from '../../src/infrastructure/browser/cdp-client.js';
import { NO_REPLY, startFakeCdp } from './fake-cdp-server.js';

let fake;
afterEach(() => fake?.stop());

describe('CdpClient', () => {
  it('matches responses to requests and passes the session id', async () => {
    fake = startFakeCdp({
      'Slow.method': async () => (await Bun.sleep(20), { n: 1 }),
      'Fast.method': () => ({ n: 2 }),
    });
    const client = await CdpClient.connect(fake.url);
    const [slow, fast] = await Promise.all([client.send('Slow.method'), client.send('Fast.method', {}, 'S1')]);
    expect([slow, fast]).toEqual([{ n: 1 }, { n: 2 }]);
    expect(fake.calls[1].sessionId).toBe('S1');
    expect(fake.calls[0].sessionId).toBeUndefined();
    client.close();
  });

  it('turns a protocol error into a rejected promise', async () => {
    fake = startFakeCdp({ 'Bad.method': () => ({ error: { code: -32000, message: 'No target' } }) });
    const client = await CdpClient.connect(fake.url);
    await expect(client.send('Bad.method')).rejects.toThrow('CDP Bad.method: No target');
    client.close();
  });

  it('times out a request that never gets a response', async () => {
    fake = startFakeCdp({ 'Hang.method': () => NO_REPLY });
    const client = await CdpClient.connect(fake.url, { timeoutMs: 50 });
    await expect(client.send('Hang.method')).rejects.toThrow('timeout after 50 ms');
    client.close();
  });

  it('rejects pending and new requests once the connection drops', async () => {
    fake = startFakeCdp({ 'Hang.method': () => NO_REPLY });
    const client = await CdpClient.connect(fake.url);
    const pending = client.send('Hang.method');
    await Bun.sleep(10);
    fake.dropConnections();
    await expect(pending).rejects.toThrow('connection closed');
    await client.closed;
    expect(client.connected).toBe(false);
    await expect(client.send('Any.method')).rejects.toThrow('connection closed');
  });

  it('delivers events to subscribers until they unsubscribe', async () => {
    fake = startFakeCdp({
      'Emit.twice': (params, { emit }) => {
        emit('Some.event', { n: 1 });
        setTimeout(() => emit('Some.event', { n: 2 }), 20);
        return {};
      },
    });
    const client = await CdpClient.connect(fake.url);
    const got = [];
    const off = client.on((msg) => {
      got.push(msg.params.n);
      off();
    });
    await client.send('Emit.twice');
    await Bun.sleep(40);
    expect(got).toEqual([1]);
    client.close();
  });
});
