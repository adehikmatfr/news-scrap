# Laporan: Akurasi Ekstraksi dan Performa Scraper Berita

- **Tanggal:** 2 November 2026
- **Lingkup:** `scraper/` (Bun + Chrome headless) dan `go-scraper/` (Go tanpa browser)
- **Rincian:** [ADR-0003](../adr/0003-driver-browser-agent-browser-playwright-atau-cdp.md) · [ADR-0004 (ditolak)](../adr/0004-ekstraksi-artikel-dengan-hermes-agent.md) · [ADR-0005](../adr/0005-komparasi-scraper-go-tanpa-browser.md) · [benchmark akurasi](../reserch/benchmark-akurasi-ekstraksi-2026-11-02.md) · [benchmark driver](../reserch/benchmark-driver-browser-2026-11-02.md)

## Ringkasan

- **Akurasi kelima implementasi sama: recall 100%, precision 100%** pada 24 artikel dari 8 sumber. Judul, tanggal terbit, penulis, dan gambar di dalam isi juga sama di semua implementasi.
- **Yang membedakan adalah performa:**
  - **Go tanpa browser:** ±100–120 MB, dibanding ±1,6–2,0 GB untuk Chrome. Waktu per artikel paling pendek.
  - **agent-browser:** paling lambat, ±26 dtk per artikel.
  - **Biaya pemrosesan Go:** di luar waktu jaringan, ekstraksi Go (rules) ±8 ms per halaman dan Go (trafilatura) ±15 ms per halaman.
- **Ekstraksi dengan AI agent (Hermes) ditolak** (bagian 4).

## 1. Akurasi

### Metode

- Hasil scraper dibandingkan dengan **halaman aslinya**, bukan dengan hasil scraper lain.
- Pembanding diambil dari HTML lewat request HTTP biasa, memakai selector yang dipilih manual per situs.
- Teks pembanding ikut dibersihkan dengan pembersih teks yang sama dengan scraper ([ADR-0005](../adr/0005-komparasi-scraper-go-tanpa-browser.md), bagian 3), jadi pola sampahnya dihitung sebagai sampah.
- Sampelnya 24 artikel, 3 terbaru per sumber, dengan URL yang sama untuk semua implementasi dan semua putaran.
- Definisi:
  - **Recall:** bagian isi berita di halaman yang ikut terambil.
  - **Precision:** bagian teks hasil scraper yang benar-benar isi berita; sisanya iklan, footer, atau tautan.

Implementasi yang diukur:

| Implementasi | Cara membuka halaman | Ekstraksi |
|---|---|---|
| Bun + browser (agent-browser, CDP Bun, Playwright) | Chrome headless | `extract-article.js`, dijalankan di halaman |
| Go (rules) | HTTP biasa, tanpa browser | Port 1:1 `extract-article.js` dan `scrape-article.js` |
| Go (trafilatura) | HTTP biasa, tanpa browser | go-trafilatura v1.12.2 memilih wadah isi; teks, metadata, gambar, dan pembersihan memakai aturan yang sama dengan Go (rules) |

Ketiganya memakai aturan pagination yang sama. Tidak ada yang memeriksa robots.txt.

### Hasil (24 artikel, semuanya berhasil dibaca ketiga implementasi)

| | Bun + browser | Go (rules) | Go (trafilatura) |
|---|---|---|---|
| Recall | 100% | 100% | 100% |
| Precision | 100% | 100% | 100% |
| Paragraf hilang | 0 | 0 | 0 |
| Paragraf bukan berita | 0 | 0 | 0 |
| Judul | 24/24 | 24/24 | 24/24 |
| Tanggal terbit | 18/18 | 18/18 | 18/18 |
| Penulis | 12/12 | 12/12 | 12/12 |
| Gambar di dalam isi | 28/31 | 28/31 | 28/31 |

- **Kolom "Bun + browser"** diukur dengan CDP Bun. Pada putaran performa, isi dan judul dari agent-browser, Playwright, Go (rules), dan Go (trafilatura) identik dengan CDP Bun di setiap artikel yang berhasil dibuka keduanya (22/22 sampai 23/23).
- **Tanggal dan penulis** hanya dinilai di situs yang menampilkannya di halaman (6 situs untuk tanggal, 4 situs untuk penulis).
- **Gambar di dalam isi:** 3 gambar yang tidak terambil berada di viva dan sama di semua implementasi.

## 2. Performa

### Waktu per artikel dan memori (21 artikel yang berhasil dibuka kelima implementasi, tanpa pembukaan pertama)

