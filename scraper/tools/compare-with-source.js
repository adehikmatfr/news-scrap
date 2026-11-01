#!/usr/bin/env bun
// Benchmark akurasi: hasil ekstraksi tiap driver dibandingkan dengan halaman aslinya. Referensi diambil dari
// HTML lewat HTTP biasa (tanpa driver) dengan selector per situs, lalu diurai HTMLRewriter.
// Tanpa webhook, tanpa cron, dan tanpa menyentuh statePath.
//
//   bun tools/compare-with-source.js [--sources a,b] [--articles 3] [--drivers agent-browser,cdp,playwright]
//                                    [--config config.json] [--out data/accuracy-<waktu>.json]
import { loadConfig } from '../src/infrastructure/config/load-config.js';
import { buildPlan, parseBenchArgs, runAcrossDrivers } from './bench-common.js';

/**
 * Selector halaman asli per situs, dipilih manual dari struktur halaman pada 2 November 2026.
 * `body`: wadah isi berita; `lines`: isi tidak dibungkus <p>, dipecah per baris; `exclude`: elemen di dalam
 * wadah yang bukan isi berita; `title`/`author`/`date`: elemen yang terlihat pembaca (null = tidak dinilai).
 */
const REFERENCE = {
  antaranews: { title: 'h1', body: '.post-content', exclude: ['p.text-muted'], author: '.post-content p.text-muted', date: '.wrap__article-detail-info .text-secondary' },
  cnnindonesia: { title: '#article-judul', body: '#article-content-body', date: '#article-timestamp' },
  detik: { title: 'h1.detail__title', body: '.detail__body-text', author: '.detail__author', date: '.detail__date' },
  tempo: { title: 'h1', body: '.detail-in' },
  republika: { title: '.max-card__title h1', body: '.article-content', date: '.date-item__headline' },
  liputan6: { title: 'h1.read-page--header--title', body: '.article-content-body__item-content', author: '.read-page-box__author__datetime__wrapper', date: '.read-page-box__author__datetime' },
  sindonews: { title: 'h1.detail-title', body: '.detail-desc', lines: true, author: 'a[rel="author"]', date: '.detail-date-artikel' },
  cnbcindonesia: { title: 'h1.detail-title', body: '.detail-text' },
  okezone: { title: '.title-article h1', body: '.c-detail.read' },
  viva: { title: 'h1.main-content-title', body: '.main-content-detail', author: '.main-content-author', date: '.main-content-date' },
};

// Elemen di dalam wadah yang bukan isi berita. `figure`/`figcaption` hanya dikecualikan dari teks, bukan dari gambar.
const EXCLUDE_TAGS = new Set(['script', 'style', 'noscript', 'iframe', 'ins', 'aside', 'blockquote', 'svg', 'button', 'form']);
const TEXT_ONLY_TAGS = new Set(['figure', 'figcaption']);
const EXCLUDE_ATTR = /baca-?juga|related|advert|parallax|div-gpt-ad|(^|[\s_-])ads?($|[\s_-])/i;
const LINE_BREAK_TAGS = new Set(['br', 'p', 'div', 'li', 'h2', 'h3', 'h4']);

