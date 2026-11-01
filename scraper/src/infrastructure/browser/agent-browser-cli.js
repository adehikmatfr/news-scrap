// Pembungkus tipis untuk CLI agent-browser (Bun.spawn).

function resolveBinary() {
  if (Bun.env.AGENT_BROWSER_BIN) return Bun.env.AGENT_BROWSER_BIN;
  const found = Bun.which('agent-browser');
  if (!found) throw new Error('agent-browser not found in PATH (install: npm install -g agent-browser)');
  if (process.platform !== 'win32' || found.toLowerCase().endsWith('.exe')) return found;
  // Di Windows npm hanya memasang shim .cmd/.ps1, jadi panggil binary native di dalam paket npm-nya.
  const shimDir = found.replace(/[\\/][^\\/]+$/, '');
  return `${shimDir}\\node_modules\\agent-browser\\bin\\agent-browser-win32-${process.arch}.exe`;
}

function samePage(a, b) {
  try {
    const [x, y] = [new URL(a), new URL(b)];
    return x.origin === y.origin && x.pathname === y.pathname && x.search === y.search;
  } catch {
    return false;
  }
}

export class AgentBrowserCli {
  constructor({ session = 'newscraper', timeoutMs = 60_000 } = {}) {
    this.bin = resolveBinary();
    this.session = session;
    this.timeoutMs = timeoutMs;
  }

  async exec(args, { timeoutMs = this.timeoutMs } = {}) {
    const proc = Bun.spawn([this.bin, '--session', this.session, ...args], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: timeoutMs,
      windowsHide: true,
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      throw new Error(`agent-browser ${args[0]} failed (exit ${exitCode}): ${(stderr || stdout).trim()}`);
    }
    return stdout;
  }

  // `waitFor` (opsional): selector yang ditunggu muncul, untuk situs yang isinya dirender JavaScript.
  // Jangan pakai `wait --load networkidle`: iklan membuat situs berita jarang "idle", dan daemon
  // tetap menunggu sampai batas waktunya sendiri walaupun proses CLI sudah dihentikan.
  async open(url, waitFor) {
    try {
      await this.exec(['open', url]);
    } catch (err) {
      // Pada situs berat (mis. kompas.com) `open` kadang gagal mengembalikan respons
      // walaupun halaman sudah terbuka. Anggap berhasil jika browser sudah di URL tujuan.
      const current = (await this.exec(['get', 'url']).catch(() => '')).trim();
      if (!samePage(current, url)) throw err;
    }
    if (waitFor) await this.exec(['wait', waitFor]);
  }

  // Script dikirim base64 untuk menghindari masalah escaping; output agent-browser berupa nilai JSON.
  async eval(script) {
    const out = await this.exec(['eval', '-b', new TextEncoder().encode(script).toBase64()]);
    return JSON.parse(out.trim());
  }

  async close() {
    await this.exec(['close']).catch(() => {});
  }
}
