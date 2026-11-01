import { describe, expect, it } from 'bun:test';
import { PlaywrightDriver } from '../../src/infrastructure/browser/playwright-driver.js';

// Launcher palsu yang meniru bagian API Playwright yang dipakai driver.
function fakeLauncher() {
  const launches = [];
  const browsers = [];
  return {
    launches,
    browsers,
    async launch(opts) {
      launches.push(opts);
      const page = {
        calls: [],
        async goto(...args) {
          page.calls.push(['goto', ...args]);
        },
        async waitForSelector(...args) {
          page.calls.push(['waitForSelector', ...args]);
        },
        async evaluate(script) {
          return `hasil:${script}`;
        },
      };
      const browser = {
        connected: true,
        closes: 0,
        page,
        isConnected: () => browser.connected,
        newContext: async () => ({ newPage: async () => page }),
        close: async () => {
          browser.closes++;
          browser.connected = false;
        },
      };
      browsers.push(browser);
      return browser;
    },
  };
}

describe('PlaywrightDriver', () => {
  it('launches lazily with the sandbox off and Chrome path from config', async () => {
    const launcher = fakeLauncher();
    const driver = new PlaywrightDriver({ chromePath: '/opt/chrome', timeoutMs: 1_000, launcher });
    expect(launcher.launches).toHaveLength(0);
    await driver.open('https://news.example.com/a', '.content');
    await driver.open('https://news.example.com/b');
    expect(launcher.launches).toEqual([{ executablePath: '/opt/chrome', chromiumSandbox: false, timeout: 1_000 }]);
    expect(launcher.browsers[0].page.calls).toEqual([
      ['goto', 'https://news.example.com/a', { waitUntil: 'domcontentloaded', timeout: 1_000 }],
      ['waitForSelector', '.content', { state: 'attached', timeout: 1_000 }],
      ['goto', 'https://news.example.com/b', { waitUntil: 'domcontentloaded', timeout: 1_000 }],
    ]);
  });

  it('uses the bundled Chromium when no path is set', async () => {
    const launcher = fakeLauncher();
    await new PlaywrightDriver({ launcher }).open('https://news.example.com/a');
    expect(launcher.launches[0].executablePath).toBeUndefined();
  });

  it('returns the value of the evaluated script', async () => {
    const driver = new PlaywrightDriver({ launcher: fakeLauncher() });
    expect(await driver.eval('document.title')).toBe('hasil:document.title');
  });

  it('relaunches after the browser disconnects', async () => {
    const launcher = fakeLauncher();
    const driver = new PlaywrightDriver({ launcher });
    await driver.open('https://news.example.com/a');
    launcher.browsers[0].connected = false;
    await driver.open('https://news.example.com/b');
    expect(launcher.launches).toHaveLength(2);
  });

  it('close is safe before launch and when called twice', async () => {
    const launcher = fakeLauncher();
    const driver = new PlaywrightDriver({ launcher });
    await driver.close();
    await driver.open('https://news.example.com/a');
    await driver.close();
    await driver.close();
    expect(launcher.browsers[0].closes).toBe(1);
  });
});
