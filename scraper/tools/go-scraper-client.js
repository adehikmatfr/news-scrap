// Menjalankan go-scraper (ADR-0005) sebagai satu proses tetap: satu URL per baris ke stdin, satu JSON per baris dari stdout.
const BIN_NAME = process.platform === 'win32' ? 'go-scraper.exe' : 'go-scraper';

export class GoScraperProcess {
  #proc;
  #lines;

  constructor(proc) {
    this.#proc = proc;
    this.#lines = readLines(proc.stdout);
  }

  /** @param {{userAgent: string, timeoutMs: number, args?: string[]}} options  `args`: flag `extract` tambahan */
  static async start({ userAgent, timeoutMs, args = [] }) {
    const bin = Bun.env.GO_SCRAPER_BIN ?? Bun.fileURLToPath(new URL(`../../go-scraper/bin/${BIN_NAME}`, import.meta.url));
    if (!(await Bun.file(bin).exists())) throw new Error(`go-scraper binary not found: ${bin} (build: cd go-scraper && go build -o bin/${BIN_NAME} ./cmd/go-scraper)`);
    // GO_SCRAPER_ARGS menambah flag `extract` untuk semua driver Go, mis. `-focus precision`.
    const extra = (Bun.env.GO_SCRAPER_ARGS ?? '').split(/\s+/).filter(Boolean);
    const proc = Bun.spawn([bin, 'extract', '-ua', userAgent, '-timeout', `${timeoutMs}ms`, ...args, ...extra], { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit', windowsHide: true });
    return new GoScraperProcess(proc);
  }

  // Bentuk sama dengan `ScrapeArticle.execute`, supaya alat benchmark memperlakukannya seperti driver lain;
  // `maxPages` dan `preferAllPage` sumber diteruskan agar pagination diikuti dengan aturan yang sama.
  async execute(url, { maxPages, preferAllPage }) {
    this.#proc.stdin.write(`${JSON.stringify({ url, max_pages: maxPages, prefer_all_page: preferAllPage })}\n`);
    this.#proc.stdin.flush();
    const { value, done } = await this.#lines.next();
    if (done) throw new Error('go-scraper exited');
    const res = JSON.parse(value);
    if (res.error) throw new Error(res.error);
    return res.article;
  }

  async close() {
    this.#proc.stdin.end();
    await this.#proc.exited;
  }
}

async function* readLines(stream) {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      yield buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
    }
  }
}
