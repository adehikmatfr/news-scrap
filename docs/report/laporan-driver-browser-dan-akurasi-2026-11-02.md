# Laporan: Akurasi Ekstraksi dan Performa Scraper Berita

- **Tanggal:** 2 November 2026
- **Lingkup:** `scraper/` (Bun + Chrome headless) dan `go-scraper/` (Go tanpa browser)
- **Rincian:** [ADR-0003](../adr/0003-driver-browser-agent-browser-playwright-atau-cdp.md) · [ADR-0004 (ditolak)](../adr/0004-ekstraksi-artikel-dengan-hermes-agent.md) · [ADR-0005](../adr/0005-komparasi-scraper-go-tanpa-browser.md) · [benchmark akurasi](../reserch/benchmark-akurasi-ekstraksi-2026-11-02.md) · [benchmark driver](../reserch/benchmark-driver-browser-2026-11-02.md)

## Ringkasan

- **Akurasi isi berita 100% recall dan 99,9% precision** pada 24 artikel dari 8 sumber. Judul, tanggal terbit, dan penulis 100% cocok dengan yang tampil di halaman asli.
- **Browser tidak menentukan akurasi; aturan ekstraksi yang menentukan.**
  - agent-browser, CDP Bun, dan Playwright menghasilkan isi identik.
  - Port aturan yang sama ke Go **tanpa browser** menghasilkan teks isi identik persis di 24/24 artikel.
  - Efek tanpa browser hanya terlihat di daftar gambar 3 artikel: thumbnail berita terkait, placeholder lazy-load, dan host CDN gambar utama.
- **go-trafilatura (dipakai sistem produksi Go) kurang bersih:** precision 88,9%, dengan 135 paragraf bukan berita. Tanggal terbit benar hanya 12/18, dan gambar di dalam isi 2/31.
- **Go tanpa browser paling ringan:** ±100–120 MB, dibanding ±1,8–1,9 GB untuk Chrome. Waktunya setara Playwright dan ±3× lebih cepat dari CDP Bun dalam putaran yang sama.
- **agent-browser paling lambat** (±26 dtk per artikel), karena menunggu semua iklan selesai dimuat.
- **Ekstraksi dengan AI agent (Hermes) ditolak** (bagian 4).

## 1. Akurasi

### Metode

- Hasil scraper dibandingkan dengan **halaman aslinya**, bukan dengan hasil scraper lain.
- Pembanding diambil dari HTML lewat request HTTP biasa, memakai selector yang dipilih manual per situs.
- Sampelnya 24 artikel, 3 terbaru per sumber, dengan URL yang sama untuk semua implementasi dan semua putaran.
- Definisi:
  - **Recall:** bagian isi berita di halaman yang ikut terambil.
  - **Precision:** bagian teks hasil scraper yang benar-benar isi berita; sisanya iklan, footer, atau tautan.

Implementasi yang diukur:

| Implementasi | Cara membuka halaman | Aturan ekstraksi |
|---|---|---|
| Bun + browser (agent-browser, CDP Bun, Playwright) | Chrome headless | `extract-article.js`, dijalankan di halaman |
| Go (rules) | HTTP biasa, tanpa browser | Port 1:1 `extract-article.js` dan `scrape-article.js` ke Go |
| Go (trafilatura) | HTTP biasa, tanpa browser | go-trafilatura v1.12.2, seperti sistem produksi Go |

Ketiganya memakai aturan pagination yang sama. Tidak ada yang memeriksa robots.txt.

### Hasil (24 artikel, semuanya berhasil dibaca ketiga implementasi)

