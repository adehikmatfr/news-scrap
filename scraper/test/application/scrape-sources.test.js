import { describe, expect, it } from 'bun:test';
import { ScrapeArticle } from '../../src/application/scrape-article.js';
import { ScrapeSources } from '../../src/application/scrape-sources.js';
import { createSource } from '../../src/domain/source.js';
import { FakePageReader, FakePublisher, FakeSentStore, fakePage, silentLogger } from './fakes.js';

const longText = (n) => Array.from({ length: n }, (_, i) => `kata${i}`).join(' ');

function setup({ urls, pages, sent = [], publisher = new FakePublisher() }) {
  const sentStore = new FakeSentStore(sent);
  const useCase = new ScrapeSources({
    discoverer: { discover: async () => urls },
    scrapeArticle: new ScrapeArticle({ pageReader: new FakePageReader(pages), logger: silentLogger }),
    publisher,
    sentStore,
    logger: silentLogger,
    clock: () => new Date('2026-11-01T00:00:00Z'),
    sleep: async () => {},
  });
  return { useCase, publisher, sentStore };
}

const source = (overrides = {}) =>
  createSource({ name: 'contoh', discovery: { type: 'rss', url: 'https://a.com/rss' }, minWords: 5, ...overrides });

describe('ScrapeSources', () => {
  it('skips already-sent urls, publishes the rest, and records them as sent', async () => {
    const { useCase, publisher, sentStore } = setup({
      urls: ['u1', 'u2'],
      pages: { u2: fakePage(longText(10)) },
      sent: ['u1'],
    });

    const [result] = await useCase.execute([source()]);

    expect(result).toEqual({ source: 'contoh', published: 1, failed: 0 });
    expect(publisher.published).toHaveLength(1);
    const [record] = publisher.published;
    expect(record.source).toBe('contoh');
    expect(record.article.url).toBe('u2');
    expect(record.id).toMatch(/^[0-9a-f]{32}$/);
    expect(await sentStore.has('u2')).toBe(true);
  });

  it('respects maxArticles', async () => {
    const { useCase, publisher } = setup({
      urls: ['u1', 'u2', 'u3'],
      pages: { u1: fakePage(longText(10)), u2: fakePage(longText(10)), u3: fakePage(longText(10)) },
    });
    await useCase.execute([source({ maxArticles: 2 })]);
    expect(publisher.published).toHaveLength(2);
  });

  it('counts incomplete articles and publish errors as failed without recording them', async () => {
    const { useCase, sentStore } = setup({
      urls: ['short', 'down'],
      pages: { short: fakePage('terlalu pendek'), down: fakePage(longText(10)) },
      publisher: new FakePublisher({ failFor: ['down'] }),
    });

    const [result] = await useCase.execute([source()]);

    expect(result).toEqual({ source: 'contoh', published: 0, failed: 2 });
    expect(await sentStore.has('short')).toBe(false);
    expect(await sentStore.has('down')).toBe(false);
  });

  it('keeps going with other sources when discovery fails', async () => {
    const { useCase } = setup({ urls: [], pages: {} });
    useCase.discoverer = { discover: async (s) => { if (s.name === 'rusak') throw new Error('RSS down'); return []; } };

    const results = await useCase.execute([source({ name: 'rusak' }), source({ name: 'sehat' })]);

    expect(results).toEqual([
      { source: 'rusak', error: 'RSS down' },
      { source: 'sehat', published: 0, failed: 0 },
    ]);
  });
});
