# ADR-0005: Komparasi Scraper Bun + Browser dengan Scraper Go tanpa Browser

- **Status:** Diusulkan (Proposed)
- **Tanggal:** 2026-11-02
- **Lingkup:** `go-scraper/` (port Go tanpa browser), alat benchmark `scraper/tools/`, dan rekomendasi untuk sistem produksi berbasis Go
- **Terkait:** [ADR-0003](0003-driver-browser-agent-browser-playwright-atau-cdp.md) (driver browser), [laporan akurasi dan performa](../report/laporan-driver-browser-dan-akurasi-2026-11-02.md), [go-scraper/README.md](../../go-scraper/README.md)

## 1. Konteks

Sistem yang sudah berjalan di produksi berbasis Go dan **tidak memakai browser**:

| Bagian | Isi |
|---|---|
| Baca RSS/Atom | `mmcdole/gofeed` v1.4.2 |
| Ekstrak isi artikel | `markusmobius/go-trafilatura` v1.12.2 |
| Fetch HTTP | Ditulis sendiri di atas `net/http` |
| Metadata, gambar, sampah | Ditangani sendiri: tanggal dari RSS, pembersih tag dan teks sampah. Kodenya tidak ada di repo ini |

Scraper di repo ini (Bun) membuka setiap artikel dengan Chrome headless lalu menjalankan ekstraktor deterministik `extract-article.js` di halaman. Pertanyaannya: **dengan aturan ekstraksi yang sama, apa beda pendekatan browser dan pendekatan Go tanpa browser?**

## 2. Pembanding yang dibuat: `go-scraper/`

`go-scraper/` (Go 1.26.4) memakai clean architecture yang sama dengan `scraper/`:

| Lapisan | Isi | Padanan di scraper Bun |
|---|---|---|
| `internal/domain` | `Article`, `Page`, `Pagination`, `MergePages`; tanpa I/O | `src/domain/article.js` |
| `internal/application` | Port `PageReader`, usecase `ScrapeArticle` | `src/application/scrape-article.js`, `ports.js` |
| `internal/infrastructure/pagereader` | `PageReader` lewat HTTP: fetch → parse HTML → `Extractor` | `BrowserPageReader` |
| `internal/infrastructure/extract/rules` | Port 1:1 `extract-article.js` di atas `x/net/html` + `cascadia` | `scripts/extract-article.js` |
| `internal/infrastructure/extract/clean` | Pembersih teks 11 aturan dari data sistem produksi | Bagian "Pembersihan teks" `extract-article.js` |
| `internal/infrastructure/extract/trafilatura` | go-trafilatura memilih wadah isi; teks, metadata, gambar, dan pembersihan dengan aturan `rules` | - |
| `cmd/go-scraper` | Composition root | `src/main.js` |

`domain` tidak mengimpor paket internal lain, dan `application` hanya mengimpor `domain`; keduanya sudah dicek dengan `go list`.

**Cara kerja adapter `trafilatura`:**
1. Metadata, gambar, dan pagination dibaca dengan aturan `rules`.
2. Elemen sampah dibuang dengan filter elemen `rules`, lalu go-trafilatura dijalankan.
3. go-trafilatura menulis ulang DOM (link dibuang, `<strong>` dipecah), jadi teks hasilnya hanya dipakai sebagai petunjuk. Yang dicari adalah elemen terkecil di DOM asli yang memuat ≥90% kata hasil itu, tanpa `<h1>`. Elemen dari daftar selector `rules` diutamakan jika memuat ≥80%.
4. Teks elemen itu dibaca dengan cara `rules`, termasuk pembersihnya.

go-scraper ikut alat benchmark sebagai driver `go` dan `go-trafilatura`. Proses Go native tetap hidup; alat benchmark (Bun) hanya mengirim URL lewat stdin dan menilai JSON `article` yang dikembalikan.

**Yang disamakan:**
- robots.txt tidak diperiksa (sumber dipilih manual di `config.json`);
- aturan pagination, `maxPages`, dan `preferAllPage` per sumber;
- aturan ekstraksi dan pembersih teks;
- User-Agent, jeda antar-URL, dan daftar URL.

**Yang tidak bisa disamakan tanpa browser:**
- JavaScript tidak dijalankan;
- CSS tidak diterapkan: `innerText` didekati dengan teks yang dirapikan per baris, dan elemen yang disembunyikan stylesheet tetap terbaca.

### Temuan tentang dependency go-trafilatura

- go-dateparser v1.2.3 hanya memakai `wasilibs/go-re2` (dan wazero) jika build memakai tag `re2_wasm` atau `re2_cgo` **dan** CGO aktif (`internal/regexp/regexp-re2.go:1`). Pada build default, keduanya tercatat di `go.mod` tetapi tidak ter-link.
- `CGO_ENABLED=0 go build` berhasil.