| | Bun + browser | Go (rules) | Go (trafilatura) | Penyebab hasil Go (trafilatura) berbeda |
|---|---|---|---|---|
| Recall | 100% | 100% | 99,1% | Sebagian isi sindonews hilang. Di sindonews isinya dipisah `<br>` tanpa `<p>`, dan satu paragraf yang diawali subjudul ("3. Ada Kelompok Ekstremis…") dibuang. Penyebab persis di trafilatura belum diperiksa |
| Precision | 99,9% | 99,9% | **88,9%** | Teks bukan berita ikut terambil (baris di bawah) |
| Paragraf hilang | 0 | 0 | 1 | Paragraf sindonews di atas |
| Paragraf bukan berita | 0 | 0 | **135** | Filter trafilatura generik, tidak mengenal label situs berita Indonesia: `ADVERTISEMENT`, `SCROLL TO CONTINUE`, "Baca juga", `Pewarta:/Editor:`, larangan AI antaranews, inisial `(isa/isa)`, `[Gambas:…]`, dan kredit foto. Di artikel multi-halaman, sampah ini berulang di setiap halaman |
| Judul | 24/24 | 24/24 | 21/24 | Ketiga artikel okezone: judul diambil dari `<title>` beserta akhiran ` : Okezone …`. Rules mengutamakan JSON-LD `headline` |
| Tanggal terbit | 18/18 | 18/18 | **12/18** | Keenam artikel cnnindonesia dan detik: jam benar, tetapi zona WIB ditulis `Z` (UTC), sehingga meleset 7 jam. go-htmldate membaca jam tanpa zona waktu lalu menganggapnya UTC (string asal yang dibacanya belum diperiksa). Rules mengambil `datePublished` JSON-LD atau `article:published_time` apa adanya, lengkap dengan zonanya. Tanpa opsi `ExtractTime`, hasilnya 0/18 karena hanya tanggal yang diambil (`T00:00:00Z`) |
| Penulis | 12/12 | 12/12 | 12/12 | Sama |
| Gambar di dalam isi | 28/31 | 28/31 | **2/31** | viva (2/27): lazy-load `data-original` tidak dikenali; go-trafilatura hanya membaca `src`/`data-src*` berekstensi gambar. cnnindonesia (0/3): gambar ber-`src` biasa pun tidak ikut; dugaan, blok gambar di luar paragraf dibuang trafilatura (belum diperiksa). okezone (0/1): belum diperiksa |

Kolom "Bun + browser" diukur dengan CDP Bun. Dalam putaran performa pada URL yang sama, isi dan judul dari agent-browser dan Playwright identik dengan CDP Bun di 22/22 artikel yang berhasil dibuka ketiganya.

- **Tanggal dan penulis:** hanya dinilai di situs yang menampilkannya di halaman (6 situs untuk tanggal, 4 situs untuk penulis).
- **Metadata lain:** deskripsi dan gambar utama terisi 24/24 di semua implementasi. Seksi hanya 9/24 karena banyak situs tidak menyediakannya.

### Hasil per sumber: recall / precision (%)

| Sumber | Bun + browser | Go (rules) | Go (trafilatura) | Penyebab hasil Go (trafilatura) berbeda |
|---|---|---|---|---|
| antaranews | 100 / 100 | 100 / 100 | 100 / 80 | Footer redaksi (`Pewarta:`/`Editor:`, `Copyright © ANTARA`), larangan AI, "Baca juga", dan embed tweet ikut |
| cnnindonesia | 100 / 100 | 100 / 100 | 100 / 96 | `ADVERTISEMENT`, `SCROLL TO CONTINUE WITH CONTENT`, dan dateline `Jakarta, CNN Indonesia --` ikut |
| detik | 100 / 100 | 100 / 100 | 100 / 96 | `SCROLL TO CONTINUE WITH CONTENT`, inisial redaksi `(isa/isa)`, dan dateline ikut |
| liputan6 | 100 / 100 | 100 / 100 | 100 / 96 | `Advertisement` dan ajakan promosi kanal ikut |
| sindonews (2–3 halaman) | 100 / 99 | 100 / 99 | 93 / 64 | Baris tanggal, "loading...", dan tombol ukuran huruf "A A A" ikut, berulang di setiap halaman; satu paragraf berawalan subjudul hilang |
| cnbcindonesia | 100 / 100 | 100 / 100 | 100 / 97 | Inisial redaksi dan placeholder video `[Gambas:Video CNBC]` ikut |
| okezone (2–4 halaman) | 100 / 100 | 100 / 100 | 100 / 98 | Kredit redaksi dalam kurung ikut |
| viva (2–3 halaman) | 100 / 100 | 100 / 100 | 100 / 84 | Kredit foto (`REUTERS/…`, `Dok. …`) dan judul berita terkait ikut, berulang di setiap halaman |

