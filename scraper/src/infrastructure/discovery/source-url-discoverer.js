// Implementasi port UrlDiscoverer: RSS (HTTP biasa) atau halaman indeks (lewat browser).
import { normalizeURL } from '../../domain/url.js';
import { fetchFeedLinks } from './rss-feed.js';

export class SourceUrlDiscoverer {
  /**
   * @param {object} deps
   * @param {import('../browser/agent-browser-cli.js').AgentBrowserCli} deps.browser
   * @param {string} deps.userAgent
   */
  constructor({ browser, userAgent }) {
    this.browser = browser;
    this.userAgent = userAgent;
  }

  async discover(source) {
    const links = await this.#fetchLinks(source.discovery);
    const urls = links
      .map(normalizeURL)
      .filter((u) => u && (!source.pattern || source.pattern.test(u)));
    return [...new Set(urls)];
  }

  async #fetchLinks({ type, url }) {
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
