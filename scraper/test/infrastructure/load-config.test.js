import { describe, expect, it } from 'bun:test';
import { loadConfig } from '../../src/infrastructure/config/load-config.js';

const configFile = Bun.fileURLToPath(new URL('../../config.json', import.meta.url));

describe('loadConfig', () => {
  it('lets env override config.json', async () => {
    const c = await loadConfig(configFile, {
      WEBHOOK_URL: 'https://api.test/articles/{id}',
      WEBHOOK_METHOD: 'patch',
      WEBHOOK_TOKEN: 'rahasia',
    });
    expect(c.webhook.url).toBe('https://api.test/articles/{id}');
    expect(c.webhook.method).toBe('PATCH');
    expect(c.webhook.token).toBe('rahasia');
  });

  it('treats empty env values as unset', async () => {
    const c = await loadConfig(configFile, { WEBHOOK_URL: '', WEBHOOK_METHOD: '', WEBHOOK_TOKEN: '' });
    expect(c.webhook.url).toBe('http://localhost:8080/articles');
    expect(c.webhook.method).toBe('POST');
    expect(c.webhook.token).toBeUndefined();
  });

  it('resolves a relative statePath from the config folder', async () => {
    const c = await loadConfig(configFile, {});
    expect(c.statePath).toBe(Bun.fileURLToPath(new URL('../../data/sent.json', import.meta.url)));
  });
});