### Efek tanpa browser

CDP Bun dan Go (rules) dijalankan berurutan pada ke-24 artikel, lalu hasilnya dibandingkan per artikel.

| Aspek | Hasil |
|---|---|
| Teks isi | **Identik persis 24/24**: jumlah kata, jumlah paragraf, dan setiap karakter sama |
| Judul, tanggal terbit, penulis, deskripsi, tag | Identik 24/24 |
| Skor akurasi (recall, precision, gambar di dalam isi) | Identik 24/24 |
| Daftar gambar | Sama di 21/24; berbeda di 3 artikel (rincian di bawah) |

Perbedaan di daftar gambar:

| Artikel | Perbedaan | Penyebab |
|---|---|---|
| liputan6 (1 artikel) | Go mengambil 5 thumbnail berita terkait (200×113) yang tidak ada di browser: 23 vs 18 gambar | Dugaan: di browser, JavaScript lazy-load mengganti atau menghapus elemen thumbnail itu |
| detik (1 artikel) | Go mengambil placeholder lazy-load `loading.gif` sebagai gambar | Dugaan: di browser, JavaScript mengganti placeholder dengan gambar asli yang sudah ada di daftar |
| antaranews (1 artikel) | Gambar utama sama, tetapi host CDN-nya beda: `img.antaranews.com` (HTML server) vs `cdn.antaranews.com` (browser) | Nilai di HTML server diubah setelah halaman dimuat |

- **Satu temuan tidak terulang.** Di putaran benchmark, ketiga driver browser menemukan 11 gambar di satu artikel cnnindonesia, sedangkan Go menemukan 2. Saat diulang, browser juga hanya menemukan 2, jadi penyebabnya tidak bisa dipastikan.
- **Batasan yang tidak muncul di 8 sumber ini, tetapi berlaku untuk sumber lain:**
  - isi atau link pagination yang baru muncul lewat JavaScript tidak terbaca;
  - elemen yang disembunyikan lewat CSS tetap terbaca.

### Aturan ekstraksi yang dipakai (`extract-article.js`)

Ekstraktor tidak bergantung pada daftar selector per situs:

1. **Daftar selector umum** situs berita, yang hasilnya diperiksa dengan **skor kepadatan paragraf** (mirip Readability). Situs dengan struktur yang belum dikenal tetap tertangani lewat skor ini.
2. **Filter elemen bukan berita** (iklan, "baca juga", share, penulis/tanggal, keterangan foto) dan **filter baris label** (`ADVERTISEMENT`, `Pewarta:/Editor:`, ajakan follow, placeholder video, inisial redaksi).
3. Isi yang tidak dibungkus `<p>` (sindonews) diambil per baris.

Sebelum aturan ini, okezone dan viva menghasilkan isi kosong, dan precision sindonews 76%. Setiap perubahan aturan wajib diterapkan juga di port Go, lalu diukur ulang dengan `bun run bench:accuracy --urls <hasil sebelumnya>`.

## 2. Performa

### Hasil (16 artikel yang berhasil dibuka kelima implementasi, tanpa pembukaan pertama)

| Implementasi | Median / artikel | p95 | Cold start | Peak memory | Berhasil |
|---|---|---|---|---|---|
| agent-browser (default saat ini) | 25,8 dtk | 53,7 dtk | 29,9 dtk | 1,9 GB (Chrome) | 22/24 |
| CDP Bun | 3,4 dtk | 24,7 dtk | 12,7 dtk | 1,9 GB (Chrome) | 23/24 |
| Playwright | 3,8 dtk | 17,4 dtk | 5,1 dtk | 1,8 GB (Chrome) | 23/24 |
| Go (rules) | 3,1 dtk | 11,5 dtk | 3,2 dtk | **101 MB** (proses Go) | 21/24 |
| Go (trafilatura) | 1,9 dtk | 9,7 dtk | 2,0 dtk | 119 MB (proses Go) | 22/24 |

Median rasio waktu per artikel terhadap Go (rules), pada URL yang sama:
- agent-browser 8,7×
- CDP Bun 3,0×
- Playwright 1,1×
- Go (trafilatura) 0,85×

