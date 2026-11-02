# ADR-0005: Komparasi Scraper Bun + Browser dengan Scraper Go tanpa Browser

- **Status:** Diusulkan (Proposed)
- **Tanggal:** 2026-11-02
- **Lingkup:** `go-scraper/` (port Go tanpa browser), alat benchmark `scraper/tools/`, dan rekomendasi untuk sistem produksi berbasis Go
- **Terkait:** [ADR-0003](0003-driver-browser-agent-browser-playwright-atau-cdp.md) (driver browser), [laporan akurasi dan performa](../report/laporan-driver-browser-dan-akurasi-2026-11-02.md), [go-scraper/README.md](../../go-scraper/README.md)

## 1. Konteks

Sistem yang sudah berjalan di produksi berbasis Go dan **tidak memakai browser**:

| Bagian | Library |
|---|---|
| Baca RSS/Atom | `mmcdole/gofeed` v1.4.2 |
| Ekstrak isi artikel | `markusmobius/go-trafilatura` v1.12.2, port Go dari trafilatura (Python), dengan go-readability, go-domdistiller, go-htmldate, go-dateparser |
| Fetch HTTP | Ditulis sendiri di atas `net/http` |

Scraper di repo ini (Bun) membuka setiap artikel dengan Chrome headless, lalu menjalankan ekstraktor deterministik `extract-article.js` di halaman. Pertanyaan yang dijawab ADR ini ada dua:

1. Berapa selisih akurasi dan biaya antara kedua sistem?
2. Apakah selisih itu berasal dari browser atau dari aturan ekstraksi?

## 2. Masalah

Membandingkan sistem Go (go-trafilatura) langsung dengan scraper Bun mencampur dua variabel: ada atau tidaknya browser, dan aturan ekstraksi yang berbeda. Untuk memisahkannya, aturan scraper Bun di-port ke Go **tanpa browser**, lalu ketiganya diukur dengan alat, URL, dan referensi yang sama.

## 3. Pembanding yang dibuat: `go-scraper/`

`go-scraper/` (Go 1.26.4) memakai clean architecture yang sama dengan `scraper/`:

| Lapisan | Isi | Padanan di scraper Bun |
|---|---|---|
| `internal/domain` | `Article`, `Page`, `Pagination`, `MergePages`; tanpa I/O | `src/domain/article.js` |
| `internal/application` | Port `PageReader`, usecase `ScrapeArticle` | `src/application/scrape-article.js`, `ports.js` |
| `internal/infrastructure/pagereader` | `PageReader` lewat HTTP: fetch → parse HTML → `Extractor` | `BrowserPageReader` |
| `internal/infrastructure/extract/rules` | Port 1:1 `extract-article.js` di atas `x/net/html` + `cascadia` | `scripts/extract-article.js` |
| `internal/infrastructure/extract/trafilatura` | Adapter go-trafilatura, seperti sistem produksi | - |
| `cmd/go-scraper` | Composition root | `src/main.js` |

`domain` tidak mengimpor paket internal lain, dan `application` hanya mengimpor `domain`; keduanya sudah dicek dengan `go list`.

go-scraper ikut alat benchmark sebagai driver `go` (ekstraktor `rules`) dan `go-trafilatura` (ekstraktor `trafilatura` dengan `-extract-time`). Proses Go native tetap hidup; alat benchmark (Bun) hanya mengirim URL lewat stdin dan menilai JSON `article` yang dikembalikan.

**Yang disamakan:**
- robots.txt tidak diperiksa (sumber dipilih manual di `config.json`);
- aturan pagination, `maxPages`, dan `preferAllPage` per sumber;
- User-Agent, jeda antar-URL, dan daftar URL.

**Yang tidak bisa disamakan tanpa browser:**
- JavaScript tidak dijalankan;
- CSS tidak diterapkan: `innerText` didekati dengan teks yang dirapikan per baris, dan elemen yang disembunyikan stylesheet tetap terbaca.

### Temuan tentang dependency go-trafilatura

- **go-re2 dan wazero tidak ikut ter-link pada build default.** go-dateparser v1.2.3 hanya memakai `wasilibs/go-re2` jika build memakai tag `re2_wasm` atau `re2_cgo` **dan** CGO aktif (`internal/regexp/regexp-re2.go:1`); selain itu memakai `regexp` standar Go.
- Keduanya tercatat di `go.mod`, tetapi tidak muncul di `go list -deps ./cmd/go-scraper` maupun `go version -m` binary.
- `CGO_ENABLED=0 go build` berhasil.

## 4. Hasil

Diukur 2 November 2026 di Windows 11 (laptop pengembangan) dengan Chrome 156. Sampelnya 24 artikel dari 8 sumber; URL-nya sama dengan pengukuran akurasi sebelumnya.

