// Implementasi port SentStore: mencatat URL yang sudah terkirim di file JSON.
import { $ } from 'bun';

export class JsonFileSentStore {
  /**
   * @param {string} file
   * @param {{readOnly?: boolean}} [options]  readOnly dipakai saat --dry-run: baca catatan, jangan menulis
   */
  constructor(file, { readOnly = false } = {}) {
    this.file = file;
    this.readOnly = readOnly;
    this.sent = {};
  }

  async load() {
    const file = Bun.file(this.file);
    if (await file.exists()) this.sent = await file.json();
    return this;
  }

  async has(url) {
    return Boolean(this.sent[url]);
  }

  async markSent(url, info) {
    if (this.readOnly) return;
    this.sent[url] = { ...info, sentAt: new Date().toISOString() };
    // Tulis ke file sementara lalu pindahkan, supaya file tidak rusak jika proses mati di tengah jalan.
    // Bun.write otomatis membuat folder induk.
    const tmp = `${this.file}.tmp`;
    await Bun.write(tmp, JSON.stringify(this.sent, null, 2));
    await $`mv ${tmp} ${this.file}`.quiet();
  }
}
