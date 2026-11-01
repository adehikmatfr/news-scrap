// Implementasi port UrlDiscoverer: RSS (HTTP biasa) atau halaman indeks (lewat browser),
// dengan dukungan indeks per tanggal (`{date}`) dan bernomor halaman (`{page}`).
import { discoveryDates, renderDiscoveryUrl } from '../../domain/discovery.js';
import { normalizeURL } from '../../domain/url.js';
import { fetchFeedLinks } from './rss-feed.js';

export class SourceUrlDiscoverer {
  /**
   * @param {object} deps
   * @param {import('../browser/browser-driver.js').BrowserDriver} deps.browser
   * @param {string} deps.userAgent
   * @param {string} deps.timezone           zona waktu untuk `{date}`
   * @param {number} [deps.delayMs]          jeda antar halaman indeks
   * @param {() => Date} [deps.clock]
   * @param {(ms: number) => Promise<void>} [deps.sleep]
   */
  constructor({ browser, userAgent, timezone, delayMs = 0, clock = () => new Date(), sleep = Bun.sleep }) {
    Object.assign(this, { browser, userAgent, timezone, delayMs, clock, sleep });
  }

  async discover(source) {
    const { type, url: template, days, maxPages } = source.discovery;
    const seen = new Set();
    const urls = [];

    for (const date of discoveryDates(this.clock(), this.timezone, days)) {
      for (let page = 1; page <= maxPages; page++) {
        if (page > 1) await this.sleep(this.delayMs);
        const links = await this.#fetchLinks(type, renderDiscoveryUrl(template, { date, page }));
        let added = 0;
        for (const raw of links) {
          const u = normalizeURL(raw);
          if (!u || seen.has(u) || (source.pattern && !source.pattern.test(u))) continue;
          seen.add(u);
          urls.push(u);
          added++;
        }
        // Halaman tanpa URL baru berarti melewati halaman terakhir.
        if (added === 0) break;
      }
    }
    return urls;
  }

  async #fetchLinks(type, url) {
    switch (type) {
      case 'rss':
        return fetchFeedLinks(url, this.userAgent);
      case 'index':
        await this.browser.open(url);
        return this.browser.eval('[...document.querySelectorAll("a[href]")].map((a) => a.href)');
      default:
        throw new Error(`unknown discovery type: ${type}`);
    }
  }
}
