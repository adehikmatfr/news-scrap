// Ekstraktor artikel berita generik; dijalankan di dalam halaman lewat `eval` driver browser.
// Prioritas metadata: JSON-LD (NewsArticle) -> OpenGraph/meta -> parsing DOM.
// Akurasinya diukur dengan `bun run bench:accuracy` (README: Benchmark akurasi terhadap halaman asli).
(() => {
  const meta = (sel) => document.querySelector(sel)?.getAttribute('content')?.trim() || null;
  const abs = (u) => { try { return u ? new URL(u, location.href).href : null; } catch { return null; } };

  // --- JSON-LD ---
  const ldItems = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(s.textContent);
      const stack = Array.isArray(data) ? data : [data];
      for (const d of stack) {
        if (d?.['@graph']) ldItems.push(...d['@graph']);
        else ldItems.push(d);
      }
    } catch { /* JSON-LD rusak, abaikan */ }
  }
  const isArticle = (d) => /(News)?Article|BlogPosting|ReportageNewsArticle/.test([].concat(d?.['@type']).join(' '));
  const ld = ldItems.find(isArticle) || {};
  const names = (v) => [].concat(v || []).map((a) => (typeof a === 'string' ? a : a?.name)).filter(Boolean);
  const ldImages = [].concat(ld.image || []).map((i) => (typeof i === 'string' ? i : i?.url)).filter(Boolean);

  // --- Isi artikel ---
  // Wadah isi dipilih dari selector yang umum di situs berita, lalu diperiksa dengan skor kepadatan
  // paragraf (mirip Readability). Situs dengan struktur yang tidak dikenal tetap tertangani lewat skor.
  const NOISE_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'INS', 'ASIDE', 'FORM', 'BUTTON', 'SVG', 'FIGURE', 'FIGCAPTION', 'NAV', 'FOOTER', 'BLOCKQUOTE']);
  // Token kelas/id (dipisah spasi, `-`, `_`) yang menandai elemen bukan isi berita.
  const NOISE_CLASS = /(^|[\s_-])(ads?|advert\w*|iklan|banner|promo\w*|sponsor\w*|related|terkait|rekomendasi|recommend\w*|baca-?juga|bacajuga|lihat-?juga|share|social|sosmed|comments?|komentar|newsletter|subscribe|tags?|topik|breadcrumbs?|nav\w*|menu|sidebar|footer|popular|terpopuler|trending|widget|parallax|author|penulis|reporter|byline|redaksi|date|time|caption)($|[\s_-])/i;
  const BODY_CLASS = /article|body|content|entry|main|post|text|story|detail|read|isi|berita/i;
  const BLOCK_TAGS = new Set(['P', 'DIV', 'SECTION', 'ARTICLE', 'LI', 'UL', 'OL', 'H2', 'H3', 'H4', 'H5', 'H6', 'TABLE', 'TR', 'PRE', 'HEADER']);
  const bodySelectors = [
    '[itemprop="articleBody"]', '.detail__body-text', '.read__content', '.post-content', '.entry-content',
    '.article-content', '.article-body', '.article__body', '.article__content', '.story-body', '.post-body',
    '.detail-content', '.content-detail', '.detail-desc', '.main-content-detail', '.c-detail', '.news-content',
    '.isi-berita', '[class*="article-content"]', '[class*="article-body"]', '[class*="content-body"]',
    '[class*="body-text"]', '[class*="detail-text"]',
  ];

  const classOf = (el) => `${typeof el.className === 'string' ? el.className : ''} ${el.id || ''}`;
  const isNoise = (el) => NOISE_TAGS.has(el.tagName) || NOISE_CLASS.test(classOf(el)) || el.hidden || el.getAttribute('aria-hidden') === 'true';
  const insideNoise = (el, root) => {
    for (let e = el; e && e !== root && e !== document.body; e = e.parentElement) if (isNoise(e)) return true;
    return false;
  };
  const directText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();

  // Satuan teks: <p> yang cukup panjang, atau elemen blok yang teksnya langsung dipisah <br> (tanpa <p>).
  const units = [];
  for (const el of document.body.querySelectorAll('p, div, section, article, td')) {
    if (insideNoise(el, null)) continue;
    const text = el.tagName === 'P' ? el.textContent.replace(/\s+/g, ' ').trim() : directText(el);
    if (text.length >= (el.tagName === 'P' ? 25 : 80)) units.push({ el, len: text.length, commas: text.split(',').length - 1 });
  }
  const unitText = (root) => units.reduce((sum, u) => sum + (root.contains(u.el) ? u.len : 0), 0);
  const linkDensity = (el) => {
    const total = el.textContent.length || 1;
    return [...el.querySelectorAll('a')].reduce((sum, a) => sum + a.textContent.length, 0) / total;
  };

  const scores = new Map();
  const addScore = (el, s) => el && el !== document.body && scores.set(el, (scores.get(el) ?? 0) + s);
  for (const u of units) {
    const s = 1 + u.commas + Math.min(Math.floor(u.len / 100), 3);
    const container = u.el.tagName === 'P' ? u.el.parentElement : u.el;
    addScore(container, s);
    addScore(container?.parentElement, s / 2);
  }
  let best = null;
  let bestScore = 0;
  for (const [el, raw] of scores) {
    const weight = (BODY_CLASS.test(classOf(el)) ? 25 : 0) - (NOISE_CLASS.test(classOf(el)) ? 25 : 0);
    const s = (raw + weight) * (1 - linkDensity(el));
    if (s > bestScore) [best, bestScore] = [el, s];
  }
  // Naik ke induk jika induk memuat jauh lebih banyak isi, mis. artikel yang dipecah ke beberapa wadah bersaudara.
  while (best?.parentElement && best.parentElement !== document.body) {
    const parent = best.parentElement;
    if (isNoise(parent) || linkDensity(parent) > 0.35 || unitText(parent) < unitText(best) * 1.2) break;
    best = parent;
  }

  // Selector dipakai jika cocok dengan hasil skor (memuat atau dimuat olehnya, atau isinya setara); selain itu pakai skor.
  const bestText = best ? unitText(best) : 0;
  const bySelector = bodySelectors.map((s) => document.querySelector(s)).find((el) => {
    if (!el || unitText(el) <= 200) return false;
    return !best || el.contains(best) || best.contains(el) || unitText(el) >= bestText * 0.7;
  });
  const body = bySelector || (bestText > 200 ? best : null);

  // Baris yang terlihat di dalam wadah isi tetapi bukan isi berita.
  const NOISE_LINE = [
    /^(advertisement|iklan|scroll to continue( with content)?|loading\.*)$/i,
    /^(baca (juga|berita|selengkapnya|artikel)|baca\s*:|lihat juga|simak (juga|video|berita)|saksikan( juga)?|tonton( juga)?)\b/i,
    /^(ikuti|follow|dapatkan|download|unduh|klik)\b.{0,80}(whatsapp|channel|google news|aplikasi|instagram|telegram|update|berita terbaru|di ?sini)/i,
    /^(pewarta|editor|reporter|penulis|fotografer|redaktur|sumber)\s*:/i,
    /^(copyright|hak cipta|©)/i,
    /^dilarang (keras )?mengambil konten/i,
    /^halaman\s*:?\s*\d/i,
    /^\[gambas:[^\]]*\]$/i,
    /^\(?[a-z]{2,5}(\/[a-z]{2,5})*\)?$/i, // inisial editor, mis. `(ahm)`
    /^\([\p{L} .'/-]{2,60}\)$/u, // kredit redaksi dalam kurung, mis. `(Erha Aprili Ramadhoni)`
    /\bmenyajikan (informasi|berita) terbaru\b/i,
    /^[\W\d_]{0,3}$/, // tanda baca atau huruf awal (drop cap) yang terpisah
  ];
  const isNoiseLine = (t) => NOISE_LINE.some((re) => re.test(t));

  // Isi diambil per <p> jika <p> memuat sebagian besar teks; jika tidak (isi dipisah <br>), per baris blok.
  const collectLines = (root) => {
    const out = [];
    let buffer = '';
    const flush = () => {
      const t = buffer.replace(/\s+/g, ' ').trim();
      if (t) out.push(t);
      buffer = '';
    };
    const walk = (node) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 3) buffer += child.textContent;
        if (child.nodeType !== 1 || isNoise(child)) continue;
        if (child.tagName === 'BR') {
          flush();
          continue;
        }
        const block = BLOCK_TAGS.has(child.tagName);
        if (block) flush();
        walk(child);
        if (block) flush();
      }
    };
    walk(root);
    flush();
    return out;
  };
  let paragraphs = [];
  if (body) {
    const fromP = [...body.querySelectorAll('p')].filter((p) => !insideNoise(p, body)).map((p) => p.innerText.trim()).filter(Boolean);
    const lines = collectLines(body);
    const pChars = fromP.join('').length;
    paragraphs = (pChars >= lines.join('').length * 0.6 ? fromP : lines).filter((t) => !isNoiseLine(t));
  }

  // --- Gambar (dukung lazy-load) ---
  const imgUrl = (img) => {
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset');
    if (srcset) {
      const best = srcset.split(',').map((c) => c.trim().split(/\s+/))
        .sort((a, b) => (parseInt(b[1]) || 0) - (parseInt(a[1]) || 0))[0]?.[0];
      if (best) return abs(best);
    }
    return abs(img.getAttribute('data-src') || img.getAttribute('data-original') || img.getAttribute('src'));
  };
  const scope = body?.closest('article') || body || document;
  const images = [];
  const seen = new Set();
  for (const img of scope.querySelectorAll('img')) {
    const url = imgUrl(img);
    if (!url || url.startsWith('data:') || seen.has(url)) continue;
    if (/logo|icon|avatar|sprite|pixel/i.test(url)) continue;
    seen.add(url);
    images.push({ url, caption: img.closest('figure')?.querySelector('figcaption')?.innerText.trim() || img.alt || null });
  }

  // Gambar utama sering berada di luar isi artikel, jadi disertakan di urutan pertama.
  const mainImage = abs(ldImages[0] || meta('meta[property="og:image"]'));
  if (mainImage && !seen.has(mainImage)) images.unshift({ url: mainImage, caption: null });

  // Tag: dari metadata, fallback ke link /tag/ (pola umum situs berita Indonesia)
  let tags = [].concat(ld.keywords || meta('meta[name="keywords"]')?.split(',') || []).map((t) => String(t).trim()).filter(Boolean);
  if (!tags.length) tags = [...new Set([...document.querySelectorAll('a[href*="/tag/"]')].map((a) => a.innerText.trim()).filter(Boolean))];

  // --- Pagination artikel ---
  // Hanya link ke path artikel ini sendiri (?page=N, /N, ?page=all, /all), supaya
  // pagination halaman indeks atau galeri tidak ikut terambil.
  const here = new URL(location.href);
  const basePath = here.pathname.replace(/\/$/, '');
  const pageOf = (u) => {
    if (u.origin !== here.origin) return null;
    const p = u.pathname.replace(/\/$/, '');
    if (p === basePath) {
      const n = u.searchParams.get('page') ?? u.searchParams.get('p') ?? '';
      if (n === 'all') return 'all';
      return /^\d+$/.test(n) ? Number(n) : null;
    }
    const rest = p.startsWith(`${basePath}/`) ? p.slice(basePath.length + 1) : '';
    if (rest === 'all') return 'all';
    return /^\d+$/.test(rest) ? Number(rest) : null;
  };
  const showAllText = /^(show all|tampilkan semua|lihat semua|semua halaman|baca semua)$/i;
  let allPage = null;
  const numbered = new Map();
  for (const a of document.querySelectorAll('a[href]')) {
    let u;
    try { u = new URL(a.href); } catch { continue; }
    u.hash = '';
    const n = pageOf(u);
    if (n === 'all' || (showAllText.test(a.innerText.trim()) && u.pathname.startsWith(basePath))) {
      if (u.href !== here.href.split('#')[0]) allPage ??= u.href;
    } else if (typeof n === 'number' && n >= 2) {
      numbered.set(n, u.href);
    }
  }

  return JSON.stringify({
    url: abs(document.querySelector('link[rel="canonical"]')?.href) || location.href,
    title: ld.headline || meta('meta[property="og:title"]') || document.title,
    description: ld.description || meta('meta[name="description"]') || meta('meta[property="og:description"]'),
    authors: names(ld.author).length ? names(ld.author) : [meta('meta[name="author"]')].filter(Boolean),
    published_at: ld.datePublished || meta('meta[property="article:published_time"]'),
    updated_at: ld.dateModified || meta('meta[property="article:modified_time"]'),
    section: ld.articleSection || meta('meta[property="article:section"]'),
    tags,
    main_image: mainImage,
    images,
    content_text: paragraphs.join('\n\n'),
    word_count: paragraphs.join(' ').split(/\s+/).filter(Boolean).length,
    pagination: {
      all: allPage,
      pages: [...numbered].sort((a, b) => a[0] - b[0]).map(([, u]) => u),
    },
  }, null, 2);
})();
