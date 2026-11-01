// Membaca config.json dan variabel lingkungan menjadi konfigurasi aplikasi.
import { createSource } from '../../domain/source.js';

// Path relatif di config dihitung dari folder file config; path absolut dipakai apa adanya.
function resolveFrom(configFile, target) {
  if (/^([a-zA-Z]:)?[\\/]/.test(target)) return target;
  return Bun.fileURLToPath(new URL(target.replaceAll('\\', '/'), Bun.pathToFileURL(configFile)));
}

function assertTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
  } catch {
    throw new Error(`invalid timezone "${timezone}" (use an IANA name, e.g. "Asia/Jakarta")`);
  }
}

function parsePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`invalid server port "${value}"`);
  return port;
}

const BROWSER_DRIVERS = ['agent-browser', 'playwright', 'cdp'];

function parseFlag(name, value) {
  if (value === undefined || value === '0' || value === 'false') return false;
  if (value === '1' || value === 'true') return true;
  throw new Error(`invalid ${name} "${value}" (use 1 or 0)`);
}

// Pilihan driver browser dan opsi Chrome untuk driver `playwright`/`cdp` (ADR-0003).
function parseBrowser(raw, fromEnv) {
  const driver = fromEnv('BROWSER_DRIVER') ?? raw.browserDriver ?? 'agent-browser';
  if (!BROWSER_DRIVERS.includes(driver)) {
    throw new Error(`invalid browser driver "${driver}" (use one of: ${BROWSER_DRIVERS.join(', ')})`);
  }
  const browser = {
    driver,
    chromePath: fromEnv('CHROME_PATH') ?? null,
    sandbox: parseFlag('CHROME_SANDBOX', fromEnv('CHROME_SANDBOX')),
  };
  if (driver === 'cdp' && !browser.chromePath) throw new Error('CHROME_PATH is required for browser driver "cdp"');
  return browser;
}

export async function loadConfig(file, env = Bun.env) {
  const raw = await Bun.file(file).json();
  if ('intervalMinutes' in raw) {
    throw new Error('intervalMinutes is not supported; schedule each source with sources[].schedule (ADR-0002)');
  }
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
    timezone: raw.timezone ?? 'Asia/Jakarta',
    server: {
      host: raw.server?.host ?? '127.0.0.1',
      port: parsePort(fromEnv('PORT') ?? raw.server?.port ?? 3000),
    },
    shutdownTimeoutMs: raw.shutdownTimeoutMs ?? 60_000,
    userAgent: raw.userAgent ?? 'NewsScraperBot/1.0',
    browser: parseBrowser(raw, fromEnv),
    session: raw.session ?? 'newscraper',
    delayMs: raw.delayMs ?? 1500,
    statePath: resolveFrom(file, raw.statePath ?? 'data/sent.json'),
    sources: (raw.sources ?? []).map(createSource),
  };

  assertTimezone(config.timezone);
  if (!config.webhook.url) throw new Error('webhook.url is required (config or WEBHOOK_URL)');
  if (!config.sources.length) throw new Error('at least one source is required');
  const names = config.sources.map((s) => s.name);
  if (new Set(names).size !== names.length) throw new Error('source names must be unique');
  return config;
}
