import { describe, expect, it } from 'bun:test';
import { IncompleteArticleError, articleId, assertComplete, isTooOld, mergePages } from '../../src/domain/article.js';
import { createSource } from '../../src/domain/source.js';
import { normalizeURL } from '../../src/domain/url.js';

describe('normalizeURL', () => {
  it('removes tracking params and fragment', () => {
    expect(normalizeURL('https://a.com/x?utm_source=fb&id=1&fbclid=z#top')).toBe('https://a.com/x?id=1');
  });

  it('returns null for invalid urls', () => {
    expect(normalizeURL('/relative')).toBeNull();
  });
});

describe('articleId', () => {
  it('is stable and 32 hex characters', () => {
    const id = articleId('https://a.com/x');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(articleId('https://a.com/x')).toBe(id);
    expect(articleId('https://a.com/y')).not.toBe(id);
  });
});

describe('assertComplete', () => {
  it('rejects missing title or short content', () => {
    expect(() => assertComplete({ title: '', word_count: 500 }, 50)).toThrow(IncompleteArticleError);
    expect(() => assertComplete({ title: 'T', word_count: 10 }, 50)).toThrow(IncompleteArticleError);
    expect(() => assertComplete({ title: 'T', word_count: 50 }, 50)).not.toThrow();
  });
});

describe('isTooOld', () => {
  const now = new Date('2026-11-02T00:00:00Z');

  it('compares published_at against maxAgeHours', () => {
    expect(isTooOld({ published_at: '2019-08-01T12:42:15+07:00' }, 48, now)).toBe(true);
    expect(isTooOld({ published_at: '2026-11-01T22:59:19+07:00' }, 48, now)).toBe(false);
  });

  it('never treats an article as old without a limit or a readable date', () => {
    expect(isTooOld({ published_at: '2019-08-01T12:42:15+07:00' }, null, now)).toBe(false);
    expect(isTooOld({ published_at: null }, 48, now)).toBe(false);
    expect(isTooOld({ published_at: 'kemarin sore' }, 48, now)).toBe(false);
  });
});

describe('mergePages', () => {
  it('joins content, recounts words, and dedupes images', () => {
    const merged = mergePages([
      { title: 'T', content_text: 'satu dua', images: [{ url: 'a.jpg' }] },
      { title: 'T', content_text: 'tiga', images: [{ url: 'a.jpg' }, { url: 'b.jpg' }] },
    ]);
    expect(merged.content_text).toBe('satu dua\n\ntiga');
    expect(merged.word_count).toBe(3);
    expect(merged.images.map((i) => i.url)).toEqual(['a.jpg', 'b.jpg']);
  });
});

describe('createSource', () => {
  const base = { name: 'x', schedule: '*/15 * * * *', discovery: { type: 'rss', url: 'https://a.com/rss' } };

  it('applies defaults and compiles the pattern', () => {
    const s = createSource({ ...base, pattern: '/berita/' });
    expect(s.maxPages).toBe(10);
    expect(s.preferAllPage).toBe(true);
    expect(s.pattern.test('https://a.com/berita/1')).toBe(true);
  });

  it('rejects unknown discovery types', () => {
    expect(() => createSource({ ...base, discovery: { type: 'ftp', url: 'x' } })).toThrow(/discovery.type/);
  });

  it('requires a valid schedule', () => {
    expect(() => createSource({ ...base, schedule: undefined })).toThrow(/schedule is required/);
    expect(() => createSource({ ...base, schedule: '99 * * * *' })).toThrow(/invalid schedule/);
    expect(() => createSource({ ...base, schedule: '0 0 30 2 *' })).toThrow(/never runs/);
    expect(createSource({ ...base, schedule: '@hourly' }).schedule).toBe('@hourly');
  });

  it('defaults discovery to one date and one page', () => {
    expect(createSource(base).discovery).toMatchObject({ days: 1, maxPages: 1 });
  });

  it('requires placeholders when asking for several dates or pages', () => {
    const indexed = (discovery) => createSource({ ...base, discovery: { type: 'index', url: 'https://n.example.com/i', ...discovery } });
    expect(() => indexed({ maxPages: 5 })).toThrow(/requires \{page\}/);
    expect(() => indexed({ days: 2 })).toThrow(/requires \{date\}/);
    expect(() => indexed({ url: 'https://n.example.com/i?page={page}', maxPages: 99 })).toThrow(/between 1 and 50/);
    expect(indexed({ url: 'https://n.example.com/i?date={date}&page={page}', days: 2, maxPages: 5 }).discovery)
      .toMatchObject({ days: 2, maxPages: 5 });
  });

  it('rejects a non-positive maxAgeHours', () => {
    expect(() => createSource({ ...base, maxAgeHours: 0 })).toThrow(/maxAgeHours/);
    expect(createSource({ ...base, maxAgeHours: 48 }).maxAgeHours).toBe(48);
  });
});
