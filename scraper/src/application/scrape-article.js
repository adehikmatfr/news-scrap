import { mergePages } from '../domain/article.js';

/**
 * Mengambil satu artikel lengkap, termasuk artikel multi-halaman. Versi "tampilkan semua"
 * diutamakan karena cukup sekali buka; jika tidak ada atau gagal, halaman 2, 3, ... diikuti
 * lalu isi dan gambarnya digabung.
 */
export class ScrapeArticle {
  /**
   * @param {object} deps
   * @param {import('./ports.js').PageReader} deps.pageReader
   * @param {import('./ports.js').Logger} deps.logger
   */
  constructor({ pageReader, logger }) {
    this.pageReader = pageReader;
    this.logger = logger;
  }

  /**
   * @param {string} url
   * @param {{waitFor?: string|null, maxPages: number, preferAllPage: boolean}} options
   */
  async execute(url, { waitFor, maxPages, preferAllPage }) {
    const read = (pageUrl) => this.pageReader.read(pageUrl, { waitFor });

    const { pagination, ...first } = await read(url);
    const pageCount = pagination.pages.length + 1;

    if (preferAllPage && pagination.all) {
      const all = await this.#readAllPage(pagination.all, read);
      if (all && all.word_count > first.word_count) {
        return { ...all, page_count: pageCount, pagination_mode: 'all' };
      }
    }

    const pages = await this.#followPages(first, url, pagination.pages, maxPages, read);
    return {
      ...mergePages(pages),
      page_count: pages.length,
      pagination_mode: pages.length > 1 ? 'sequential' : 'single',
    };
  }

  async #readAllPage(url, read) {
    try {
      const { pagination: _, ...all } = await read(url);
      return all;
    } catch (err) {
      this.logger.warn('show-all page failed, following pages instead', { url, error: err.message });
      return null;
    }
  }

  async #followPages(first, startUrl, initialPages, maxPages, read) {
    const pages = [first];
    const visited = new Set([startUrl]);
    const queue = [...initialPages];

    while (queue.length && visited.size < maxPages) {
      const next = queue.shift();
      if (visited.has(next)) continue;
      visited.add(next);

      const { pagination, ...page } = await read(next);
      // Isi kosong atau sama persis berarti situs mengabaikan parameter halaman: berhenti.
      if (!page.content_text || pages.some((p) => p.content_text === page.content_text)) break;
      pages.push(page);

      // Sebagian situs hanya menampilkan link "berikutnya", jadi kumpulkan link dari tiap halaman.
      for (const p of pagination.pages) {
        if (!visited.has(p) && !queue.includes(p)) queue.push(p);
      }
    }
    return pages;
  }
}
