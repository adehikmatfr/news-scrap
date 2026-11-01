import { describe, expect, it } from 'bun:test';
import { ScrapeArticle } from '../../src/application/scrape-article.js';
import { FakePageReader, fakePage, silentLogger } from './fakes.js';

const options = { maxPages: 10, preferAllPage: true };
const scrape = (pages, url, opts = options) =>
  new ScrapeArticle({ pageReader: new FakePageReader(pages), logger: silentLogger }).execute(url, opts);

describe('ScrapeArticle', () => {
  it('returns a single-page article as is', async () => {
    const a = await scrape({ u1: fakePage('isi satu') }, 'u1');
    expect(a.pagination_mode).toBe('single');
    expect(a.page_count).toBe(1);
    expect(a.content_text).toBe('isi satu');
    expect(a).not.toHaveProperty('pagination');
  });

  it('prefers the show-all page', async () => {
    const a = await scrape({
      u1: fakePage('hal satu', { all: 'u1?all', pages: ['u1?2'] }),
      'u1?all': fakePage('hal satu hal dua'),
    }, 'u1');
    expect(a.pagination_mode).toBe('all');
    expect(a.page_count).toBe(2);
    expect(a.content_text).toBe('hal satu hal dua');
  });

  it('follows pages when there is no show-all page, including links found on later pages', async () => {
    const a = await scrape({
      u1: fakePage('satu', { pages: ['u2'] }),
      u2: fakePage('dua', { pages: ['u3'] }),
      u3: fakePage('tiga'),
    }, 'u1');
    expect(a.pagination_mode).toBe('sequential');
    expect(a.page_count).toBe(3);
    expect(a.content_text).toBe('satu\n\ndua\n\ntiga');
    expect(a.word_count).toBe(3);
  });

  it('falls back to following pages when the show-all page fails', async () => {
    const a = await scrape({
      u1: fakePage('satu', { all: 'broken', pages: ['u2'] }),
      u2: fakePage('dua'),
    }, 'u1');
    expect(a.pagination_mode).toBe('sequential');
    expect(a.content_text).toBe('satu\n\ndua');
  });

  it('stops when a page repeats content (site ignores the page parameter)', async () => {
    const a = await scrape({
      u1: fakePage('sama', { pages: ['u2', 'u3'] }),
      u2: fakePage('sama'),
      u3: fakePage('tidak terbaca'),
    }, 'u1');
    expect(a.page_count).toBe(1);
  });

  it('respects maxPages', async () => {
    const a = await scrape({
      u1: fakePage('a', { pages: ['u2', 'u3'] }),
      u2: fakePage('b'),
      u3: fakePage('c'),
    }, 'u1', { ...options, maxPages: 2 });
    expect(a.page_count).toBe(2);
  });
});
