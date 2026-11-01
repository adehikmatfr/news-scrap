import { describe, expect, it } from 'bun:test';
import { discoveryDates, formatDate, hasPlaceholder, renderDiscoveryUrl } from '../../src/domain/discovery.js';

describe('discovery', () => {
  it('formats dates in the configured timezone', () => {
    const justAfterMidnightWib = new Date('2026-11-01T17:35:00Z'); // 2 Nov 00:35 WIB
    expect(formatDate(justAfterMidnightWib, 'Asia/Jakarta')).toBe('2026-11-02');
    expect(formatDate(justAfterMidnightWib, 'UTC')).toBe('2026-11-01');
  });

  it('lists today first, then earlier days', () => {
    const now = new Date('2026-11-01T17:35:00Z');
    expect(discoveryDates(now, 'Asia/Jakarta', 1)).toEqual(['2026-11-02']);
    expect(discoveryDates(now, 'Asia/Jakarta', 2)).toEqual(['2026-11-02', '2026-11-01']);
  });

  it('renders {date} and {page} placeholders', () => {
    const template = 'https://news.example.com/index?date={date}&page={page}';
    expect(renderDiscoveryUrl(template, { date: '2026-11-02', page: 3 })).toBe('https://news.example.com/index?date=2026-11-02&page=3');
    expect(renderDiscoveryUrl('https://news.example.com/rss', { date: 'x', page: 1 })).toBe('https://news.example.com/rss');
    expect(hasPlaceholder(template, 'page')).toBe(true);
    expect(hasPlaceholder('https://news.example.com/rss', 'date')).toBe(false);
  });
});
