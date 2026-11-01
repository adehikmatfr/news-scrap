#!/usr/bin/env bun
// Composition root: membaca config, merakit adapter + usecase, lalu menjalankan siklus.
// Argumen `--once`, `--dry-run`, `--config <path>` dan variabel env: lihat README bagian "Menjalankan".
import { ScrapeArticle } from './application/scrape-article.js';
import { ScrapeSources } from './application/scrape-sources.js';
import { AgentBrowserCli } from './infrastructure/browser/agent-browser-cli.js';
import { BrowserPageReader } from './infrastructure/browser/browser-page-reader.js';
import { loadConfig } from './infrastructure/config/load-config.js';
import { SourceUrlDiscoverer } from './infrastructure/discovery/source-url-discoverer.js';
import { createJsonLogger } from './infrastructure/logging/json-logger.js';
import { JsonFileSentStore } from './infrastructure/persistence/json-file-sent-store.js';
import { LogPublisher } from './infrastructure/publishing/log-publisher.js';
import { WebhookPublisher } from './infrastructure/publishing/webhook-publisher.js';

const DEFAULT_CONFIG = Bun.fileURLToPath(new URL('../config.json', import.meta.url));

function parseArgs(argv) {
  const opts = { config: DEFAULT_CONFIG, once: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--once') opts.once = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--config') opts.config = argv[++i];
    else if (arg.startsWith('--config=')) opts.config = arg.slice('--config='.length);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!opts.config) throw new Error('--config requires a path');
  return opts;
}

async function main() {
  const opts = parseArgs(Bun.argv.slice(2));
  const { dryRun } = opts;

  const logger = createJsonLogger();
  const config = await loadConfig(opts.config);
  const browser = new AgentBrowserCli({ session: config.session });

  const scrapeSources = new ScrapeSources({
    discoverer: new SourceUrlDiscoverer({ browser, userAgent: config.userAgent }),
    scrapeArticle: new ScrapeArticle({ pageReader: await BrowserPageReader.create(browser), logger }),
    publisher: dryRun ? new LogPublisher(logger) : new WebhookPublisher(config.webhook),
    sentStore: await new JsonFileSentStore(config.statePath, { readOnly: dryRun }).load(),
    logger,
    delayMs: config.delayMs,
    sleep: Bun.sleep,
  });

  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      logger.info('shutting down', { signal });
      stopping = true;
    });
  }
  const shouldStop = () => stopping;

  logger.info('starting', { webhook: `${config.webhook.method} ${config.webhook.url}`, dryRun });
  try {
    do {
      await scrapeSources.execute(config.sources, { shouldStop });
      if (opts.once || stopping) break;
      logger.info('sleeping', { minutes: config.intervalMinutes });
      for (let waited = 0; waited < config.intervalMinutes * 60_000 && !stopping; waited += 1000) await Bun.sleep(1000);
    } while (!stopping);
  } finally {
    await browser.close();
    logger.info('stopped');
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ time: new Date().toISOString(), level: 'error', msg: 'fatal', error: err.message }));
  process.exit(1);
});
