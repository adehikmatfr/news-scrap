/**
 * Antrean serial: satu sumber berjalan pada satu waktu, karena semua sumber memakai satu session
 * browser dan satu file state (ADR-0002). Mencatat status dan hasil jalan terakhir setiap sumber.
 */
export class SourceRunQueue {
  #pending = [];
  #current = null;
  #closed = false;
  #states = new Map();

  /**
   * @param {object} deps
   * @param {{execute: (source: object, opts: {shouldStop: () => boolean}) => Promise<{published: number, skipped: number, failed: number}>}} deps.scrapeSource
   * @param {import('./ports.js').Logger} deps.logger
   * @param {() => Date} [deps.clock]
   */
  constructor({ scrapeSource, logger, clock = () => new Date() }) {
    Object.assign(this, { scrapeSource, logger, clock });
  }

  /**
   * Resolve dengan hasil jalan (atau null jika dibatalkan); tidak pernah reject.
   * Sumber yang sudah mengantre atau sedang berjalan tidak dimasukkan dua kali.
   */
  enqueue(source) {
    if (this.#closed) return Promise.resolve(null);
    const existing = this.#states.get(source.name);
    if (existing?.done) return existing.done;

    let resolve;
    const done = new Promise((r) => (resolve = r));
    this.#update(source.name, { state: 'queued', done });
    this.#pending.push({ source, resolve });
    if (this.#current) this.logger.info('run queued', { source: source.name, position: this.#pending.length });
    void this.#pump();
    return done;
  }

  /** @returns {{state: 'idle'|'queued'|'running', lastRun: object|null}} */
  snapshot(name) {
    const s = this.#states.get(name);
    return { state: s?.state ?? 'idle', lastRun: s?.lastRun ?? null };
  }

  /** Menolak jadwal baru, membatalkan antrean, dan resolve saat sumber yang sedang berjalan selesai. */
  close() {
    this.#closed = true;
    for (const { source, resolve } of this.#pending.splice(0)) {
      this.#update(source.name, { state: 'idle', done: null });
      resolve(null);
    }
    return this.#current ?? Promise.resolve();
  }

  async #pump() {
    if (this.#current || !this.#pending.length) return;
    const { source, resolve } = this.#pending.shift();
    this.#current = this.#execute(source);
    const result = await this.#current;
    this.#current = null;
    resolve(result);
    void this.#pump();
  }

  async #execute(source) {
    const startedAt = this.clock();
    this.#update(source.name, { state: 'running' });
    this.logger.info('run started', { source: source.name });

    let lastRun;
    try {
      const stats = await this.scrapeSource.execute(source, { shouldStop: () => this.#closed });
      lastRun = { ...this.#times(startedAt), ...stats, error: null };
      this.logger.info('run finished', { source: source.name, ...stats, durationMs: lastRun.durationMs });
    } catch (err) {
      lastRun = { ...this.#times(startedAt), published: 0, skipped: 0, failed: 0, error: err.message };
      this.logger.error('run failed', { source: source.name, error: err.message, durationMs: lastRun.durationMs });
    }
    this.#update(source.name, { state: 'idle', done: null, lastRun });
    return lastRun;
  }

  #times(startedAt) {
    const finishedAt = this.clock();
    return { startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), durationMs: finishedAt - startedAt };
  }

  #update(name, patch) {
    this.#states.set(name, { ...this.#states.get(name), ...patch });
  }
}