| Implementasi | Median / artikel | p95 | Cold start | Peak memory | Berhasil |
|---|---|---|---|---|---|
| agent-browser (default saat ini) | 26,2 dtk | 54,4 dtk | 20,2 dtk | 1,8 GB (Chrome) | 22/24 |
| CDP Bun | 6,6 dtk | 22,8 dtk | 1,9 dtk | 2,0 GB (Chrome) | 23/24 |
| Playwright | 6,2 dtk | 32,3 dtk | 14,7 dtk | 1,6 GB (Chrome) | 24/24 |
| Go (rules) | 4,7 dtk | 13,2 dtk | 1,6 dtk | **97 MB** (proses Go) | 24/24 |
| Go (trafilatura) | 2,7 dtk | 8,7 dtk | 1,0 dtk | 117 MB (proses Go) | 24/24 |

Median rasio waktu per artikel terhadap Go (rules), pada URL yang sama: agent-browser 7,0×, CDP Bun 2,3×, Playwright 1,7×, Go (trafilatura) 0,86×.

### Cara membaca angka performa

- **Waktu per artikel didominasi jaringan**, bukan ekstraksi. Selisih antar implementasi Go di tabel pertama berasal dari jaringan dan urutan pengukuran, bukan dari ekstraktornya.
- **Ada bias urutan.** Urutan implementasi digilir per URL, tetapi di 4 dari 5 rotasi Go (trafilatura) berjalan tepat setelah Go (rules), dan Playwright tepat setelah CDP Bun. Implementasi kedua mendapat cache CDN yang baru dipanaskan untuk URL yang sama, sehingga Go (trafilatura) terlihat lebih cepat dari Go (rules) walaupun pemrosesannya 2× lebih lama.
- **Jaringan tidak stabil saat pengukuran.** Ada timeout di okezone untuk agent-browser dan CDP Bun. Di putaran lain saat jaringan normal, median CDP Bun 0,6 dtk dan Playwright 0,3 dtk ([benchmark driver](../reserch/benchmark-driver-browser-2026-11-02.md)).
- **Yang konsisten di setiap putaran:** agent-browser selalu paling lambat; Go selalu lebih cepat dan jauh lebih hemat memori dari driver browser.
- **Cakupan memori tidak sama.** Untuk Go diukur seluruh prosesnya, untuk browser hanya pohon proses Chrome (proses Bun tidak ikut dihitung).

### Penyebab selisih kecepatan

- `agent-browser open` menunggu event `load`, yaitu sampai semua iklan selesai dimuat; di situs penuh iklan waktunya bisa ±20 dtk.
- CDP Bun dan Playwright berhenti saat `DOMContentLoaded`, ketika isi berita sudah ada di halaman, tetapi tetap memuat JavaScript, gambar, dan iklan.
- Go hanya mengunduh HTML-nya.

## 3. Perbandingan implementasi

| | agent-browser | Playwright | CDP Bun | Go (rules) | Go (trafilatura) |
|---|---|---|---|---|---|
| Akurasi (24 artikel) | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% | 100% / 100% |
| Waktu per artikel | Paling lambat (±26 dtk) | Cepat | Cepat | Tercepat | Tercepat |
| Waktu ekstraksi tanpa jaringan | - | - | - | ±8 ms | ±15 ms |
| Memori | ±1,8 GB | ±1,6 GB | ±2,0 GB | ±0,1 GB | ±0,1 GB |
| Butuh Chrome di server | Ya | Ya | Ya | Tidak | Tidak |
| Isi yang dirender JavaScript | Terbaca | Terbaca | Terbaca | Tidak terbaca | Tidak terbaca |
| Dependency | Binary npm global (butuh Node.js/npm di server) | `playwright-core` | Tidak ada | `x/net/html`, `cascadia` | Ditambah go-trafilatura |
| Pemulihan crash Chrome | Belum ada | Otomatis | Otomatis | Tidak relevan | Tidak relevan |

## 4. Evaluasi AI agent (Hermes Agent): ditolak

Dikaji apakah membaca isi artikel lewat AI agent lebih andal daripada ekstraktor deterministik. Agent yang diuji adalah Hermes Agent dengan Claude Sonnet 5.5: membuka halaman dengan browser, lalu menyalin isi berita sesuai prompt. Uji cobanya 1 artikel detik dan 1 artikel liputan6 per backend, dinilai dengan alat akurasi yang sama.

