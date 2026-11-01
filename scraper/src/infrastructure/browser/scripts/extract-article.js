// Ekstraktor artikel berita generik; dijalankan di dalam halaman lewat `agent-browser eval -b`.
// Prioritas: JSON-LD (NewsArticle) -> OpenGraph/meta -> parsing DOM.
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
  // Selector spesifik didahulukan; kandidat dengan teks ≤ 200 karakter dianggap wadah kosong.
  const bodySelectors = [
    '[itemprop="articleBody"]', '.post-content', '.article-content', '.detail__body-text',
    '.read__content', '.entry-content', 'article .content', 'article',
  ];
  const body = bodySelectors.map((s) => document.querySelector(s)).find((el) => el && el.innerText.trim().length > 200);
  let paragraphs = [];
  if (body) {
    const clone = body.cloneNode(true);
    clone.querySelectorAll('script, style, iframe, ins, aside, .ads, [class*="baca-juga"], [class*="related"], [class*="advert"]')
      .forEach((n) => n.remove());
    paragraphs = [...clone.querySelectorAll('p')].map((p) => p.innerText.trim()).filter((t) => t.length > 0);
    if (!paragraphs.length) paragraphs = clone.innerText.split('\n').map((t) => t.trim()).filter(Boolean);
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