### 4.1 Akurasi (24/24 artikel berhasil dibaca ketiga implementasi)

| | Bun + browser (CDP) | Go (rules) | Go (trafilatura) |
|---|---|---|---|
| Recall | 100% | 100% | 99,1% |
| Precision | 99,9% | 99,9% | 88,9% |
| Paragraf bukan berita | 0 | 0 | 135 |
| Judul cocok | 24/24 | 24/24 | 21/24 |
| Tanggal terbit cocok (WIB, sampai menit) | 18/18 | 18/18 | 12/18 (0/18 tanpa `-extract-time`) |
| Penulis cocok | 12/12 | 12/12 | 12/12 |
| Gambar di dalam isi | 28/31 | 28/31 | 2/31 |

- **Go (rules) identik dengan CDP di setiap artikel** pada semua ukuran di atas.
- **agent-browser dan Playwright** menghasilkan isi identik dengan CDP di 22/22 artikel pada putaran performa.

**Efek tanpa browser** (CDP Bun dan Go dijalankan berurutan pada ke-24 artikel, lalu dibandingkan per artikel):

- **Teks isi identik persis 24/24.** Ini tercapai setelah `dom.InnerText` mempertahankan `&nbsp;` seperti `innerText` di browser; CSS hanya merapikan spasi, tab, dan baris baru.
- **Daftar gambar berbeda di 3/24 artikel:**
  - liputan6: Go mengambil 5 thumbnail berita terkait (200×113) yang tidak ada di browser;
  - detik: Go mengambil placeholder lazy-load `loading.gif`;
  - antaranews: host CDN gambar utama beda (`img.` di HTML server, `cdn.` di browser).

  Dua yang pertama diduga hasil JavaScript lazy-load di browser; belum diperiksa lebih jauh.
- **Satu temuan tidak terulang.** Di putaran benchmark, browser menemukan 11 gambar di satu artikel cnnindonesia dan Go 2. Saat diulang, browser juga 2, jadi penyebabnya tidak bisa dipastikan.

Per sumber, Go (trafilatura), recall / precision dalam persen:

| Sumber | Recall / precision | Paragraf bukan berita yang ikut |
|---|---|---|
| antaranews | 100 / 80 | Footer redaksi (`Pewarta:`/`Editor:`), larangan AI, "Baca juga", embed tweet |
| cnnindonesia | 100 / 96 | `ADVERTISEMENT`, `SCROLL TO CONTINUE WITH CONTENT`, dateline |
| detik | 100 / 96 | `SCROLL TO CONTINUE WITH CONTENT`, inisial redaksi, dateline |
| liputan6 | 100 / 96 | `Advertisement`, ajakan promosi kanal |
| sindonews (2–3 halaman) | 93 / 64 | Tanggal, "loading...", tombol ukuran huruf, berulang di setiap halaman |
| cnbcindonesia | 100 / 97 | Inisial redaksi, placeholder video |
| okezone (2–4 halaman) | 100 / 98 | Kredit redaksi dalam kurung |
| viva (2–3 halaman) | 100 / 84 | Kredit foto, judul berita terkait |

Penyebab kekalahan go-trafilatura yang sudah diperiksa:

- **Precision:** aturan generik; label iklan, footer redaksi, dan kredit yang dibuang `extract-article.js` ikut terambil.
- **Tanggal:** default go-trafilatura hanya mengambil tanggal (`2026-11-02T00:00:00Z`). Dengan `ExtractTime`, jam WIB di cnnindonesia dan detik diberi zona `Z` (UTC), sehingga meleset 7 jam. Port aturan Bun mengambil `datePublished` JSON-LD atau `article:published_time` apa adanya.
- **Gambar:** go-trafilatura hanya mengenali `src` dan `data-src*` berekstensi gambar (`main-extractor.go:474`), sehingga `data-original` (viva) hilang.
- **Judul:** okezone diambil dari `<title>` beserta akhiran ` : Okezone Sports`; aturan Bun mengutamakan JSON-LD `headline`.

### 4.2 Performa (16 artikel yang berhasil dibuka kelima implementasi, tanpa pembukaan pertama)

| Implementasi | Median / artikel | p95 | Cold start | Peak memory | Berhasil |
|---|---|---|---|---|---|
| agent-browser | 25,8 dtk | 53,7 dtk | 29,9 dtk | 1,9 GB (Chrome) | 22/24 |
| CDP Bun | 3,4 dtk | 24,7 dtk | 12,7 dtk | 1,9 GB (Chrome) | 23/24 |
| Playwright | 3,8 dtk | 17,4 dtk | 5,1 dtk | 1,8 GB (Chrome) | 23/24 |
| Go (rules) | 3,1 dtk | 11,5 dtk | 3,2 dtk | 101 MB (proses Go) | 21/24 |
| Go (trafilatura) | 1,9 dtk | 9,7 dtk | 2,0 dtk | 119 MB (proses Go) | 22/24 |

