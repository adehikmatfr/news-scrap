// Implementasi port PageReader: buka halaman lewat agent-browser,
// lalu jalankan skrip ekstraksi di dalam halaman tersebut.
const EXTRACTOR_SCRIPT = `${import.meta.dir}/scripts/extract-article.js`;

export class BrowserPageReader {
  /** @param {import('./agent-browser-cli.js').AgentBrowserCli} browser */
  static async create(browser) {
    return new BrowserPageReader(browser, await Bun.file(EXTRACTOR_SCRIPT).text());
  }

  constructor(browser, extractorScript) {
    this.browser = browser;
    this.extractorScript = extractorScript;
  }

  /** @returns {Promise<import('../../application/ports.js').ExtractedPage>} */
  async read(url, { waitFor } = {}) {
    await this.browser.open(url, waitFor);
    const page = JSON.parse(await this.browser.eval(this.extractorScript));
    return { ...page, pagination: page.pagination ?? { all: null, pages: [] } };
  }
}