Batasan pengukuran:
- **Jaringan tidak stabil saat pengukuran.** Kelima implementasi mengalami timeout di okezone, detik, liputan6, dan cnbcindonesia. Di putaran lain saat jaringan normal, median CDP Bun 0,6 dtk dan Playwright 0,3 dtk ([benchmark driver](../reserch/benchmark-driver-browser-2026-11-02.md)).
- Angka absolutnya berubah-ubah antar putaran. Yang konsisten: agent-browser selalu paling lambat, dan Go selalu lebih cepat dari driver browser. Urutan CDP Bun dan Playwright berganti antar putaran. Urutan implementasi digilir per URL supaya cache CDN tidak menguntungkan satu implementasi.
- **Cakupan memori tidak sama.** Untuk Go diukur seluruh prosesnya, untuk browser hanya pohon proses Chrome (proses Bun tidak ikut dihitung).

### Penyebab selisih kecepatan

- `agent-browser open` menunggu event `load`, yaitu sampai semua iklan selesai dimuat; di situs penuh iklan waktunya bisa ±20 dtk.
- CDP Bun dan Playwright berhenti saat `DOMContentLoaded`, ketika isi berita sudah ada di halaman.
- Go hanya mengunduh HTML-nya, tanpa menjalankan JavaScript, gambar, atau iklan.

## 3. Perbandingan implementasi

| | agent-browser | Playwright | CDP Bun | Go (rules) |
|---|---|---|---|---|
| Akurasi | Setara | Setara | Setara | Setara |
| Kecepatan | Lambat di situs penuh iklan | Cepat | Cepat | Cepat |
| Memori | ±1,9 GB | ±1,8 GB | ±1,9 GB | ±0,1 GB |
| Butuh Chrome di server | Ya | Ya | Ya | Tidak |
| Isi yang dirender JavaScript | Terbaca | Terbaca | Terbaca | Tidak terbaca; di 8 sumber ini hanya berdampak pada daftar gambar 3 artikel |
| Dependency | Binary npm global (butuh Node.js/npm di server) | `playwright-core` | Tidak ada | `x/net/html`, `cascadia` |
| Pemulihan crash Chrome | Belum ada | Otomatis | Otomatis | Tidak relevan |
| Perawatan | Pembungkus CLI | Pembungkus tipis | Klien CDP dan peluncur Chrome | Aturan ekstraksi dirawat di dua bahasa |

## 4. Evaluasi AI agent (Hermes Agent): ditolak

Dikaji apakah membaca isi artikel lewat AI agent lebih andal daripada ekstraktor deterministik. Agent yang diuji adalah Hermes Agent dengan Claude Sonnet 5.5: membuka halaman dengan browser, lalu menyalin isi berita sesuai prompt. Uji cobanya 1 artikel detik dan 1 artikel liputan6 per backend, dinilai dengan alat akurasi yang sama.

| Cara | detik | liputan6 | Waktu / artikel | Biaya / artikel |
|---|---|---|---|---|
| Scraper deterministik (CDP Bun) | 100 / 100 | 100 / 100 | 0,2–2,6 dtk | $0 |
| Hermes + Browser Use (bawaan Hermes) | 100 / 100 | 100 / 100 | 54–55 dtk | $0,043–0,048 |
| Hermes + agent-browser 0.26.0 | gagal (timeout) | 100 / 100 | 40 dtk | $0,051 |

Recall / precision dalam persen.

**Ditolak** ([ADR-0004](../adr/0004-ekstraksi-artikel-dengan-hermes-agent.md)), karena:

- **Akurasi tidak bertambah.** Ekstraktor deterministik sudah 100% / 99,9% pada 8 sumber.
- **Selector cukup ditentukan saat setup** dan diverifikasi dengan benchmark akurasi; tidak perlu AI.
- **Mahal dan lambat:** ±$45–50 per 1.000 artikel (perkiraan) dan ±25–250× lebih lambat, tanpa imbalan akurasi.
- **Risiko keamanan:** backend yang andal (Browser Use) butuh akses shell untuk agent sambil membaca halaman tak tepercaya.
- **Tidak deterministik:** risiko parafrase atau halusinasi teks.
- **Izin penerbit:** pemrosesan isi berita oleh AI dilarang sebagian penerbit (mis. antaranews tanpa izin tertulis).

