// Meluncurkan Chrome headless dengan port DevTools acak dan profil sementara, lalu menghentikannya.
import { $ } from 'bun';

// Baris harus lengkap (diakhiri newline): alamat bisa terpotong di antara dua chunk stderr.
const DEVTOOLS_URL = /DevTools listening on (ws:\/\/\S+)\r?\n/;

/**
 * Membaca alamat WebSocket DevTools dari stderr Chrome. Setelah ketemu, sisa stderr tetap dibaca
 * dan dibuang, supaya Chrome tidak macet karena buffer pipe penuh.
 * @param {ReadableStream<Uint8Array>} stream
 */
export async function readDevToolsUrl(stream, timeoutMs) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Chrome did not report a DevTools URL within ${timeoutMs} ms`)), timeoutMs);
  });
  const search = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw new Error(`Chrome exited before DevTools was ready: ${buffer.trim().slice(-500)}`);
      buffer = (buffer + decoder.decode(value, { stream: true })).slice(-4096);
      const match = buffer.match(DEVTOOLS_URL);
      if (match) return match[1];
    }
  })();
  try {
    return await Promise.race([search, timeout]);
  } finally {
    clearTimeout(timer);
    void (async () => {
      try {
        while (!(await reader.read()).done);
      } catch {}
    })();
  }
}

function tempDir() {
  return (Bun.env.TMPDIR || Bun.env.TEMP || Bun.env.TMP || '/tmp').replaceAll('\\', '/');
}

/**
 * @param {object} opts
 * @param {string} opts.chromePath
 * @param {boolean} [opts.sandbox]  default `false`: `--no-sandbox`, mengikuti Playwright (ADR-0003)
 * @param {number} [opts.timeoutMs]
 */
export async function launchChrome({ chromePath, sandbox = false, timeoutMs = 60_000 }) {
  const profileDir = `${tempDir()}/newscraper-chrome-${crypto.randomUUID()}`;
  const proc = Bun.spawn(
    [
      chromePath,
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      ...(sandbox ? [] : ['--no-sandbox']),
      'about:blank',
    ],
    { stdout: 'ignore', stderr: 'pipe', windowsHide: true },
  );
  const chrome = { proc, profileDir, wsUrl: null };
  try {
    chrome.wsUrl = await readDevToolsUrl(proc.stderr, timeoutMs);
    return chrome;
  } catch (err) {
    await stopChrome(chrome, { graceMs: 0 });
    throw err;
  }
}

/** Menunggu Chrome keluar sendiri (mis. setelah `Browser.close`), lalu memaksa berhenti dan menghapus profilnya. */
export async function stopChrome({ proc, profileDir }, { graceMs = 5_000 } = {}) {
  const exited = await Promise.race([proc.exited.then(() => true), Bun.sleep(graceMs).then(() => false)]);
  if (!exited) {
    proc.kill(9);
    await proc.exited;
  }
  await $`rm -rf ${profileDir}`.quiet().nothrow();
}
