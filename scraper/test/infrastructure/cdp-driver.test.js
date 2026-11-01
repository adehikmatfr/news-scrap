import { afterEach, describe, expect, it } from 'bun:test';
import { CdpDriver } from '../../src/infrastructure/browser/cdp-driver.js';
import { readDevToolsUrl } from '../../src/infrastructure/browser/chrome-process.js';
import { NO_REPLY, startFakeCdp, tabHandlers } from './fake-cdp-server.js';

let fake;
afterEach(() => fake?.stop());

// Driver yang "meluncurkan" Chrome tiruan: alamatnya server CDP palsu.
function driverFor(server, opts = {}) {
  const launches = [];
  const stops = [];
  const driver = new CdpDriver({
    chromePath: '/fake/chrome',
    timeoutMs: 200,
    pollMs: 5,
    launch: async (args) => (launches.push(args), { wsUrl: server.url }),
    stop: async (chrome, stopOpts) => void stops.push(stopOpts ?? {}),
    ...opts,
  });
  return { driver, launches, stops };
}

describe('CdpDriver', () => {
  it('launches once, prepares the tab, and waits for DOMContentLoaded of the navigation', async () => {
    fake = startFakeCdp(tabHandlers());
    const { driver, launches } = driverFor(fake);
    await driver.open('https://news.example.com/a');
    await driver.open('https://news.example.com/b');
    expect(launches).toEqual([{ chromePath: '/fake/chrome', sandbox: false, timeoutMs: 200 }]);
    expect(fake.methods()).toEqual([
      'Target.createTarget',
      'Target.attachToTarget',
      'Page.enable',
      'Page.setLifecycleEventsEnabled',
      'Page.navigate',
      'Page.navigate',
    ]);
    await driver.close();
  });

  it('accepts a DOMContentLoaded event that arrives before the navigate response', async () => {
    fake = startFakeCdp(
      tabHandlers({
        navigate: (params, { emit }) => {
          emit('Page.lifecycleEvent', { name: 'DOMContentLoaded', loaderId: 'L9', frameId: 'F1' });
          return { frameId: 'F1', loaderId: 'L9' };
        },
      }),
    );
    const { driver } = driverFor(fake);
    await driver.open('https://news.example.com/a');
    await driver.close();
  });

  it('ignores DOMContentLoaded from other loaders and times out', async () => {
    fake = startFakeCdp(
      tabHandlers({
        navigate: (params, { emit }) => {
          emit('Page.lifecycleEvent', { name: 'DOMContentLoaded', loaderId: 'IFRAME', frameId: 'F2' });
          return { frameId: 'F1', loaderId: 'MAIN' };
        },
      }),
    );
    const { driver } = driverFor(fake);
    await expect(driver.open('https://news.example.com/a')).rejects.toThrow('DOMContentLoaded: timeout after 200 ms');
    await driver.close();
  });

  it('does not wait for a load on same-document navigation', async () => {
    fake = startFakeCdp(tabHandlers({ navigate: () => ({ frameId: 'F1' }) }));
    const { driver } = driverFor(fake);
    await driver.open('https://news.example.com/a#bagian');
    await driver.close();
  });

  it('throws when navigation fails', async () => {
    fake = startFakeCdp(tabHandlers({ navigate: () => ({ frameId: 'F1', errorText: 'net::ERR_NAME_NOT_RESOLVED' }) }));
    const { driver } = driverFor(fake);
    await expect(driver.open('https://nope.example.com/')).rejects.toThrow(
      'open https://nope.example.com/ failed: net::ERR_NAME_NOT_RESOLVED',
    );
    await driver.close();
  });

  it('polls until the waitFor selector exists', async () => {
    let checks = 0;
    fake = startFakeCdp(tabHandlers({ evaluate: () => ({ result: { value: ++checks >= 3 } }) }));
    const { driver } = driverFor(fake);
    await driver.open('https://news.example.com/a', 'article .content');
    expect(checks).toBe(3);
    const expr = fake.calls.find((c) => c.method === 'Runtime.evaluate').params.expression;
    expect(expr).toBe('!!document.querySelector("article .content")');
    await driver.close();
  });

  it('times out when the waitFor selector never appears', async () => {
    fake = startFakeCdp(tabHandlers({ evaluate: () => ({ result: { value: false } }) }));
    const { driver } = driverFor(fake);
    await expect(driver.open('https://news.example.com/a', '.never')).rejects.toThrow('timeout waiting for selector .never');
    await driver.close();
  });

  it('returns the evaluated value by value', async () => {
    fake = startFakeCdp(tabHandlers({ evaluate: () => ({ result: { type: 'object', value: ['https://a', 'https://b'] } }) }));
    const { driver } = driverFor(fake);
    expect(await driver.eval('[...document.links].map((a) => a.href)')).toEqual(['https://a', 'https://b']);
    const params = fake.calls.find((c) => c.method === 'Runtime.evaluate').params;
    expect(params).toMatchObject({ returnByValue: true, awaitPromise: true });
    await driver.close();
  });

  it('turns a script exception into an error', async () => {
    fake = startFakeCdp(
      tabHandlers({
        evaluate: () => ({
          result: { type: 'object' },
          exceptionDetails: { text: 'Uncaught', exception: { description: 'Error: boom\n    at <anonymous>:1:7' } },
        }),
      }),
    );
    const { driver } = driverFor(fake);
    await expect(driver.eval('throw new Error("boom")')).rejects.toThrow('eval failed: Error: boom');
    await driver.close();
  });

  it('relaunches Chrome after the connection drops', async () => {
    fake = startFakeCdp(tabHandlers());
    const { driver, launches, stops } = driverFor(fake);
    await driver.open('https://news.example.com/a');
    fake.dropConnections();
    await Bun.sleep(20);
    await driver.open('https://news.example.com/b');
    expect(launches).toHaveLength(2);
    expect(stops).toEqual([{ graceMs: 0 }]);
    await driver.close();
  });

  it('fails fast when Chrome dies while a page is loading', async () => {
    fake = startFakeCdp(tabHandlers({ navigate: () => ({ frameId: 'F1', loaderId: 'L1' }) }));
    const { driver } = driverFor(fake, { timeoutMs: 5_000 });
    const opening = driver.open('https://news.example.com/a');
    await Bun.sleep(30);
    fake.dropConnections();
    await expect(opening).rejects.toThrow('connection closed');
    await driver.close();
  });

  it('closes even when Browser.close never answers, and twice is harmless', async () => {
    fake = startFakeCdp({ ...tabHandlers(), 'Browser.close': () => NO_REPLY });
    const { driver, stops } = driverFor(fake);
    await driver.open('https://news.example.com/a');
    await driver.close();
    await driver.close();
    expect(stops).toEqual([{}]);
  });

  it('close without any page does nothing', async () => {
    fake = startFakeCdp(tabHandlers());
    const { driver, launches } = driverFor(fake);
    await driver.close();
    expect(launches).toHaveLength(0);
  });
});

describe('readDevToolsUrl', () => {
  const streamOf = (...chunks) =>
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
        controller.close();
      },
    });

  it('finds the URL even when it is split across chunks', async () => {
    const url = await readDevToolsUrl(streamOf('[0101] noise\nDevTools listening on ws://127.0.0.1:41', '23/devtools/browser/abc\n'), 1_000);
    expect(url).toBe('ws://127.0.0.1:4123/devtools/browser/abc');
  });

  it('reports the end of stderr when Chrome exits first', async () => {
    await expect(readDevToolsUrl(streamOf('FATAL: No usable sandbox!\n'), 1_000)).rejects.toThrow(
      'Chrome exited before DevTools was ready: FATAL: No usable sandbox!',
    );
  });

  it('times out when Chrome stays silent', async () => {
    await expect(readDevToolsUrl(new ReadableStream({ start() {} }), 30)).rejects.toThrow('within 30 ms');
  });
});
