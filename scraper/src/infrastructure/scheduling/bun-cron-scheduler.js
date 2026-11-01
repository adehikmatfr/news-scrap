// Implementasi port Scheduler dengan Bun.cron di dalam proses; satu job per sumber, satu zona waktu.

export class BunCronScheduler {
  #jobs = new Map();

  /** @param {{timezone: string}} options */
  constructor({ timezone }) {
    this.timezone = timezone;
  }

  // Bun.cron menunggu Promise dari handler sebelum menghitung jadwal berikutnya, jadi satu sumber tidak bertumpuk.
  schedule(source, handler) {
    this.#jobs.set(source.name, Bun.cron(source.schedule, handler, { tz: this.timezone }));
  }

  nextRun(source, from = new Date()) {
    return Bun.cron.parse(source.schedule, from, { tz: this.timezone });
  }

  stopAll() {
    for (const job of this.#jobs.values()) job.stop();
    this.#jobs.clear();
  }
}
