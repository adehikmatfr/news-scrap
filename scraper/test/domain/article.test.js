import { describe, expect, it } from 'bun:test';
import { IncompleteArticleError, articleId, assertComplete, mergePages } from '../../src/domain/article.js';
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
  it('applies defaults and compiles the pattern', () => {
    const s = createSource({ name: 'x', discovery: { type: 'rss', url: 'https://a.com/rss' }, pattern: '/berita/' });
    expect(s.maxPages).toBe(10);
    expect(s.preferAllPage).toBe(true);
    expect(s.pattern.test('https://a.com/berita/1')).toBe(true);
  });

  it('rejects unknown discovery types', () => {
    expect(() => createSource({ name: 'x', discovery: { type: 'ftp', url: 'x' } })).toThrow(/discovery.type/);
  });
});