// `spec.exclude` berisi selector sederhana `tag.kelas`.
function exclusionOf(el, extra) {
  const tag = el.tagName.toLowerCase();
  const classes = (el.getAttribute('class') ?? '').split(/\s+/);
  if (EXCLUDE_TAGS.has(tag) || EXCLUDE_ATTR.test(`${el.getAttribute('class') ?? ''} ${el.getAttribute('id') ?? ''}`)) return 'all';
  for (const sel of extra) {
    const [t, ...cls] = sel.split('.');
    if ((!t || t === tag) && cls.every((c) => classes.includes(c))) return 'all';
  }
  return TEXT_ONLY_TAGS.has(tag) ? 'text' : null;
}
// Paragraf yang terlihat di wadah tetapi bukan isi berita: label navigasi/iklan, placeholder video,
// inisial atau kredit redaksi dalam kurung, dan pernyataan hak cipta penerbit.
const NOISE_LINE =
  /^(baca juga|baca:|simak juga|lihat juga|saksikan juga|scroll to continue|advertisement|ikuti (berita|kami)|dapatkan (berita|update)|dilarang (keras )?mengambil konten|\[gambas:[^\]]*\]$|\([\p{L} .'/-]{2,60}\)$)/iu;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
const clean = (s) => decode(s).replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s ?? '').toLowerCase().replace(/[“”"'’‘`]/g, '').replace(/\s+/g, ' ');

/** Isi, gambar, dan teks elemen yang terlihat dari HTML asli. */
// Satu handler per elemen di dalam wadah: HTMLRewriter hanya menyimpan satu `onEndTag` per elemen,
// jadi dua selector yang sama-sama memasang `onEndTag` membuat penghitung tidak pernah kembali ke nol.
async function readReference(html, spec, pageUrl) {
  const state = { inBody: 0, excludedAll: 0, excludedText: 0, inP: 0, buffer: '', paragraphs: [], images: [] };
  const flush = () => {
    const text = clean(state.buffer);
    if (text) state.paragraphs.push(text);
    state.buffer = '';
  };
  const extra = spec.exclude ?? [];
  const texts = {};
  const rewriter = new HTMLRewriter().on(spec.body, {
    element(el) {
      state.inBody++;
      el.onEndTag(() => {
        state.inBody--;
        flush();
      });
    },
  });
  rewriter.on(`${spec.body} *`, {
    element(el) {
      const tag = el.tagName.toLowerCase();
      if (tag === 'img') {
        const src = el.getAttribute('data-src') || el.getAttribute('data-original') || el.getAttribute('src');
        if (!state.excludedAll && src && !src.startsWith('data:')) state.images.push(new URL(decode(src), pageUrl).href);
        return;
      }
      const exclusion = exclusionOf(el, extra);
      if (exclusion) {
        const key = exclusion === 'all' ? 'excludedAll' : 'excludedText';
        state[key]++;
        el.onEndTag(() => state[key]--);
        return;
      }
      if (state.excludedAll || state.excludedText) return;
      if (spec.lines) {
        if (LINE_BREAK_TAGS.has(tag)) flush();
      } else if (tag === 'p') {
        flush();
        state.inP++;
        el.onEndTag(() => {
          state.inP--;
          flush();
        });
      }
    },
  });
  // Teks hanya dari elemen pertama yang cocok; tanpa `onEndTag`, supaya tidak bentrok dengan handler wadah.
  for (const field of ['title', 'author', 'date']) {
    if (!spec[field]) continue;
    texts[field] = null;
    let matches = 0;
    rewriter.on(spec[field], {
      element() {
        matches++;
        if (matches === 1) texts[field] = '';
      },
      text(t) {
        if (matches === 1) texts[field] += t.text;
      },
    });
  }
  rewriter.onDocument({
    text(t) {
      if (state.inBody && !state.excludedAll && !state.excludedText && (spec.lines || state.inP)) state.buffer += t.text;
    },
  });
  const links = [];
  rewriter.on('a[href]', {
    element(el) {
      links.push(el.getAttribute('href'));
    },
  });
  await rewriter.transform(new Response(html)).text();
  flush();
  for (const k of Object.keys(texts)) texts[k] = texts[k] === null ? null : clean(texts[k]);
  return {
    ...texts,
    paragraphs: state.paragraphs.filter((p) => !NOISE_LINE.test(p)),
    images: [...new Set(state.images)],
    nextPages: articlePages(links, pageUrl),
  };
}

// Halaman lanjutan artikel yang sama: path ini sendiri dengan `?page=N` atau akhiran `/N` (N ≥ 2).
function articlePages(hrefs, pageUrl) {
  const here = new URL(pageUrl);
  const base = here.pathname.replace(/\/$/, '');
  const pages = new Map();
  for (const href of hrefs) {
    let u;
    try {
      u = new URL(decode(href), pageUrl);
    } catch {
      continue;
    }
    if (u.origin !== here.origin) continue;
    const path = u.pathname.replace(/\/$/, '');
    const n = path === base ? Number(u.searchParams.get('page')) : path.startsWith(`${base}/`) ? Number(path.slice(base.length + 1)) : NaN;
    if (Number.isInteger(n) && n >= 2) pages.set(n, (u.hash = '', u.href));
  }
  return [...pages].sort((a, b) => a[0] - b[0]).map(([, href]) => href);
}

/** Referensi lengkap: halaman pertama ditambah halaman lanjutannya (maks. `maxPages`), dengan jeda antar request. */
async function fetchReference(url, spec, { userAgent, delayMs, maxPages }) {
  const get = async (u) => {
    const res = await fetch(u, { headers: { 'user-agent': userAgent }, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // URL akhir setelah redirect: link halaman lanjutan memakai path ini, bukan path dari RSS.
    return readReference(await res.text(), spec, res.url || u);
  };
  const first = await get(url);
  const paragraphs = [...first.paragraphs];
  const images = [...first.images];
  for (const next of first.nextPages.slice(0, maxPages - 1)) {
    await Bun.sleep(delayMs);
    const page = await get(next);
    paragraphs.push(...page.paragraphs);
    images.push(...page.images);
  }
  return { ...first, paragraphs, images: [...new Set(images)], pages: 1 + Math.min(first.nextPages.length, maxPages - 1) };
}

const MONTHS = {
  jan: 1, januari: 1, january: 1, feb: 2, februari: 2, february: 2, mar: 3, maret: 3, march: 3, apr: 4, april: 4,
  mei: 5, may: 5, jun: 6, juni: 6, june: 6, jul: 7, juli: 7, july: 7, agu: 8, agt: 8, ags: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, oct: 10, october: 10, nov: 11, november: 11, des: 12, desember: 12, dec: 12, december: 12,
};
/** Tanggal yang terlihat ("Senin, 02 Nov 2026 04:10 WIB") menjadi "2026-11-02 04:10"; null jika tidak terbaca. */
function parseVisibleDate(text) {
  const m = text?.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\D{1,12}?(\d{1,2})[:.](\d{2})/);
  const month = m && MONTHS[m[2].toLowerCase()];
  if (!month) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${m[3]}-${pad(month)}-${pad(m[1])} ${pad(m[4])}:${m[5]}`;
}
function toWib(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// Nama dari baris penulis yang terlihat: buang label dan nama media ("Oleh", "Pewarta:", "- detikNews").
const bylineNames = (text) =>
  text
    ?.replace(/editor\s*:.*$/i, '')
    .replace(/^(oleh|pewarta|penulis|reporter)\s*:?\s*/i, '')
    .replace(/\s+-\s+\S+$/, '')
    .replace(/diterbitkan.*$/i, '')
    .split(/,|\bdan\b|&/)
    .map((n) => norm(n))
    .filter((n) => n.length > 2) ?? [];

const words = (text) => norm(text).split(' ').filter(Boolean);
function overlap(refText, extText) {
  const count = new Map();
  for (const w of words(refText)) count.set(w, (count.get(w) ?? 0) + 1);
  let hit = 0;
  const ext = words(extText);
  for (const w of ext) {
    const c = count.get(w);
    if (c) {
      hit++;
      count.set(w, c - 1);
    }
  }
  const refTotal = words(refText).length;
  return { recall: refTotal ? hit / refTotal : null, precision: ext.length ? hit / ext.length : null };
}
const imageKey = (u) => {
  try {
    return new URL(u).pathname.split('/').pop().toLowerCase();
  } catch {
    return u;
  }
};

/** Skor satu hasil ekstraksi terhadap referensi. */
function score(article, ref, siteName) {
  const ext = article.content_text ?? '';
  const extParas = ext.split('\n\n').filter(Boolean);
  const refText = ref.paragraphs.join(' ');
  const { recall, precision } = overlap(refText, ext);
  // Per kata, bukan per paragraf utuh: ekstraktor dan referensi bisa memecah paragraf secara berbeda.
  const covered = (paragraph, bag) => {
    const ws = words(paragraph);
    return ws.length > 0 && ws.filter((w) => bag.has(w)).length / ws.length >= 0.5;
  };
  const extBag = new Set(words(ext));
  const refBag = new Set(words(refText));
  const missing = ref.paragraphs.filter((p) => !covered(p, extBag));
  const extra = extParas.filter((p) => !covered(p, refBag));

  const title = ref.title == null ? 'n/a' : norm(article.title) === norm(ref.title) ? 'sama' : norm(article.title).includes(norm(ref.title)) || norm(ref.title).includes(norm(article.title)) ? 'mirip' : 'beda';
  const visibleDate = parseVisibleDate(ref.date);
  const date = !ref.date ? 'n/a' : !visibleDate ? 'tak terbaca' : toWib(article.published_at) === visibleDate ? 'sama' : article.published_at ? 'beda' : 'kosong';
  const names = bylineNames(ref.author);
  const extNames = (article.authors ?? []).map(norm);
  const publisherOnly = extNames.length > 0 && extNames.every((n) => n.replace(/\s/g, '').includes(siteName.slice(0, 5)) || /indonesia|news|media|redaksi/.test(n));
  const author = !ref.author ? 'n/a' : !names.length ? 'tak terbaca' : names.some((n) => extNames.some((e) => e.includes(n) || n.includes(e))) ? 'sama' : !extNames.length ? 'kosong' : publisherOnly ? 'nama media' : 'beda';
  const refImgs = new Set(ref.images.map(imageKey));
  const extImgs = (article.images ?? []).map((i) => imageKey(i.url));
  return {
    title,
    date,
    author,
    recall,
    precision,
    refParagraphs: ref.paragraphs.length,
    missing: missing.length,
    extra: extra.length,
    extraSamples: extra.slice(0, 3).map((p) => p.slice(0, 90)),
    missingSamples: missing.slice(0, 2).map((p) => p.slice(0, 90)),
    refImages: refImgs.size,
    imagesFound: [...refImgs].filter((k) => extImgs.includes(k)).length,
    imagesExtra: extImgs.filter((k) => !refImgs.has(k)).length,
    hasDescription: Boolean(article.description),
    hasSection: Boolean(article.section),
    hasTags: (article.tags ?? []).length > 0,
    hasMainImage: Boolean(article.main_image),
    publishedAt: article.published_at ?? null,
    visibleDate,
    authors: article.authors ?? [],
    visibleAuthor: ref.author,
  };
}

const pct = (x) => (x == null ? '-' : `${Math.round(x * 100)}%`);
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

async function main() {
  const opts = parseBenchArgs(Bun.argv.slice(2), { outPrefix: 'accuracy' });
  const config = await loadConfig(opts.config);
  const names = (opts.sources ?? config.sources.map((s) => s.name)).filter((n) => {
    if (REFERENCE[n]) return true;
    console.error(`skip ${n}: no reference selectors`);
    return false;
  });
  const plan = await buildPlan(config, names, opts.articles, opts.urls);

  const references = new Map();
  const records = [];
  await runAcrossDrivers(plan, opts.drivers, config, {
    // Referensi diambil tepat sebelum driver membuka URL yang sama, agar isi halaman sebanding.
    async beforeUrl(source, url) {
      try {
        references.set(url, await fetchReference(url, REFERENCE[source.name], { userAgent: config.userAgent, delayMs: config.delayMs, maxPages: source.maxPages }));
      } catch (err) {
        references.set(url, { error: err.message });
      }
    },
    onResult({ driver, source, url, article, error }) {
      const ref = references.get(url);
      const rec = { driver, source: source.name, url };
      if (ref.error) rec.error = `reference: ${ref.error}`;
      else if (!ref.paragraphs.length) rec.error = 'reference: no paragraphs (selector outdated?)';
      else if (error) rec.error = error;
      else Object.assign(rec, { ok: true, pages: article.page_count, refPages: ref.pages, ...score(article, ref, source.name) });
      records.push(rec);
      console.error(`${rec.ok ? 'ok  ' : 'FAIL'} ${driver.padEnd(13)} ${source.name.padEnd(13)} ${rec.ok ? `recall ${pct(rec.recall)} precision ${pct(rec.precision)}` : rec.error}`);
    },
  });

  const rowsFor = (filter) => {
    const ok = records.filter((r) => r.ok && filter(r));
    const rate = (field) => {
      const applicable = ok.filter((r) => r[field] !== 'n/a');
      return applicable.length ? `${applicable.filter((r) => r[field] === 'sama').length}/${applicable.length}` : '-';
    };
    return {
      dinilai: `${ok.length}/${records.filter(filter).length}`,
      recallIsi: pct(avg(ok.map((r) => r.recall).filter((x) => x != null))),
      presisiIsi: pct(avg(ok.map((r) => r.precision).filter((x) => x != null))),
      paragrafHilang: ok.reduce((a, r) => a + r.missing, 0),
      paragrafSampah: ok.reduce((a, r) => a + r.extra, 0),
      judul: rate('title'),
      tanggal: rate('date'),
      penulis: rate('author'),
      gambarIsi: `${ok.reduce((a, r) => a + r.imagesFound, 0)}/${ok.reduce((a, r) => a + r.refImages, 0)}`,
    };
  };
  const byDriver = opts.drivers.map((d) => ({ driver: d, ...rowsFor((r) => r.driver === d) }));
  const baseDriver = opts.drivers.includes('cdp') ? 'cdp' : opts.drivers[0];
  const bySource = plan.map(({ source }) => ({ source: source.name, ...rowsFor((r) => r.source === source.name && r.driver === baseDriver) }));
  const presence = opts.drivers.map((d) => {
    const ok = records.filter((r) => r.ok && r.driver === d);
    const share = (f) => `${ok.filter((r) => r[f]).length}/${ok.length}`;
    return { driver: d, deskripsi: share('hasDescription'), seksi: share('hasSection'), tag: share('hasTags'), gambarUtama: share('hasMainImage') };
  });

  console.table(byDriver);
  console.log(`per sumber (driver ${baseDriver}):`);
  console.table(bySource);
  console.table(presence);
  const mismatches = records.filter((r) => r.ok && r.driver === baseDriver && (r.date === 'beda' || ['beda', 'nama media', 'kosong'].includes(r.author) || r.title === 'beda'));
  for (const r of mismatches) console.log(`  ${r.source}: judul=${r.title} tanggal=${r.date} (${r.publishedAt} vs terlihat ${r.visibleDate}) penulis=${r.author} (${JSON.stringify(r.authors)} vs "${r.visibleAuthor}")`);
  for (const r of records.filter((x) => x.ok && x.driver === baseDriver && x.extra)) console.log(`  sampah ${r.source}: ${r.extraSamples.map((s) => JSON.stringify(s)).join(' | ')}`);
  for (const r of records.filter((x) => !x.ok && x.driver === baseDriver)) console.log(`  gagal ${r.source} ${r.url}: ${r.error}`);

  await Bun.write(opts.out, JSON.stringify({ startedAt: new Date(), bun: Bun.version, chromePath: config.browser.chromePath, byDriver, bySource, presence, records }, null, 2));
  console.log(`hasil lengkap: ${opts.out}`);
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

export { readReference, REFERENCE };
