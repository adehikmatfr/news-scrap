// Format JSON yang dikirim ke sistem penerima (lihat "Kontrak untuk sistem penerima" di README).

/** @param {import('../../application/ports.js').ArticleRecord} record */
export const toPayload = ({ id, source, scrapedAt, article }) => ({
  id,
  source,
  scraped_at: scrapedAt.toISOString(),
  article,
});
