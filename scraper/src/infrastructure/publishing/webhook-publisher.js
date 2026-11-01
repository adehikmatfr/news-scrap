// Implementasi port ArticlePublisher: kirim artikel lewat HTTP (POST/PATCH/PUT), dengan retry.
import { toPayload } from './payload.js';

class PermanentError extends Error {}

export class WebhookPublisher {
  /**
   * @param {object} config
   * @param {string} config.url        `{id}` diganti dengan ID artikel
   * @param {string} config.method
   * @param {object} [config.headers]
   * @param {string} [config.token]    dikirim sebagai Authorization: Bearer
   * @param {number} config.timeoutMs
   * @param {number} config.retries
   */
  constructor({ url, method, headers = {}, token, timeoutMs, retries }) {
    Object.assign(this, { url, method, headers, token, timeoutMs, retries });
  }

  async publish(record) {
    const payload = toPayload(record);
    const url = this.url.replaceAll('{id}', encodeURIComponent(payload.id));
    const headers = {
      'Content-Type': 'application/json',
      'Idempotency-Key': payload.id, // penerima bisa memakai ini untuk menolak duplikat
      ...this.headers,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetch(url, {
          method: this.method,
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (res.ok) return { status: res.status };

        const body = (await res.text()).slice(0, 300);
        // 4xx (kecuali 408/429) adalah kesalahan data/konfigurasi; mengulang tidak akan membantu.
        if (res.status < 500 && ![408, 429].includes(res.status)) {
          throw new PermanentError(`HTTP ${res.status}: ${body}`);
        }
        throw new Error(`HTTP ${res.status}: ${body}`);
      } catch (err) {
        if (err instanceof PermanentError || attempt > this.retries) throw err;
        await Bun.sleep(1000 * 2 ** (attempt - 1));
      }
    }
  }
}
