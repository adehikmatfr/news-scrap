#!/usr/bin/env bun
// Composition root: membaca config, merakit adapter + usecase, lalu menjalankan mode server (default) atau sekali jalan.
// Argumen `--once`, `--dry-run`, `--source <nama>`, `--config <path>` dan variabel env: lihat README bagian "Menjalankan".
import { gracefulShutdown } from './application/graceful-shutdown.js';
import { ScrapeArticle } from './application/scrape-article.js';
import { ScrapeSource } from './application/scrape-source.js';
import { SourceRunQueue } from './application/source-run-queue.js';
import { AgentBrowserCli } from './infrastructure/browser/agent-browser-cli.js';
import { BrowserPageReader } from './infrastructure/browser/browser-page-reader.js';
import { CdpDriver } from './infrastructure/browser/cdp-driver.js';
import { loadConfig } from './infrastructure/config/load-config.js';
import { SourceUrlDiscoverer } from './infrastructure/discovery/source-url-discoverer.js';
import { StatusServer } from './infrastructure/http/status-server.js';
import { createJsonLogger } from './infrastructure/logging/json-logger.js';
import { JsonFileSentStore } from './infrastructure/persistence/json-file-sent-store.js';
import { LogPublisher } from './infrastructure/publishing/log-publisher.js';
import { WebhookPublisher } from './infrastructure/publishing/webhook-publisher.js';
import { BunCronScheduler } from './infrastructure/scheduling/bun-cron-scheduler.js';

const DEFAULT_CONFIG = Bun.fileURLToPath(new URL('../config.json', import.meta.url));

function parseArgs(argv) {
  const opts = { config: DEFAULT_CONFIG, once: false, dryRun: false, source: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--once') opts.once = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--config') opts.config = argv[++i];
    else if (arg.startsWith('--config=')) opts.config = arg.slice('--config='.length);
    else if (arg === '--source') opts.source = argv[++i];
    else if (arg.startsWith('--source=')) opts.source = arg.slice('--source='.length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!opts.config) throw new Error('--config requires a path');
  if (opts.source === undefined || opts.source === '') throw new Error('--source requires a source name');
  return opts;
}

function selectSources(config, name) {
  if (!name) return config.sources;
  const source = config.sources.find((s) => s.name === name);
  if (!source) throw new Error(`unknown source "${name}" (available: ${config.sources.map((s) => s.name).join(', ')})`);
  return [source];
}

// Playwright di-import dinamis supaya driver lain tidak butuh paketnya (ADR-0003).
/** @returns {Promise<import('./infrastructure/browser/browser-driver.js').BrowserDriver>} */
async function createBrowserDriver({ browser, session }) {
  switch (browser.driver) {
    case 'cdp':
      return new CdpDriver(browser);
    case 'playwright': {
      const { PlaywrightDriver } = await import('./infrastructure/browser/playwright-driver.js');
      return new PlaywrightDriver(browser);
    }
    default:
      return new AgentBrowserCli({ session });
  }
}

async function buildQueue(config, { dryRun, logger, browser }) {
  const scrapeSource = new ScrapeSource({
    discoverer: new SourceUrlDiscoverer({
      browser,
      userAgent: config.userAgent,
      timezone: config.timezone,
      delayMs: config.delayMs,
    }),
    scrapeArticle: new ScrapeArticle({ pageReader: await BrowserPageReader.create(browser), logger }),
    publisher: dryRun ? new LogPublisher(logger) : new WebhookPublisher(config.webhook),
    sentStore: await new JsonFileSentStore(config.statePath, { readOnly: dryRun }).load(),
    logger,
    delayMs: config.delayMs,
  });
  return new SourceRunQueue({ scrapeSource, logger });
}

// Sinyal pertama menjalankan penghentian rapi; sinyal kedua memaksa keluar.
function onShutdownSignal(logger, shutdown) {
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (stopping) {
        logger.warn('forced exit', { signal });
        process.exit(1);
      }
      stopping = true;
      logger.info('shutting down', { signal });
      void shutdown();
    });
  }
}

async function runOnce(sources, { queue, browser, logger }) {
  onShutdownSignal(logger, () => queue.close());
  try {
    for (const source of sources) await queue.enqueue(source);
  } finally {
    await browser.close();
    logger.info('stopped');
  }
}

async function runServer(config, sources, { queue, browser, logger }) {
  const scheduler = new BunCronScheduler({ timezone: config.timezone });
  let healthy = true;
  const statusServer = new StatusServer({
    host: config.server.host,
    port: config.server.port,
    isHealthy: () => healthy,
    getStatus: () => ({
      timezone: config.timezone,
      sources: sources.map((s) => ({
        name: s.name,
        schedule: s.schedule,
        nextRunAt: scheduler.nextRun(s)?.toISOString() ?? null,
        ...queue.snapshot(s.name),
      })),
    }),
  });

  for (const source of sources) {
    scheduler.schedule(source, () => queue.enqueue(source));
    logger.info('scheduled', { source: source.name, schedule: source.schedule, nextRunAt: scheduler.nextRun(source)?.toISOString() });
  }
  statusServer.start();
  logger.info('server listening', { host: config.server.host, port: statusServer.server.port, timezone: config.timezone });

  onShutdownSignal(logger, async () => {
    await gracefulShutdown({
      scheduler,
      queue,
      markUnhealthy: () => (healthy = false),
      closers: [() => browser.close(), () => statusServer.stop()],
      timeoutMs: config.shutdownTimeoutMs,
      logger,
    });
    logger.info('stopped');
    process.exit(0);
  });
}

async function main() {
  const opts = parseArgs(Bun.argv.slice(2));
  const logger = createJsonLogger();
  const config = await loadConfig(opts.config);
  const sources = selectSources(config, opts.source);
  const browser = await createBrowserDriver(config);
  const queue = await buildQueue(config, { dryRun: opts.dryRun, logger, browser });

  logger.info('starting', {
    mode: opts.once ? 'once' : 'server',
    sources: sources.map((s) => s.name),
    browserDriver: config.browser.driver,
    webhook: `${config.webhook.method} ${config.webhook.url}`,
    dryRun: opts.dryRun,
  });
  if (opts.once) await runOnce(sources, { queue, browser, logger });
  else await runServer(config, sources, { queue, browser, logger });
}

main().catch((err) => {
  console.error(JSON.stringify({ time: new Date().toISOString(), level: 'error', msg: 'fatal', error: err.message }));
  process.exit(1);
});