## 3. Pembersih teks: 11 aturan dari data sistem produksi

Tim produksi mendata 11 pola sampah. Aturannya dipasang di tiga tempat:
- bagian "Pembersihan teks" `extract-article.js`;
- port Go-nya, `extract/clean`, yang dipakai `rules` dan `trafilatura`;
- referensi benchmark, sehingga pola itu dihitung sebagai sampah.

Polanya:
1. kode redaksi `(lil/sfr)`;
2. `[Gambas:…]`;
3. spasi sebelum tanda baca;
4. dateline `<Kota>, CNN/CNBC Indonesia -`;
5. spasi di dalam kurung;
6. disclaimer TradingView;
7. "Baca juga" / "Lihat Juga" + judul;
8. promo Investinglive;
9. promo Telegram;
10. `Magazine:`;
11. kredit `Foto:`.

Empat belas contoh uji menghasilkan keluaran yang sama di JS dan Go. Pada 60 artikel RSS terbaru (cnnindonesia, detik, cnbcindonesia), pola 1, 2, 3, 4, 5, 7, dan 11 tersisa 0 di Go (rules) dan Go (trafilatura). Pola 6, 8, 9, dan 10 diuji dengan contoh saja, karena sumbernya tidak ada di `config.json`.

## 4. Hasil

Diukur 2 November 2026 di Windows 11 (laptop pengembangan) dengan Chrome 156. Sampelnya 24 artikel dari 8 sumber; URL-nya sama dengan pengukuran akurasi sebelumnya.

### 4.1 Akurasi (24/24 artikel berhasil dibaca semua implementasi)

| | Bun + browser (CDP) | Go (rules) | Go (trafilatura) |
|---|---|---|---|
| Recall / precision | 100% / 100% | 100% / 100% | 100% / 100% |
| Paragraf hilang / bukan berita | 0 / 0 | 0 / 0 | 0 / 0 |
| Judul / tanggal terbit / penulis | 24/24, 18/18, 12/12 | sama | sama |
| Gambar di dalam isi | 28/31 | 28/31 | 28/31 |

- **Isi dan judul** dari agent-browser, Playwright, Go (rules), dan Go (trafilatura) identik dengan CDP Bun di setiap artikel yang berhasil dibuka keduanya pada putaran performa.
- **Teks Go (rules) dan Go (trafilatura) identik** di 24/24 artikel: jumlah kata, jumlah paragraf, dan isi tiap paragraf.
- **Efek tanpa browser:** teks isi identik persis 24/24, dan daftar gambar berbeda di 4 artikel.
  - cnnindonesia: browser mengambil 9 gambar dari artikel lain lewat blok rekomendasi yang dimuat JavaScript.
  - liputan6 (2 artikel) dan detik: Go mengambil thumbnail berita terkait atau placeholder lazy-load `loading.gif`.
- **Satu artikel tambahan** dari 60 artikel pola sampah (cnnindonesia, daftar idol K-pop, tanpa `#article-content-body`) kosong di Bun + browser dan Go (rules), tetapi terbaca di Go (trafilatura).

### 4.2 Performa (21 artikel yang berhasil dibuka kelima implementasi, tanpa pembukaan pertama)

| Implementasi | Median / artikel | p95 | Cold start | Peak memory | Berhasil |
|---|---|---|---|---|---|
| agent-browser | 26,2 dtk | 54,4 dtk | 20,2 dtk | 1,8 GB (Chrome) | 22/24 |
| CDP Bun | 6,6 dtk | 22,8 dtk | 1,9 dtk | 2,0 GB (Chrome) | 23/24 |
| Playwright | 6,2 dtk | 32,3 dtk | 14,7 dtk | 1,6 GB (Chrome) | 24/24 |
| Go (rules) | 4,7 dtk | 13,2 dtk | 1,6 dtk | 97 MB (proses Go) | 24/24 |
| Go (trafilatura) | 2,7 dtk | 8,7 dtk | 1,0 dtk | 117 MB (proses Go) | 24/24 |

**Waktu ekstraksi tanpa jaringan.** HTML ke-24 artikel diunduh sekali, lalu setiap ekstraktor dijalankan 5 kali per halaman, dalam dua putaran:
- Go (rules): median 7,7–8,0 ms per halaman;
- Go (trafilatura): median 15,1–15,7 ms per halaman, ±2× lebih lama.

Batasan pengukuran:

