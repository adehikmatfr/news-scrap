import { articleId, assertComplete } from '../domain/article.js';

/**
 * Satu siklus scraping untuk semua sumber:
 * discover URL -> lewati yang sudah terkirim -> ambil artikel -> validasi -> publish -> catat terkirim.
 */
export class ScrapeSources {
  /**
   * @param {object} deps
   * @param {import('./ports.js').UrlDiscoverer} deps.discoverer
   * @param {import('./scrape-article.js').ScrapeArticle} deps.scrapeArticle
   * @param {import('./ports.js').ArticlePublisher} deps.publisher
   * @param {import('./ports.js').SentStore} deps.sentStore
   * @param {import('./ports.js').Logger} deps.logger
   * @param {number} [deps.delayMs]  jeda antar artikel (sopan terhadap situs sumber)
   * @param {() => Date} [deps.clock]
   * @param {(ms: number) => Promise<void>} [deps.sleep]
   */
  constructor({ discoverer, scrapeArticle, publisher, sentStore, logger, delayMs = 0, clock = () => new Date(), sleep = Bun.sleep }) {
    Object.assign(this, { discoverer, scrapeArticle, publisher, sentStore, logger, delayMs, clock, sleep });
  }

  async execute(sources, { shouldStop = () => false } = {}) {
    const results = [];
    for (const source of sources) {
      if (shouldStop()) break;
      try {
        const stats = await this.#runSource(source, shouldStop);
        this.logger.info('source done', { source: source.name, ...stats });
        results.push({ source: source.name, ...stats });
      } catch (err) {
        this.logger.error('source failed', { source: source.name, error: err.message });
        results.push({ source: source.name, error: err.message });
      }
    }
    return results;
  }

  async #runSource(source, shouldStop) {
    const urls = await this.discoverer.discover(source);
    const pending = [];
    for (const url of urls) {
      if (pending.length >= source.maxArticles) break;
      if (!(await this.sentStore.has(url))) pending.push(url);
    }
    this.logger.info('discovered', { source: source.name, found: urls.length, pending: pending.length });

    const stats = { published: 0, failed: 0 };
    for (const url of pending) {
      if (shouldStop()) break;
      try {
        await this.#processArticle(source, url);
        stats.published++;
      } catch (err) {
        stats.failed++;
        this.logger.warn('article failed', { source: source.name, url, error: err.message });
      }
      await this.sleep(this.delayMs);
    }
    return stats;
  }

  async #processArticle(source, url) {
    const article = await this.scrapeArticle.execute(url, source);
    assertComplete(article, source.minWords);

    const record = {
      id: articleId(url),
      source: source.name,
      scrapedAt: this.clock(),
      article: { ...article, url },
    };
    // Dicatat terkirim hanya setelah publish berhasil, agar artikel yang gagal dicoba lagi di siklus berikutnya.
    const { status } = await this.publisher.publish(record);
    await this.sentStore.markSent(url, { id: record.id, status });
    this.logger.info('published', { source: source.name, url, id: record.id, status });
  }
}
