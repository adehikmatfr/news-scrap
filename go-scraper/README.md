# go-scraper

Pembanding lintas bahasa untuk scraper Bun di [`scraper/`](../scraper/): aturan scraper Bun di-port ke Go, tetapi **tanpa browser**. Halaman diambil lewat HTTP biasa, lalu HTML yang dikirim server diekstrak dengan aturan yang sama dengan `extract-article.js`. Keputusan dan hasil perbandingannya ada di [ADR-0005](../docs/adr/0005-komparasi-scraper-go-tanpa-browser.md).

go-scraper hanya dipakai untuk benchmark: tidak mengirim webhook, tidak menyimpan state, dan tidak punya jadwal cron.

## Ekstraktor

| `-extractor` | Isi | Dipakai untuk |
|---|---|---|
| `rules` (default) | Port 1:1 [`extract-article.js`](../scraper/src/infrastructure/browser/scripts/extract-article.js): JSON-LD → OpenGraph → DOM, daftar selector + skor kepadatan paragraf, filter elemen dan baris bukan berita, gambar lazy-load, pagination | Mengukur selisih browser vs tanpa browser dengan aturan yang sama |
| `trafilatura` | [`markusmobius/go-trafilatura`](https://github.com/markusmobius/go-trafilatura) v1.12.2, seperti sistem produksi berbasis Go | Mengukur sistem produksi apa adanya |

Kedua ekstraktor memakai deteksi pagination dan usecase `ScrapeArticle` yang sama.

## Struktur (clean architecture)

```
cmd/go-scraper/                    composition root: satu-satunya tempat merakit
internal/domain/                   Article, Page, Pagination, MergePages; tanpa I/O
internal/application/              port PageReader + usecase ScrapeArticle (port scrape-article.js)
internal/infrastructure/
  httpx/                           fetch net/http, tanpa robots.txt (sama dengan scraper Bun)
  pagereader/                      PageReader: HTTP → parse HTML → Extractor
  extract/dom/                     padanan API DOM browser (querySelector, textContent, innerText)
  extract/pagination/              port bagian pagination extract-article.js
  extract/rules/                   port extract-article.js
  extract/trafilatura/             adapter go-trafilatura
  feed/                            RSS/Atom dengan gofeed v1.4.2
```

`domain` tidak mengimpor paket internal lain; `application` hanya mengimpor `domain`. Perubahan aturan di `extract-article.js` atau `scrape-article.js` diterapkan juga di `extract/rules` atau `application`, agar perbandingan tetap setara.

## Kebutuhan, build, dan test

Go ≥ 1.26. Build tidak memakai CGO.

```bash
cd go-scraper
go test ./...
CGO_ENABLED=0 go build -o bin/go-scraper.exe ./cmd/go-scraper   # Linux/macOS: -o bin/go-scraper
```

## Pemakaian

```bash
# URL artikel dari RSS
bin/go-scraper.exe feed -limit 3 https://www.antaranews.com/rss/terkini.xml

# Ekstrak artikel: satu JSON per URL (bentuk `article` sama dengan payload scraper Bun)
bin/go-scraper.exe extract -ua "NewsScraperBot/1.0 (+mailto:admin@example.com)" https://example.com/berita/1

# Tanpa argumen URL: baca per baris dari stdin (mode yang dipakai alat benchmark)
echo '{"url":"https://example.com/berita/1","max_pages":5,"prefer_all_page":false}' | bin/go-scraper.exe extract
```

| Flag `extract` | Default | Fungsi |
|---|---|---|
| `-extractor` | `rules` | `rules` atau `trafilatura` |
| `-ua` | `NewsScraperBot/1.0` | User-Agent; samakan dengan `userAgent` di `scraper/config.json` |
| `-timeout` | `15s` | Batas waktu per request |
| `-max-pages` | `10` | Halaman artikel maksimum; baris stdin bisa menimpanya dengan `max_pages` |
| `-prefer-all-page` | `true` | Utamakan versi "tampilkan semua"; baris stdin bisa menimpanya dengan `prefer_all_page` |
| `-delay` | `1.5s` | Jeda antar-URL jika URL diberikan sebagai argumen |
| `-focus` | `balanced` | Khusus `trafilatura`: `balanced`, `precision`, atau `recall` |
| `-fallback` | `true` | Khusus `trafilatura`: pakai go-readability dan go-domdistiller jika hasil meragukan |
| `-extract-time` | `false` | Khusus `trafilatura`: ambil jam terbit; default go-trafilatura hanya mengambil tanggal |

Setiap baris keluaran berbentuk `{"url": "...", "article": {...}}` atau `{"url": "...", "error": "..."}`.

## Batasan tanpa browser

- Yang diekstrak hanya HTML yang dikirim server; isi atau link pagination yang baru muncul lewat JavaScript tidak terlihat.
- Tanpa CSS: elemen yang disembunyikan lewat stylesheet tetap terbaca. `innerText` didekati dengan teks yang dirapikan per baris (`extract/dom`).

## Benchmark bersama scraper Bun

go-scraper ikut alat benchmark scraper Bun sebagai driver `go` (ekstraktor `rules`) dan `go-trafilatura` (ekstraktor `trafilatura` dengan `-extract-time`). `maxPages` dan `preferAllPage` setiap sumber diteruskan per URL.

```bash
cd scraper
bun run bench:accuracy --drivers cdp,go,go-trafilatura --urls <hasil sebelumnya>
bun run bench --drivers agent-browser,cdp,playwright,go,go-trafilatura
```

Binary dicari di `go-scraper/bin/`, atau di path pada env `GO_SCRAPER_BIN`. Env `GO_SCRAPER_ARGS` menambah flag untuk semua driver Go.
