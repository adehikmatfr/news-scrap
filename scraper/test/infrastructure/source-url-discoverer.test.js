import { describe, expect, it } from 'bun:test';
import { createSource } from '../../src/domain/source.js';
import { SourceUrlDiscoverer } from '../../src/infrastructure/discovery/source-url-discoverer.js';

// Browser palsu: setiap URL indeks mengembalikan daftar link yang sudah ditentukan.
class FakeIndexBrowser {
  constructor(pages) {
    this.pages = pages;
    this.opened = [];
  }

  async open(url) {
    this.opened.push(url);
    this.current = url;
  }

  async eval() {
    return this.pages[this.current] ?? [];
  }
}

const article = (date, n) => `https://news.example.com/read/${date.replaceAll('-', '/')}/${n}`;

function setup(pages, discovery) {
  const browser = new FakeIndexBrowser(pages);
  const discoverer = new SourceUrlDiscoverer({
    browser,
    userAgent: 'test',
    timezone: 'Asia/Jakarta',
    clock: () => new Date('2026-11-01T17:35:00Z'), // 2 Nov 00:35 WIB
    sleep: async () => {},
  });
  const source = createSource({
    name: 'contoh',
    schedule: '@hourly',
    pattern: '^https://news\\.example\\.com/read/',
    discovery: { type: 'index', url: 'https://news.example.com/index?date={date}&page={page}', ...discovery },
  });
  return { browser, run: () => discoverer.discover(source) };
}

const idx = (date, page) => `https://news.example.com/index?date=${date}&page=${page}`;

describe('SourceUrlDiscoverer (index)', () => {
  it('follows pages until one yields no new URLs, and reads yesterday after midnight', async () => {
    const { browser, run } = setup({
      [idx('2026-11-02', 1)]: [article('2026-11-02', 1), 'https://ads.example.com/x'],
      [idx('2026-11-01', 1)]: [article('2026-11-01', 9), article('2026-11-01', 8)],
      [idx('2026-11-01', 2)]: [article('2026-11-01', 7), article('2026-11-01', 8)],
      [idx('2026-11-01', 3)]: [article('2026-11-01', 7)],
    }, { days: 2, maxPages: 10 });

    const urls = await run();

    expect(urls).toEqual([
      article('2026-11-02', 1),
      article('2026-11-01', 9),
      article('2026-11-01', 8),
      article('2026-11-01', 7),
    ]);
    expect(browser.opened).toEqual([
      idx('2026-11-02', 1), idx('2026-11-02', 2),
      idx('2026-11-01', 1), idx('2026-11-01', 2), idx('2026-11-01', 3),
    ]);
  });

  it('stops at maxPages', async () => {
    const { browser, run } = setup({
      [idx('2026-11-02', 1)]: [article('2026-11-02', 1)],
      [idx('2026-11-02', 2)]: [article('2026-11-02', 2)],
      [idx('2026-11-02', 3)]: [article('2026-11-02', 3)],
    }, { maxPages: 2 });

    expect(await run()).toHaveLength(2);
    expect(browser.opened).toHaveLength(2);
  });
});
