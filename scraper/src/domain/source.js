// Situs berita yang di-scrape, beserta nilai default-nya.

export const DISCOVERY_TYPES = ['rss', 'index'];

const DEFAULTS = {
  pattern: null,
  waitFor: null,
  minWords: 50,
  maxArticles: Infinity,
  maxPages: 10,
  preferAllPage: true,
};

export function createSource(raw) {
  if (!raw?.name) throw new Error('source.name is required');
  if (!DISCOVERY_TYPES.includes(raw.discovery?.type)) {
    throw new Error(`source ${raw.name}: discovery.type must be one of ${DISCOVERY_TYPES.join(', ')}`);
  }
  if (!raw.discovery.url) throw new Error(`source ${raw.name}: discovery.url is required`);

  return Object.freeze({
    ...DEFAULTS,
    ...raw,
    pattern: raw.pattern ? new RegExp(raw.pattern) : null,
  });
}
