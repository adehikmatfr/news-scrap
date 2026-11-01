// Klien Chrome DevTools Protocol di atas WebSocket bawaan Bun: korelasi request/respons dan langganan event.

export class CdpClient {
  #ws;
  #nextId = 0;
  #pending = new Map();
  #listeners = new Set();

  /** @param {string} url  alamat `ws://` yang dicetak Chrome saat start */
  static async connect(url, { timeoutMs = 60_000 } = {}) {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`CDP connect timeout: ${url}`));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`CDP connect failed: ${url}`));
      };
    });
    return new CdpClient(ws, timeoutMs);
  }

  constructor(ws, timeoutMs) {
    this.#ws = ws;
    this.timeoutMs = timeoutMs;
    // Request yang masih menunggu ditolak saat koneksi putus; tanpa ini `close()` setelah Chrome crash menggantung.
    this.closed = new Promise((resolve) => {
      ws.onclose = () => {
        for (const [id, req] of this.#pending) this.#settle(id, req, new Error(`CDP ${req.method}: connection closed`));
        resolve();
      };
    });
    ws.onmessage = (event) => this.#dispatch(JSON.parse(event.data));
  }

  get connected() {
    return this.#ws.readyState === WebSocket.OPEN;
  }

  send(method, params = {}, sessionId) {
    if (!this.connected) return Promise.reject(new Error(`CDP ${method}: connection closed`));
    const id = ++this.#nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => this.#settle(id, this.#pending.get(id), new Error(`CDP ${method}: timeout after ${this.timeoutMs} ms`)),
        this.timeoutMs,
      );
      this.#pending.set(id, { method, resolve, reject, timer });
      this.#ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    });
  }

  /** @returns {() => void} pembatal langganan */
  on(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  close() {
    this.#ws.close();
  }

  #dispatch(msg) {
    if (msg.id === undefined) {
      for (const listener of this.#listeners) listener(msg);
      return;
    }
    const req = this.#pending.get(msg.id);
    if (!req) return;
    if (msg.error) this.#settle(msg.id, req, new Error(`CDP ${req.method}: ${msg.error.message}`));
    else this.#settle(msg.id, req, null, msg.result);
  }

  #settle(id, req, error, result) {
    if (!req) return;
    clearTimeout(req.timer);
    this.#pending.delete(id);
    if (error) req.reject(error);
    else req.resolve(result);
  }
}
