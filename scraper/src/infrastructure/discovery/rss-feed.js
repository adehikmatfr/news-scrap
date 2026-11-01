// Mengambil link artikel dari RSS/Atom lewat HTTP biasa (tanpa browser).

const decode = (s) => s
  .replace(/^<!\[CDATA\[|\]\]>$/g, '')
  .replace(/&amp;/g, '&')
  .trim();

export async function fetchFeedLinks(url, userAgent) {
  const res = await fetch(url, {
    headers: { 'User-Agent': userAgent, Accept: 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`RSS ${url}: HTTP ${res.status}`);
  const xml = await res.text();

  const links = [];
  for (const [item] of xml.matchAll(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/g)) {
    const rss = item.match(/<link>([\s\S]*?)<\/link>/);
    const atom = item.match(/<link[^>]*href="([^"]+)"/);
    const link = rss ? decode(rss[1]) : atom ? decode(atom[1]) : null;
    if (link) links.push(link);
  }
  return links;
}