Median rasio waktu per artikel terhadap Go (rules), pada URL yang sama:
- agent-browser 8,7×
- CDP Bun 3,0×
- Playwright 1,1×
- Go (trafilatura) 0,85×

Batasan pengukuran:

- **Jaringan tidak stabil.** Semua implementasi mengalami timeout (okezone, detik, liputan6, cnbcindonesia).
  - Kegagalan Go berupa `context deadline exceeded` dan `TLS handshake timeout`.
  - Saat jaringan normal, median CDP Bun 0,6 dtk dan Playwright 0,3 dtk ([benchmark driver](../reserch/benchmark-driver-browser-2026-11-02.md)).
  - Angka absolut berubah antar putaran. Yang konsisten: agent-browser paling lambat, dan Go lebih cepat dari driver browser. Urutan CDP Bun dan Playwright berganti antar putaran.
- **Cakupan memori tidak sama.** Untuk Go diukur seluruh prosesnya; untuk browser hanya pohon proses Chrome, tanpa proses Bun.
- Go (rules) sedikit lebih lambat dari Go (trafilatura) pada median. Penyebabnya belum diprofilkan; dugaannya adalah skor kepadatan yang menghitung ulang teks per elemen.

## 5. Opsi

| Opsi | Akurasi | Biaya | Catatan |
|---|---|---|---|
| A. Scraper Bun + browser | Tertinggi | Chrome ±1,9 GB; agent-browser lambat | Membaca isi yang dirender JavaScript |
| B. Sistem Go dengan go-trafilatura (sekarang) | Precision 88,9%, tanggal dan gambar bermasalah | ±0,1 GB, tercepat | Tanpa browser |
| C. Sistem Go dengan port aturan Bun (`extract/rules`) | Sama dengan A pada 8 sumber | ±0,1 GB, setara Playwright | Tanpa browser; aturan dirawat di dua bahasa |
| D. C, ditambah jalur browser untuk sumber yang dirender JavaScript | Sama dengan A | Chrome hanya untuk sumber tertentu | Butuh penanda per sumber |

## 6. Keputusan (diusulkan)

1. **Selisih akurasi antara sistem Go dan scraper Bun berasal dari aturan ekstraksi, bukan dari browser.** Port aturan Bun ke Go tanpa browser identik dengan scraper Bun + Chrome di 24/24 artikel.
2. **Sistem produksi Go diusulkan memakai opsi C**: ganti go-trafilatura dengan port aturan Bun (`go-scraper/internal/infrastructure/extract/rules`), dengan pagination dan `ScrapeArticle` yang sama.
3. **Opsi D disiapkan jika ada sumber yang isinya hanya muncul lewat JavaScript.** Untuk jalur browser dipakai Playwright atau CDP Bun, bukan agent-browser (ADR-0003).

## 7. Konsekuensi

- Aturan ekstraksi dirawat di dua bahasa. Perubahan `extract-article.js` atau `scrape-article.js` harus diterapkan juga di `go-scraper`, lalu diukur dengan `bun run bench:accuracy --drivers cdp,go --urls <hasil sebelumnya>`. Hasil Go yang berbeda dari CDP menandakan port yang tertinggal.
- `go-scraper/` di repo ini hanya untuk benchmark: tanpa webhook, state, dan cron. Pemindahan ke sistem produksi adalah pekerjaan terpisah.
- Alat benchmark menerima driver opsional `go` dan `go-trafilatura` (`GO_SCRAPER_BIN`, `GO_SCRAPER_ARGS`).
- Aturan "semua kode memakai Bun" hanya berlaku untuk `scraper/`.

## 8. Kapan ditinjau ulang

- Saat sumber baru ditambahkan dan isinya tidak terambil tanpa browser.
- Setelah port diterapkan di sistem produksi dan diukur di sana.
- Jika aturan di kedua bahasa mulai sering tidak sinkron. Alternatifnya: jalankan `extract-article.js` dari Go lewat DOM tanpa browser, atau satu sumber aturan.

## 9. Pertanyaan terbuka

- Opsi go-trafilatura yang dipakai sistem produksi (fokus, fallback, `HtmlDateOptions`), dan apakah build-nya memakai tag `re2_wasm`/`re2_cgo`.
- Pengukuran performa ulang saat jaringan stabil.
- Penyebab `TLS handshake timeout` Go yang berulang di liputan6 dan okezone, padahal browser berhasil di putaran yang sama.
- Profil CPU ekstraktor `rules` (lihat 4.2).
