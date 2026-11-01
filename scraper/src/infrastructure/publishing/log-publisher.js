// Implementasi port ArticlePublisher untuk --dry-run: tampilkan payload, tidak mengirim apa pun.
import { toPayload } from './payload.js';

export class LogPublisher {
  /** @param {import('../../application/ports.js').Logger} logger */
  constructor(logger) {
    this.logger = logger;
  }

  async publish(record) {
    const payload = toPayload(record);
    const { content_text, ...article } = payload.article;
    // Isi dipotong hanya untuk tampilan log.
    this.logger.info('dry-run', { ...payload, article: { ...article, content_text: `${content_text.slice(0, 120)}...` } });
    return { status: 0 };
  }
}
