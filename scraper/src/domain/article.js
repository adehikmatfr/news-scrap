// Aturan inti tentang artikel. Tidak bergantung pada browser, HTTP, atau file.

export class IncompleteArticleError extends Error {
  constructor(article) {
    super(`incomplete article (title=${Boolean(article.title)}, words=${article.word_count})`);
    this.name = 'IncompleteArticleError';
  }
}

// ID stabil per URL, supaya penerima bisa melakukan upsert/dedup.
export const articleId = (url) => new Bun.CryptoHasher('sha256').update(url).digest('hex').slice(0, 32);

export const countWords = (text) => text.split(/\s+/).filter(Boolean).length;

export function assertComplete(article, minWords) {
  if (!article.title || article.word_count < minWords) throw new IncompleteArticleError(article);
}

// Menggabungkan halaman-halaman satu artikel: isi disambung, gambar duplikat dibuang.
export function mergePages(pages) {
  const [first] = pages;
  const content = pages.map((p) => p.content_text).join('\n\n');
  const seen = new Set();
  const images = pages.flatMap((p) => p.images).filter((img) => !seen.has(img.url) && seen.add(img.url));
  return { ...first, content_text: content, word_count: countWords(content), images };
}
