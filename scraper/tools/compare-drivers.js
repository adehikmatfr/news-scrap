#!/usr/bin/env bun
// Benchmark driver browser (ADR-0003 bagian 6): setiap URL dibuka oleh semua driver secara bergiliran.
// Tanpa webhook, tanpa cron, dan tanpa menyentuh statePath.
//
//   bun tools/compare-drivers.js [--sources a,b] [--articles 3] [--drivers agent-browser,cdp,playwright]
//                                [--config config.json] [--out data/bench-<waktu>.json]
import { assertComplete } from '../src/domain/article.js';
import { loadConfig } from '../src/infrastructure/config/load-config.js';
import { buildPlan, hash, parseBenchArgs, percentile, runAcrossDrivers } from './bench-common.js';

// Memori per driver dari pohon proses Chrome (Windows): akar Chrome dikenali dari argumen `--user-data-dir`-nya.
function startMemorySampler(chromePath, intervalMs = 2_000) {
  if (process.platform !== 'win32') return { peaks: null, stop() {} };
  // Path di argumen bisa memakai `/`, `\`, atau awalan `\\?\`, tergantung driver yang meluncurkan Chrome.
  const normalize = (s) => s.replace('\\\\?\\', '').replaceAll('\\', '/').toLowerCase();
  const chromeDir = normalize(chromePath).replace(/\/[^/]+$/, '');
  const peaks = {};
  const shell = Bun.which('pwsh') ?? 'powershell';
  const script = `while ($true) {
    $p = Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name LIKE 'agent-browser%'" |
      Select-Object ProcessId, ParentProcessId, Name, CommandLine, PrivatePageCount
    ConvertTo-Json -Compress -Depth 2 -InputObject @($p)
    Start-Sleep -Milliseconds ${intervalMs}
  }`;
  const proc = Bun.spawn([shell, '-NoProfile', '-Command', script], { stdout: 'pipe', stderr: 'ignore', windowsHide: true });

  const classify = (root, byPid) => {
    const cmd = normalize(root.CommandLine ?? '');
    if (!cmd.includes(chromeDir)) return null;
    if (cmd.includes('newscraper-chrome-')) return 'cdp';
    if (cmd.includes('playwright')) return 'playwright';
    if (cmd.includes('agent-browser-chrom') || byPid.get(root.ParentProcessId)?.Name?.startsWith('agent-browser')) return 'agent-browser';
    return 'unknown';
  };

  (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of proc.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith('[')) continue;
        const procs = JSON.parse(line);
        const byPid = new Map(procs.map((p) => [p.ProcessId, p]));
        const totals = {};
        for (const p of procs) {
          let driver;
          if (p.Name.startsWith('agent-browser')) driver = 'agent-browser';
          else {
            let root = p;
            while (byPid.get(root.ParentProcessId)?.Name === 'chrome.exe') root = byPid.get(root.ParentProcessId);
            driver = classify(root, byPid);
          }
          if (driver) totals[driver] = (totals[driver] ?? 0) + Number(p.PrivatePageCount ?? 0);
        }
        for (const [driver, bytes] of Object.entries(totals)) peaks[driver] = Math.max(peaks[driver] ?? 0, bytes);
      }
    }
  })();
  return { peaks, stop: () => proc.kill() };
}

async function main() {
  const opts = parseBenchArgs(Bun.argv.slice(2), { outPrefix: 'bench' });
  const config = await loadConfig(opts.config);
  const plan = await buildPlan(config, opts.sources, opts.articles, opts.urls);

  const sampler = startMemorySampler(config.browser.chromePath ?? '');
  const records = [];
  const startedAt = new Date();
  try {
    await runAcrossDrivers(plan, opts.drivers, config, {
      onResult({ driver, source, url, cold, ms, article, error }) {
        const rec = { driver, source: source.name, url, cold, ms };
        try {
          if (error) throw new Error(error);
          assertComplete(article, source.minWords);
          Object.assign(rec, {
            ok: true,
            words: article.word_count,
            images: article.images.length,
            pages: article.page_count,
            title: hash(article.title),
            content: hash(article.content_text),
            published: article.published_at ?? null,
          });
        } catch (err) {
          Object.assign(rec, { ok: false, error: err.message.split('\n')[0].slice(0, 200) });
        }
        records.push(rec);
        console.error(`${rec.ok ? 'ok  ' : 'FAIL'} ${driver.padEnd(13)} ${String(ms).padStart(6)} ms  ${source.name}  ${rec.error ?? ''}`);
      },
    });
  } finally {
    sampler.stop();
  }

  // 3. Ringkasan.
  const summary = opts.drivers.map((name) => {
    const mine = records.filter((r) => r.driver === name);
    const warm = mine.filter((r) => r.ok && !r.cold).map((r) => r.ms);
    return {
      driver: name,
      ok: `${mine.filter((r) => r.ok).length}/${mine.length}`,
      coldMs: mine.find((r) => r.cold)?.ms ?? null,
      medianMs: percentile(warm, 50),
      p95Ms: percentile(warm, 95),
      peakPrivateMB: sampler.peaks ? Math.round((sampler.peaks[name] ?? 0) / 2 ** 20) : null,
    };
  });
  const perSource = plan.map(({ source }) => {
    const row = { source: source.name };
    for (const name of opts.drivers) {
      const mine = records.filter((r) => r.driver === name && r.source === source.name);
      row[name] = `${mine.filter((r) => r.ok).length}/${mine.length} · ${percentile(mine.filter((r) => r.ok).map((r) => r.ms), 50) ?? '-'} ms`;
    }
    return row;
  });
  const baseline = opts.drivers[0];
  const parity = { compared: 0, identical: 0, different: [] };
  for (const url of new Set(records.map((r) => r.url))) {
    const ok = records.filter((r) => r.url === url && r.ok);
    const base = ok.find((r) => r.driver === baseline);
    for (const r of ok.filter((x) => x.driver !== baseline && base)) {
      parity.compared++;
      if (r.content === base.content && r.title === base.title) parity.identical++;
      else parity.different.push({ url, driver: r.driver, words: r.words, baselineWords: base.words });
    }
  }

  console.table(summary);
  console.table(perSource);
  console.log(`kesetaraan isi vs ${baseline}: ${parity.identical}/${parity.compared} identik`);
  for (const d of parity.different) console.log(`  beda: ${d.driver} ${d.url} (${d.words} vs ${d.baselineWords} kata)`);
  for (const r of records.filter((x) => !x.ok)) console.log(`  gagal: ${r.driver} ${r.source} ${r.url}: ${r.error}`);
  if (sampler.peaks?.unknown) console.log(`  memori tak teratribusi: ${Math.round(sampler.peaks.unknown / 2 ** 20)} MB`);

  await Bun.write(
    opts.out,
    JSON.stringify(
      {
        startedAt,
        finishedAt: new Date(),
        platform: `${process.platform}-${process.arch}`,
        bun: Bun.version,
        chromePath: config.browser.chromePath,
        delayMs: config.delayMs,
        articlesPerSource: opts.articles,
        summary,
        perSource,
        parity,
        peakBytes: sampler.peaks,
        records,
      },
      null,
      2,
    ),
  );
  console.log(`hasil lengkap: ${opts.out}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