- **Waktu per artikel didominasi jaringan.** Selisih Go (rules) vs Go (trafilatura) di tabel berasal dari jaringan dan urutan pengukuran, bukan dari ekstraktornya.
- **Bias urutan.** Urutan implementasi digilir per URL, tetapi di 4 dari 5 rotasi Go (trafilatura) berjalan tepat setelah Go (rules), dan Playwright tepat setelah CDP Bun, sehingga mendapat cache CDN yang baru dipanaskan. Rotasi alat benchmark perlu diperbaiki, misalnya dengan urutan acak per URL, sebelum angka waktu dipakai untuk memilih antara implementasi yang berdekatan.
- **Jaringan tidak stabil.** Saat jaringan normal, median CDP Bun 0,6 dtk dan Playwright 0,3 dtk ([benchmark driver](../reserch/benchmark-driver-browser-2026-11-02.md)). Yang konsisten di setiap putaran: agent-browser paling lambat; Go lebih cepat dan jauh lebih hemat memori dari driver browser.
- **Cakupan memori tidak sama.** Untuk Go diukur seluruh prosesnya; untuk browser hanya pohon proses Chrome, tanpa proses Bun.

## 5. Opsi

| Opsi | Akurasi | Biaya | Catatan |
|---|---|---|---|
| A. Scraper Bun + browser | 100% / 100% | Chrome ±1,6–2,0 GB; agent-browser lambat | Membaca isi yang dirender JavaScript |
| B. Go + go-trafilatura dengan aturan yang sama | 100% / 100% | ±0,1 GB; ekstraksi ±15 ms per halaman | Dependency go-trafilatura; lebih tahan terhadap struktur halaman yang belum dikenal (1 artikel) |
| C. Go dengan port aturan Bun (`extract/rules`) | 100% / 100% | ±0,1 GB; ekstraksi ±8 ms per halaman | Aturan dirawat di dua bahasa |
| D. B atau C, ditambah jalur browser untuk sumber yang dirender JavaScript | Sama dengan A | Chrome hanya untuk sumber tertentu | Butuh penanda per sumber |

## 6. Keputusan (diusulkan)

1. **Untuk 8 sumber ini, browser tidak dibutuhkan.** Dengan aturan ekstraksi yang sama, Go tanpa browser memberi teks identik dengan Bun + Chrome di 24/24 artikel, dengan memori ±0,1 GB dibanding ±1,6–2,0 GB.
2. **Pendekatan sistem produksi Go (opsi B) dan port aturan Bun (opsi C) setara akurasinya.** Pilihannya didasarkan pada:
   - biaya pemrosesan (±15 vs ±8 ms per halaman, keduanya kecil dibanding jaringan);
   - perawatan;
   - ketahanan terhadap struktur halaman yang belum dikenal.
3. **Opsi D disiapkan jika ada sumber yang isinya hanya muncul lewat JavaScript.** Untuk jalur browser dipakai Playwright atau CDP Bun, bukan agent-browser (ADR-0003).

## 7. Konsekuensi

- **Aturan dirawat di beberapa tempat:**
  - aturan ekstraksi di `extract-article.js` dan `extract/rules`;
  - pembersih teks di `extract-article.js` dan `extract/clean`, ditambah referensi `tools/compare-with-source.js`, yang membaca bagian itu langsung dari teks `extract-article.js`, di antara `const CLEAN = {` dan `let paragraphs = [];`.

  Setiap perubahan diterapkan di semua tempat, lalu diukur dengan `bun run bench:accuracy --drivers cdp,go,go-trafilatura --urls <hasil sebelumnya>`. Hasil yang berbeda dari CDP menandakan port yang tertinggal.
- `go-scraper/` di repo ini hanya untuk benchmark: tanpa webhook, state, dan cron.
- Alat benchmark menerima driver opsional `go` dan `go-trafilatura` (`GO_SCRAPER_BIN`, `GO_SCRAPER_ARGS`).
- Aturan "semua kode memakai Bun" hanya berlaku untuk `scraper/`.

## 8. Kapan ditinjau ulang

- Saat sumber baru ditambahkan dan isinya tidak terambil tanpa browser.
- Jika aturan di kedua bahasa mulai sering tidak sinkron. Alternatifnya: satu sumber aturan untuk JS dan Go.

## 9. Pertanyaan terbuka

- Pengukuran performa ulang saat jaringan stabil, dengan urutan implementasi acak per URL.
- Apakah build produksi memakai tag `re2_wasm`/`re2_cgo` (overhead runtime WASM).
- Perlu tidaknya aturan `rules` ditambah untuk halaman tanpa wadah yang dikenal, seperti artikel daftar K-pop yang hanya terbaca go-trafilatura.
