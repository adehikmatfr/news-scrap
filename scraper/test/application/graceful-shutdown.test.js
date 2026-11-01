import { describe, expect, it } from 'bun:test';
import { gracefulShutdown } from '../../src/application/graceful-shutdown.js';
import { silentLogger } from './fakes.js';

function setup({ queueDone, sleep }) {
  const calls = [];
  const deps = {
    scheduler: { stopAll: () => calls.push('stopAll') },
    queue: { close: () => (calls.push('queue.close'), queueDone) },
    markUnhealthy: () => calls.push('unhealthy'),
    closers: [async () => calls.push('browser.close'), async () => calls.push('server.stop')],
    timeoutMs: 60_000,
    logger: silentLogger,
    sleep,
  };
  return { deps, calls };
}

describe('gracefulShutdown', () => {
  it('stops scheduling, waits for the running source, then closes resources in order', async () => {
    let finishRun;
    const queueDone = new Promise((r) => (finishRun = r));
    const { deps, calls } = setup({ queueDone, sleep: () => new Promise(() => {}) });

    const shutdown = gracefulShutdown(deps);
    await Promise.resolve();
    expect(calls).toEqual(['stopAll', 'unhealthy', 'queue.close']);

    finishRun();
    expect(await shutdown).toEqual({ timedOut: false });
    expect(calls).toEqual(['stopAll', 'unhealthy', 'queue.close', 'browser.close', 'server.stop']);
  });

  it('gives up waiting after timeoutMs and still closes resources', async () => {
    const { deps, calls } = setup({ queueDone: new Promise(() => {}), sleep: async () => {} });

    expect(await gracefulShutdown(deps)).toEqual({ timedOut: true });
    expect(calls.slice(-2)).toEqual(['browser.close', 'server.stop']);
  });

  it('keeps closing remaining resources when one closer fails', async () => {
    const { deps, calls } = setup({ queueDone: Promise.resolve(), sleep: () => new Promise(() => {}) });
    deps.closers = [async () => { throw new Error('chrome gone'); }, async () => calls.push('server.stop')];

    await gracefulShutdown(deps);
    expect(calls.at(-1)).toBe('server.stop');
  });
});
