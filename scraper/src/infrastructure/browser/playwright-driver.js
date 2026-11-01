// Implementasi BrowserDriver lewat playwright-core (ADR-0003). Di-import dinamis oleh main.js
// hanya saat `BROWSER_DRIVER=playwright`, jadi driver lain tidak butuh paket ini.
import { chromium } from 'playwright-core';

export class PlaywrightDriver {
  #browser = null;
  #page = null;
  #starting = null;

  /**
   * @param {object} opts
   * @param {string|null} [opts.chromePath]  kosong berarti Chromium milik Playwright
   * @param {boolean} [opts.sandbox]
   * @param {number} [opts.timeoutMs]
   * @param {{launch: typeof chromium.launch}} [opts.launcher]
   */
  constructor({ chromePath = null, sandbox = false, timeoutMs = 60_000, launcher = chromium } = {}) {
    Object.assign(this, { chromePath, sandbox, timeoutMs, launcher });
  }

  async open(url, waitFor) {
    const page = await this.#ready();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.timeoutMs });
    // `attached` (cukup ada di DOM), sama dengan CdpDriver; default Playwright menunggu elemen terlihat.
    if (waitFor) await page.waitForSelector(waitFor, { state: 'attached', timeout: this.timeoutMs });
  }

  async eval(script) {
    return (await this.#ready()).evaluate(script);
  }

  async close() {
    await this.#starting?.catch(() => {});
    const browser = this.#browser;
    this.#browser = this.#page = null;
    await browser?.close().catch(() => {});
  }

  // Browser diluncurkan saat dipakai pertama kali, dan diluncurkan ulang jika koneksinya putus (Chrome crash).
  async #ready() {
    if (this.#browser?.isConnected()) return this.#page;
    this.#starting ??= this.#relaunch().finally(() => (this.#starting = null));
    return this.#starting;
  }

  async #relaunch() {
    await this.#browser?.close().catch(() => {});
    this.#browser = await this.launcher.launch({
      executablePath: this.chromePath || undefined,
      chromiumSandbox: this.sandbox,
      timeout: this.timeoutMs,
    });
    this.#page = await (await this.#browser.newContext()).newPage();
    return this.#page;
  }
}
