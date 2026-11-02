// Bagian bersama alat benchmark: membuat driver, menyusun daftar URL, dan menjalankan setiap URL di semua driver.
import { ScrapeArticle } from '../src/application/scrape-article.js';
import { AgentBrowserCli } from '../src/infrastructure/browser/agent-browser-cli.js';
import { BrowserPageReader } from '../src/infrastructure/browser/browser-page-reader.js';
import { CdpDriver } from '../src/infrastructure/browser/cdp-driver.js';
import { SourceUrlDiscoverer } from '../src/infrastructure/discovery/source-url-discoverer.js';
import { GoScraperProcess } from './go-scraper-client.js';

export const ALL_DRIVERS = ['agent-browser', 'cdp', 'playwright'];
// Driver Go (go-scraper, HTTP tanpa browser) hanya ikut jika diminta lewat `--drivers` (ADR-0005):
// `go` memakai port extract-article.js, `go-trafilatura` memakai go-trafilatura seperti sistem produksi.
const GO_DRIVERS = {
  go: ['-extractor', 'rules'],
  'go-trafilatura': ['-extractor', 'trafilatura', '-extract-time'],
};
const silentLogger = { info() {}, warn() {}, error() {} };

export const hash = (text) => new Bun.CryptoHasher('sha256').update(text ?? '').digest('hex').slice(0, 16);

export const percentile = (values, p) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

/** Argumen bersama: `--config`, `--sources`, `--articles`, `--drivers`, `--urls`, `--out`; sisanya ditolak. */
export function parseBenchArgs(argv, { outPrefix }) {
  const opts = {
    config: Bun.fileURLToPath(new URL('../config.json', import.meta.url)),
    sources: null,
    articles: 3,
    drivers: ALL_DRIVERS,
    urls: null,
    out: Bun.fileURLToPath(new URL(`../data/${outPrefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, import.meta.url)),
  };
  for (let i = 0; i < argv.length; i += 2) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (key === '--config') opts.config = value;
    else if (key === '--sources') opts.sources = value.split(',');
    else if (key === '--articles') opts.articles = Number(value);
    else if (key === '--drivers') opts.drivers = value.split(',');
    else if (key === '--urls') opts.urls = value;
    else if (key === '--out') opts.out = value;
    else throw new Error(`unknown argument: ${key}`);
  }
  const unknown = opts.drivers.filter((d) => !ALL_DRIVERS.includes(d) && !GO_DRIVERS[d]);
  if (unknown.length) throw new Error(`unknown driver: ${unknown.join(', ')}`);
  return opts;
}

// Session agent-browser sendiri, supaya tidak mengganggu server yang mungkin sedang berjalan.
export async function createDriver(name, config) {
  if (name === 'agent-browser') return new AgentBrowserCli({ session: `${config.session}-bench` });
  if (!config.browser.chromePath) throw new Error(`CHROME_PATH is required for driver "${name}"`);
  if (name === 'cdp') return new CdpDriver(config.browser);
  const { PlaywrightDriver } = await import('../src/infrastructure/browser/playwright-driver.js');
  return new PlaywrightDriver(config.browser);
}

/**
 * Daftar URL diambil sekali per sumber (hanya RSS), lalu dipakai semua driver.
 * Dengan `urlsFile` (hasil benchmark sebelumnya), URL yang sama dipakai ulang supaya hasil bisa dibandingkan.
 */
export async function buildPlan(config, names, articles, urlsFile = null) {
  const sources = config.sources.filter((s) => !names || names.includes(s.name));
  const missing = (names ?? []).filter((n) => !sources.some((s) => s.name === n));
  if (missing.length) throw new Error(`unknown source: ${missing.join(', ')}`);
  if (urlsFile) {
    const { records } = await Bun.file(urlsFile).json();
    return sources
      .map((source) => ({ source, urls: [...new Set(records.filter((r) => r.source === source.name).map((r) => r.url))] }))
      .filter((p) => p.urls.length);
  }
  const discoverer = new SourceUrlDiscoverer({ browser: null, userAgent: config.userAgent, timezone: config.timezone });
  const plan = [];
  for (const source of sources) {
    if (source.discovery.type !== 'rss') {
      console.error(`skip ${source.name}: discovery "${source.discovery.type}" is not supported by the benchmark`);
      continue;
    }
    try {
      const urls = (await discoverer.discover(source)).slice(0, articles);
      plan.push({ source, urls });
      console.error(`${source.name}: ${urls.length} URL`);
    } catch (err) {
      console.error(`skip ${source.name}: ${err.message}`);
    }
  }
  return plan;
}

/**
 * Setiap URL dibuka semua driver; urutan driver digeser per URL agar cache CDN tidak menguntungkan satu driver.
 * `beforeUrl(source, url)` dipanggil sekali per URL sebelum driver pertama; `onResult` menerima setiap hasil.
 */
export async function runAcrossDrivers(plan, driverNames, config, { beforeUrl = async () => {}, onResult }) {
  const drivers = {};
  for (const name of driverNames) {
    if (GO_DRIVERS[name]) {
      const go = await GoScraperProcess.start({ userAgent: config.userAgent, timeoutMs: 15_000, args: GO_DRIVERS[name] });
      drivers[name] = { driver: go, scrape: go, warm: false };
      continue;
    }
    const driver = await createDriver(name, config);
    drivers[name] = { driver, scrape: new ScrapeArticle({ pageReader: await BrowserPageReader.create(driver), logger: silentLogger }), warm: false };
  }
  let turn = 0;
  try {
    for (const { source, urls } of plan) {
      for (const url of urls) {
        await beforeUrl(source, url);
        const order = driverNames.map((_, i) => driverNames[(i + turn) % driverNames.length]);
        turn++;
        for (const name of order) {
          const d = drivers[name];
          const cold = !d.warm;
          d.warm = true;
          const t0 = performance.now();
          let article = null;
          let error = null;
          try {
            article = await d.scrape.execute(url, source);
          } catch (err) {
            error = err.message.split('\n')[0].slice(0, 200);
          }
          await onResult({ driver: name, source, url, cold, ms: Math.round(performance.now() - t0), article, error });
          await Bun.sleep(config.delayMs);
        }
      }
    }
  } finally {
    await Promise.all(Object.values(drivers).map((d) => d.driver.close()));
  }
}
