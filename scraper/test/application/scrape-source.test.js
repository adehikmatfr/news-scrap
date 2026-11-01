import { describe, expect, it } from 'bun:test';
import { ScrapeArticle } from '../../src/application/scrape-article.js';
import { ScrapeSource } from '../../src/application/scrape-source.js';
import { createSource } from '../../src/domain/source.js';
import { FakePageReader, FakePublisher, FakeSentStore, fakePage, silentLogger } from './fakes.js';

const longText = (n) => Array.from({ length: n }, (_, i) => `kata${i}`).join(' ');

function setup({ urls, pages, sent = [], publisher = new FakePublisher() }) {
  const sentStore = new FakeSentStore(sent);
  const useCase = new ScrapeSource({
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
  createSource({ name: 'contoh', schedule: '*/15 * * * *', discovery: { type: 'rss', url: 'https://a.com/rss' }, minWords: 5, ...overrides });

describe('ScrapeSource', () => {
  it('skips already-sent urls, publishes the rest, and records them as sent', async () => {
    const { useCase, publisher, sentStore } = setup({
      urls: ['u1', 'u2'],
      pages: { u2: fakePage(longText(10)) },
      sent: ['u1'],
    });

    const stats = await useCase.execute(source());

    expect(stats).toEqual({ published: 1, skipped: 0, failed: 0 });
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
    await useCase.execute(source({ maxArticles: 2 }));
    expect(publisher.published).toHaveLength(2);
  });

  it('counts incomplete articles and publish errors as failed without recording them', async () => {
    const { useCase, sentStore } = setup({
      urls: ['short', 'down'],
      pages: { short: fakePage('terlalu pendek'), down: fakePage(longText(10)) },
      publisher: new FakePublisher({ failFor: ['down'] }),
    });

    expect(await useCase.execute(source())).toEqual({ published: 0, skipped: 0, failed: 2 });
    expect(await sentStore.has('short')).toBe(false);
    expect(await sentStore.has('down')).toBe(false);
  });

  it('finishes the current article, then stops when asked', async () => {
    const { useCase, publisher } = setup({
      urls: ['u1', 'u2', 'u3'],
      pages: { u1: fakePage(longText(10)), u2: fakePage(longText(10)), u3: fakePage(longText(10)) },
    });
    let stop = false;
    publisher.onPublish = () => (stop = true);

    const stats = await useCase.execute(source(), { shouldStop: () => stop });

    expect(stats).toEqual({ published: 1, skipped: 0, failed: 0 });
  });

  it('skips articles older than maxAgeHours and records them so they are not reopened', async () => {
    const old = { ...fakePage(longText(10)), published_at: '2019-08-01T12:42:15+07:00' };
    const fresh = { ...fakePage(longText(10)), published_at: '2026-10-31T20:00:00Z' };
    const { useCase, publisher, sentStore } = setup({ urls: ['old', 'fresh'], pages: { old, fresh } });

    const stats = await useCase.execute(source({ maxAgeHours: 48 }));

    expect(stats).toEqual({ published: 1, skipped: 1, failed: 0 });
    expect(publisher.published.map((r) => r.article.url)).toEqual(['fresh']);
    expect(sentStore.sent.get('old').status).toBe('skipped:too-old');
  });

  it('propagates discovery errors to the caller', async () => {
    const { useCase } = setup({ urls: [], pages: {} });
    useCase.discoverer = { discover: async () => { throw new Error('RSS down'); } };
    await expect(useCase.execute(source())).rejects.toThrow('RSS down');
  });
});
