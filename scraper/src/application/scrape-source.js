import { articleId, assertComplete, isTooOld } from '../domain/article.js';

/**
 * Satu kali jalan untuk satu sumber:
 * discover URL -> lewati yang sudah terkirim -> ambil artikel -> validasi -> publish -> catat terkirim.
 */
export class ScrapeSource {
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

  /** @returns {Promise<{published: number, skipped: number, failed: number}>} */
  async execute(source, { shouldStop = () => false } = {}) {
    const urls = await this.discoverer.discover(source);
    const pending = [];
    for (const url of urls) {
      if (pending.length >= source.maxArticles) break;
      if (!(await this.sentStore.has(url))) pending.push(url);
    }
    this.logger.info('discovered', { source: source.name, found: urls.length, pending: pending.length });

    const stats = { published: 0, skipped: 0, failed: 0 };
    for (const url of pending) {
      // Dicek di antara artikel, sehingga artikel yang sedang diproses selalu diselesaikan.
      if (shouldStop()) break;
      try {
        stats[await this.#processArticle(source, url)]++;
      } catch (err) {
        stats.failed++;
        this.logger.warn('article failed', { source: source.name, url, error: err.message });
      }
      await this.sleep(this.delayMs);
    }
    return stats;
  }

  /** @returns {Promise<'published'|'skipped'>} */
  async #processArticle(source, url) {
    const article = await this.scrapeArticle.execute(url, source);
    const id = articleId(url);

    // Artikel tua tetap dicatat agar tidak dibuka ulang di setiap jalan.
    if (isTooOld(article, source.maxAgeHours, this.clock())) {
      await this.sentStore.markSent(url, { id, status: 'skipped:too-old' });
      this.logger.info('article skipped', { source: source.name, url, reason: 'too old', published_at: article.published_at });
      return 'skipped';
    }
    assertComplete(article, source.minWords);

    const record = {
      id,
      source: source.name,
      scrapedAt: this.clock(),
      article: { ...article, url },
    };
    // Dicatat terkirim hanya setelah publish berhasil, agar artikel yang gagal dicoba lagi di jalan berikutnya.
    const { status } = await this.publisher.publish(record);
    await this.sentStore.markSent(url, { id: record.id, status });
    this.logger.info('published', { source: source.name, url, id: record.id, status });
    return 'published';
  }
}
