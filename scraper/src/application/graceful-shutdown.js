/**
 * Urutan penghentian server (ADR-0002): hentikan jadwal, tandai tidak sehat, batalkan antrean,
 * tunggu sumber yang sedang berjalan (dibatasi `timeoutMs`), lalu tutup sumber daya.
 *
 * @param {object} deps
 * @param {import('./ports.js').Scheduler} deps.scheduler
 * @param {import('./source-run-queue.js').SourceRunQueue} deps.queue
 * @param {Array<() => Promise<void>>} deps.closers  dijalankan berurutan setelah antrean selesai (browser, server HTTP)
 * @param {() => void} deps.markUnhealthy
 * @param {number} deps.timeoutMs
 * @param {import('./ports.js').Logger} deps.logger
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 * @returns {Promise<{timedOut: boolean}>}
 */
export async function gracefulShutdown({ scheduler, queue, closers, markUnhealthy, timeoutMs, logger, sleep = Bun.sleep }) {
  scheduler.stopAll();
  markUnhealthy();

  const timedOut = await Promise.race([
    queue.close().then(() => false),
    sleep(timeoutMs).then(() => true),
  ]);
  if (timedOut) logger.warn('shutdown timeout', { timeoutMs });

  for (const close of closers) {
    try {
      await close();
    } catch (err) {
      logger.warn('close failed', { error: err.message });
    }
  }
  return { timedOut };
}