## 5. Usulan

- **Untuk 8 sumber ini, browser tidak dibutuhkan.**
  - HTML server sudah memuat isi lengkap.
  - Aturan ekstraksi yang sama memberi hasil identik dengan atau tanpa browser.
  - Tanpa browser, memori turun dari ±1,9 GB ke ±0,1 GB.
- **Sistem produksi Go diusulkan memakai port aturan ini** (`go-scraper/internal/infrastructure/extract/rules`) sebagai pengganti go-trafilatura. Dampaknya:
  - precision naik dari 88,9% ke 99,9%;
  - tanggal terbit naik dari 12/18 ke 18/18;
  - gambar di dalam isi naik dari 2/31 ke 28/31.
- **Browser tetap disiapkan sebagai jalur cadangan** untuk sumber yang isinya hanya muncul lewat JavaScript. Jika jalur browser dipertahankan, Playwright atau CDP Bun dipakai, bukan agent-browser.
- Rincian dan pertanyaan terbuka ada di [ADR-0005](../adr/0005-komparasi-scraper-go-tanpa-browser.md).

## 6. Risiko dan batasan

- **Izin penerbit:** footer antaranews melarang pengindeksan otomatis untuk AI tanpa izin tertulis, dan robots.txt tempo memasang `ai-train=no`. Pemakaian produksi perlu dipastikan izinnya.
- **Aturan di dua bahasa:** setiap perubahan `extract-article.js` harus diterapkan juga di port Go dan diukur ulang dengan alat yang sama.
- **Sumber terblokir:** tempo, republika, dan tribunnews memblokir Chrome headless dan tidak diukur.
- **Sampel kecil:** 24 artikel dari 8 sumber pada satu hari.

## Sumber

Repo: [github.com/adehikmatfr/news-scrap](https://github.com/adehikmatfr/news-scrap)

| Dokumen / kode | Isi |
|---|---|
| [ADR-0003: driver browser](../adr/0003-driver-browser-agent-browser-playwright-atau-cdp.md) | Pilihan driver lewat `BROWSER_DRIVER`, spike Windows/Linux, sandbox |
| [ADR-0004: Hermes Agent (ditolak)](../adr/0004-ekstraksi-artikel-dengan-hermes-agent.md) | Data spike Hermes dan alasan penolakan |
| [ADR-0005: komparasi scraper Go tanpa browser](../adr/0005-komparasi-scraper-go-tanpa-browser.md) | Port Go, hasil per sumber, usulan, dan pertanyaan terbuka |
| [Benchmark akurasi ekstraksi](../reserch/benchmark-akurasi-ekstraksi-2026-11-02.md) | Data per artikel dan per sumber, sebelum dan sesudah perbaikan ekstraktor |
| [Benchmark driver browser](../reserch/benchmark-driver-browser-2026-11-02.md) | Performa ketiga driver browser saat jaringan normal |
| [`extract-article.js`](../../scraper/src/infrastructure/browser/scripts/extract-article.js) | Aturan ekstraksi yang dipakai ketiga driver browser |
| [`agent-browser-cli.js`](../../scraper/src/infrastructure/browser/agent-browser-cli.js) · [`cdp-driver.js`](../../scraper/src/infrastructure/browser/cdp-driver.js) · [`playwright-driver.js`](../../scraper/src/infrastructure/browser/playwright-driver.js) | Implementasi ketiga driver browser |
| [`go-scraper/`](../../go-scraper/README.md) | Scraper Go tanpa browser (clean architecture) |
| [`rules.go`](../../go-scraper/internal/infrastructure/extract/rules/rules.go) · [`scrape_article.go`](../../go-scraper/internal/application/scrape_article.go) | Port Go dari `extract-article.js` dan `scrape-article.js` |
| [`compare-with-source.js`](../../scraper/tools/compare-with-source.js) | Alat ukur akurasi (`bun run bench:accuracy`) |
| [`compare-drivers.js`](../../scraper/tools/compare-drivers.js) | Alat ukur performa (`bun run bench`) |
