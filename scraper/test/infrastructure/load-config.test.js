import { describe, expect, it } from 'bun:test';
import { loadConfig } from '../../src/infrastructure/config/load-config.js';

const path = (relative) => Bun.fileURLToPath(new URL(relative, import.meta.url));
const configFile = path('../../config.json');

describe('loadConfig', () => {
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
    expect(c.statePath).toBe(path('../../data/sent.json'));
  });

  it('rejects intervalMinutes, unknown timezones, duplicate names, and bad ports', async () => {
    await expect(loadConfig(path('../fixtures/config-interval.json'), {})).rejects.toThrow(/intervalMinutes/);
    await expect(loadConfig(path('../fixtures/config-bad-timezone.json'), {})).rejects.toThrow(/invalid timezone/);
    await expect(loadConfig(path('../fixtures/config-duplicate-source.json'), {})).rejects.toThrow(/unique/);
    await expect(loadConfig(configFile, { PORT: 'abc' })).rejects.toThrow(/invalid server port/);
  });
});
