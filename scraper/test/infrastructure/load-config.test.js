import { describe, expect, it } from 'bun:test';
import { loadConfig } from '../../src/infrastructure/config/load-config.js';

const path = (relative) => Bun.fileURLToPath(new URL(relative, import.meta.url));
// Fixture tetap, supaya daftar sumber di config.json bisa berubah tanpa merusak test.
const configFile = path('../fixtures/config.json');

describe('loadConfig', () => {
  it('loads the real config.json without errors', async () => {
    const c = await loadConfig(path('../../config.json'), {});
    expect(c.sources.length).toBeGreaterThan(0);
  });

  it('lets env override config.json', async () => {
    const c = await loadConfig(configFile, {
      WEBHOOK_URL: 'https://api.test/articles/{id}',
      WEBHOOK_METHOD: 'patch',
      WEBHOOK_TOKEN: 'rahasia',
      PORT: '4123',
    });
    expect(c.webhook.url).toBe('https://api.test/articles/{id}');
    expect(c.webhook.method).toBe('PATCH');
    expect(c.webhook.token).toBe('rahasia');
    expect(c.server.port).toBe(4123);
  });

  it('treats empty env values as unset', async () => {
    const c = await loadConfig(configFile, { WEBHOOK_URL: '', WEBHOOK_METHOD: '', WEBHOOK_TOKEN: '', PORT: '' });
    expect(c.webhook.url).toBe('http://localhost:8080/articles');
    expect(c.webhook.method).toBe('POST');
    expect(c.webhook.token).toBeUndefined();
    expect(c.server.port).toBe(3000);
  });

  it('reads server, timezone, shutdown, and per-source schedules', async () => {
    const c = await loadConfig(configFile, {});
    expect(c.timezone).toBe('Asia/Jakarta');
    expect(c.server).toEqual({ host: '127.0.0.1', port: 3000 });
    expect(c.shutdownTimeoutMs).toBe(60_000);
    expect(c.sources.map((s) => [s.name, s.schedule])).toEqual([
      ['antaranews', '*/15 * * * *'],
      ['kompas', '0 * * * *'],
    ]);
  });

  it('resolves a relative statePath from the config folder', async () => {
    const c = await loadConfig(configFile, {});
    expect(c.statePath).toBe(path('../fixtures/data/sent.json'));
  });

  it('rejects intervalMinutes, unknown timezones, duplicate names, and bad ports', async () => {
    await expect(loadConfig(path('../fixtures/config-interval.json'), {})).rejects.toThrow(/intervalMinutes/);
    await expect(loadConfig(path('../fixtures/config-bad-timezone.json'), {})).rejects.toThrow(/invalid timezone/);
    await expect(loadConfig(path('../fixtures/config-duplicate-source.json'), {})).rejects.toThrow(/unique/);
    await expect(loadConfig(configFile, { PORT: 'abc' })).rejects.toThrow(/invalid server port/);
  });

  it('defaults to the agent-browser driver with the Chrome sandbox off', async () => {
    const c = await loadConfig(configFile, {});
    expect(c.browser).toEqual({ driver: 'agent-browser', chromePath: null, sandbox: false });
  });

  it('reads the browser driver and Chrome options from env', async () => {
    const c = await loadConfig(configFile, { BROWSER_DRIVER: 'cdp', CHROME_PATH: '/opt/chrome/chrome', CHROME_SANDBOX: '1' });
    expect(c.browser).toEqual({ driver: 'cdp', chromePath: '/opt/chrome/chrome', sandbox: true });
    const p = await loadConfig(configFile, { BROWSER_DRIVER: 'playwright', CHROME_SANDBOX: '' });
    expect(p.browser).toEqual({ driver: 'playwright', chromePath: null, sandbox: false });
  });

  it('rejects unknown drivers, cdp without CHROME_PATH, and bad sandbox flags', async () => {
    await expect(loadConfig(configFile, { BROWSER_DRIVER: 'puppeteer' })).rejects.toThrow(/invalid browser driver "puppeteer"/);
    await expect(loadConfig(configFile, { BROWSER_DRIVER: 'cdp' })).rejects.toThrow(/CHROME_PATH is required/);
    await expect(loadConfig(configFile, { CHROME_SANDBOX: 'yes' })).rejects.toThrow(/invalid CHROME_SANDBOX/);
  });
});
