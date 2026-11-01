// Implementasi BrowserDriver lewat CDP langsung: Chrome diluncurkan dengan Bun.spawn dan dikendalikan
// lewat WebSocket bawaan Bun, tanpa dependency (ADR-0003).
import { CdpClient } from './cdp-client.js';
import { launchChrome, stopChrome } from './chrome-process.js';

export class CdpDriver {
  #tab = null;
  #starting = null;

  /**
   * @param {object} opts
   * @param {string} opts.chromePath
   * @param {boolean} [opts.sandbox]
   * @param {number} [opts.timeoutMs]  batas per perintah dan per navigasi
   * @param {number} [opts.pollMs]     jeda antar pengecekan `waitFor`
   * @param {typeof launchChrome} [opts.launch]
   * @param {typeof stopChrome} [opts.stop]
   */
  constructor({ chromePath, sandbox = false, timeoutMs = 60_000, pollMs = 100, launch = launchChrome, stop = stopChrome }) {
    Object.assign(this, { chromePath, sandbox, timeoutMs, pollMs, launch, stop });
  }

  async open(url, waitFor) {
    const { client, sessionId } = await this.#ready();
    let loaderId = null;
    let markLoaded;
    const seen = new Set();
    const loaded = new Promise((resolve) => (markLoaded = resolve));
    // Event bisa tiba sebelum respons `Page.navigate`, jadi semua dicatat lalu dicocokkan dengan `loaderId`-nya.
    // Iframe punya `loaderId` sendiri, sehingga hanya DOMContentLoaded dokumen utama yang cocok.
    const off = client.on((msg) => {
      if (msg.sessionId !== sessionId || msg.method !== 'Page.lifecycleEvent' || msg.params.name !== 'DOMContentLoaded') return;
      seen.add(msg.params.loaderId);
      if (msg.params.loaderId === loaderId) markLoaded();
    });
    try {
      const nav = await client.send('Page.navigate', { url }, sessionId);
      if (nav.errorText) throw new Error(`open ${url} failed: ${nav.errorText}`);
      // Tanpa `loaderId` berarti navigasi di dokumen yang sama (mis. hanya hash berubah): tidak ada load baru.
      loaderId = nav.loaderId ?? null;
      if (loaderId && !seen.has(loaderId)) await this.#within(client, loaded, `open ${url}: DOMContentLoaded`);
    } finally {
      off();
    }
    if (waitFor) await this.#waitForSelector(waitFor);
  }

  async eval(script) {
    const { client, sessionId } = await this.#ready();
    const { result, exceptionDetails } = await client.send(
      'Runtime.evaluate',
      { expression: script, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (exceptionDetails) {
      const detail = exceptionDetails.exception?.description ?? exceptionDetails.text;
      throw new Error(`eval failed: ${detail.split('\n')[0]}`);
    }
    return result.value;
  }

  async close() {
    await this.#starting?.catch(() => {});
    const tab = this.#tab;
    this.#tab = null;
    if (!tab) return;
    await tab.client.send('Browser.close').catch(() => {});
    tab.client.close();
    await this.stop(tab.chrome);
  }

  // Chrome diluncurkan saat dipakai pertama kali, dan diluncurkan ulang jika koneksinya putus (Chrome crash).
  async #ready() {
    if (this.#tab?.client.connected) return this.#tab;
    this.#starting ??= this.#relaunch().finally(() => (this.#starting = null));
    return this.#starting;
  }

  async #relaunch() {
    if (this.#tab) {
      const stale = this.#tab;
      this.#tab = null;
      stale.client.close();
      await this.stop(stale.chrome, { graceMs: 0 });
    }
    const chrome = await this.launch({ chromePath: this.chromePath, sandbox: this.sandbox, timeoutMs: this.timeoutMs });
    let client;
    try {
      client = await CdpClient.connect(chrome.wsUrl, { timeoutMs: this.timeoutMs });
      const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
      await client.send('Page.enable', {}, sessionId);
      await client.send('Page.setLifecycleEventsEnabled', { enabled: true }, sessionId);
      this.#tab = { chrome, client, sessionId };
      return this.#tab;
    } catch (err) {
      client?.close();
      await this.stop(chrome, { graceMs: 0 });
      throw err;
    }
  }

  async #waitForSelector(selector) {
    const deadline = Date.now() + this.timeoutMs;
    const check = `!!document.querySelector(${JSON.stringify(selector)})`;
    while (!(await this.eval(check))) {
      if (Date.now() >= deadline) throw new Error(`timeout waiting for selector ${selector}`);
      await Bun.sleep(this.pollMs);
    }
  }

  // Menunggu `promise`, tetapi gagal lebih awal jika batas waktu habis atau koneksi ke Chrome putus.
  async #within(client, promise, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label}: timeout after ${this.timeoutMs} ms`)), this.timeoutMs);
    });
    const closed = client.closed.then(() => {
      throw new Error(`${label}: connection closed`);
    });
    try {
      return await Promise.race([promise, timeout, closed]);
    } finally {
      clearTimeout(timer);
    }
  }
}