| Cara | detik | liputan6 | Waktu / artikel | Biaya / artikel |
|---|---|---|---|---|
| Scraper deterministik (CDP Bun) | 100 / 100 | 100 / 100 | 0,2–2,6 dtk | $0 |
| Hermes + Browser Use (bawaan Hermes) | 100 / 100 | 100 / 100 | 54–55 dtk | $0,043–0,048 |
| Hermes + agent-browser 0.26.0 | gagal (timeout) | 100 / 100 | 40 dtk | $0,051 |

Recall / precision dalam persen.

**Ditolak** ([ADR-0004](../adr/0004-ekstraksi-artikel-dengan-hermes-agent.md)), karena:

- **Akurasi tidak bertambah.** Ekstraktor deterministik sudah 100% / 100% pada 8 sumber.
- **Selector cukup ditentukan saat setup** dan diverifikasi dengan benchmark akurasi; tidak perlu AI.
- **Mahal dan lambat:** ±$45–50 per 1.000 artikel (perkiraan) dan ±25–250× lebih lambat, tanpa imbalan akurasi.
- **Risiko keamanan:** backend yang andal (Browser Use) butuh akses shell untuk agent sambil membaca halaman tak tepercaya.
- **Tidak deterministik:** risiko parafrase atau halusinasi teks.
- **Izin penerbit:** pemrosesan isi berita oleh AI dilarang sebagian penerbit (mis. antaranews tanpa izin tertulis).

## 5. Risiko dan batasan

- **Izin penerbit:** footer antaranews melarang pengindeksan otomatis untuk AI tanpa izin tertulis, dan robots.txt tempo memasang `ai-train=no`. Pemakaian produksi perlu dipastikan izinnya.
- **Sumber terblokir:** tempo, republika, dan tribunnews memblokir Chrome headless dan tidak diukur.
- **Sampel kecil:** 24 artikel dari satu hari.

## Sumber

Repo: [github.com/adehikmatfr/news-scrap](https://github.com/adehikmatfr/news-scrap)

| Dokumen / kode | Isi |
|---|---|
| [ADR-0003: driver browser](../adr/0003-driver-browser-agent-browser-playwright-atau-cdp.md) | Pilihan driver lewat `BROWSER_DRIVER`, spike Windows/Linux, sandbox |
| [ADR-0004: Hermes Agent (ditolak)](../adr/0004-ekstraksi-artikel-dengan-hermes-agent.md) | Data spike Hermes dan alasan penolakan |
| [ADR-0005: komparasi scraper Go tanpa browser](../adr/0005-komparasi-scraper-go-tanpa-browser.md) | Port Go, pembersih 11 aturan, hasil, opsi, dan pertanyaan terbuka |
| [Benchmark akurasi ekstraksi](../reserch/benchmark-akurasi-ekstraksi-2026-11-02.md) | Data per artikel dan per sumber, sebelum dan sesudah perbaikan ekstraktor |
| [Benchmark driver browser](../reserch/benchmark-driver-browser-2026-11-02.md) | Performa ketiga driver browser saat jaringan normal |
| [`extract-article.js`](../../scraper/src/infrastructure/browser/scripts/extract-article.js) | Aturan ekstraksi dan pembersih teks yang dipakai ketiga driver browser |
| [`agent-browser-cli.js`](../../scraper/src/infrastructure/browser/agent-browser-cli.js) · [`cdp-driver.js`](../../scraper/src/infrastructure/browser/cdp-driver.js) · [`playwright-driver.js`](../../scraper/src/infrastructure/browser/playwright-driver.js) | Implementasi ketiga driver browser |
| [`go-scraper/`](../../go-scraper/README.md) | Scraper Go tanpa browser (clean architecture) |
| [`rules.go`](../../go-scraper/internal/infrastructure/extract/rules/rules.go) · [`clean.go`](../../go-scraper/internal/infrastructure/extract/clean/clean.go) · [`trafilatura.go`](../../go-scraper/internal/infrastructure/extract/trafilatura/trafilatura.go) · [`scrape_article.go`](../../go-scraper/internal/application/scrape_article.go) | Port Go dari `extract-article.js`, pembersih teks, adapter go-trafilatura, dan `scrape-article.js` |
| [`compare-with-source.js`](../../scraper/tools/compare-with-source.js) | Alat ukur akurasi (`bun run bench:accuracy`) |
| [`compare-drivers.js`](../../scraper/tools/compare-drivers.js) | Alat ukur performa (`bun run bench`) |
