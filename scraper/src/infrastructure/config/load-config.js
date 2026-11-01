// Membaca config.json dan variabel lingkungan menjadi konfigurasi aplikasi.
import { createSource } from '../../domain/source.js';

// Path relatif di config dihitung dari folder file config; path absolut dipakai apa adanya.
function resolveFrom(configFile, target) {
  if (/^([a-zA-Z]:)?[\\/]/.test(target)) return target;
  return Bun.fileURLToPath(new URL(target.replaceAll('\\', '/'), Bun.pathToFileURL(configFile)));
}

export async function loadConfig(file, env = Bun.env) {
  const raw = await Bun.file(file).json();
  const webhook = raw.webhook ?? {};
  // Variabel kosong di .env (mis. `WEBHOOK_TOKEN=`) dianggap tidak diisi.
  const fromEnv = (name) => env[name] || undefined;

  const config = {
    webhook: {
      timeoutMs: 15_000,
      retries: 3,
      headers: {},
      ...webhook,
      url: fromEnv('WEBHOOK_URL') ?? webhook.url,
      method: (fromEnv('WEBHOOK_METHOD') ?? webhook.method ?? 'POST').toUpperCase(),
      token: fromEnv('WEBHOOK_TOKEN') ?? webhook.token,
    },
    userAgent: raw.userAgent ?? 'NewsScraperBot/1.0',
    session: raw.session ?? 'newscraper',
    intervalMinutes: raw.intervalMinutes ?? 30,
    delayMs: raw.delayMs ?? 1500,
    statePath: resolveFrom(file, raw.statePath ?? 'data/sent.json'),
    sources: (raw.sources ?? []).map(createSource),
  };

  if (!config.webhook.url) throw new Error('webhook.url is required (config or WEBHOOK_URL)');
  if (!config.sources.length) throw new Error('at least one source is required');
  return config;
}
