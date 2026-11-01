# Laporan: Akurasi Ekstraksi dan Performa Driver Browser

- **Tanggal:** 2 November 2026
- **Lingkup:** `scraper/` (commit `5e5f8c8`)
- **Rincian:** [ADR-0003](../adr/0003-driver-browser-agent-browser-playwright-atau-cdp.md) · [ADR-0004 (ditolak)](../adr/0004-ekstraksi-artikel-dengan-hermes-agent.md) · [benchmark akurasi](../reserch/benchmark-akurasi-ekstraksi-2026-11-02.md) · [benchmark driver](../reserch/benchmark-driver-browser-2026-11-02.md)

## Ringkasan

- **Akurasi isi berita 99–100%** (recall dan precision) pada 8 sumber, setelah ekstraktor dibuat generik. Sebelumnya, 2 sumber menghasilkan isi kosong dan 1 sumber precision-nya 76%.
- **Judul, tanggal terbit, dan penulis 100% cocok** dengan yang tampil di halaman asli.
- **Pilihan driver tidak memengaruhi akurasi.** agent-browser, Playwright, dan CDP Bun menghasilkan isi yang sama.
- **Pilihan driver sangat memengaruhi kecepatan:** median per artikel 25,3 dtk (agent-browser) vs 0,6 dtk (CDP Bun) vs 0,3 dtk (Playwright).
- **Rekomendasi:** jadikan **CDP Bun** kandidat driver default (tanpa dependency, tanpa npm di server), setelah lolos uji jalan 24 jam. Default saat ini masih agent-browser.
- **Ekstraksi dengan AI agent (Hermes) ditolak:** akurasinya sama, tetapi 40–55 dtk dan ±$0,05 per artikel, butuh akses shell untuk backend yang andal, dan terbentur izin penerbit (bagian 4).

## 1. Akurasi

### Metode

Hasil scraper dibandingkan dengan **halaman aslinya**, bukan dengan hasil scraper lain. Pembanding diambil dari HTML lewat request HTTP biasa (tanpa browser dan tanpa ekstraktor), memakai selector yang dipilih manual per situs. Sampelnya 3 artikel terbaru per sumber, dengan URL yang sama untuk pengukuran sebelum dan sesudah perbaikan.

- **Recall:** bagian isi berita di halaman yang ikut terambil.
- **Precision:** bagian teks hasil scraper yang benar-benar isi berita; sisanya iklan, footer, atau tautan.

### Hasil per driver (setelah perbaikan ekstraktor)

24 artikel dari 8 sumber, setiap artikel dibuka oleh ketiga driver (72 pengukuran, tidak ada yang gagal).

| Driver | Recall | Precision | Paragraf hilang | Paragraf bukan berita | Judul | Tanggal terbit | Penulis |
|---|---|---|---|---|---|---|---|
| agent-browser | 100% | 99,9% | 0 | 0 | 24/24 | 18/18 | 12/12 |
| CDP Bun | 100% | 99,9% | 0 | 0 | 24/24 | 18/18 | 12/12 |
| Playwright | 100% | 99,9% | 0 | 0 | 24/24 | 18/18 | 12/12 |

**Ketiga driver identik di setiap sumber.** Akurasi ditentukan oleh ekstraktor (`extract-article.js`), yang dipakai bersama oleh ketiganya, bukan oleh driver. Yang diambil hanya isi berita: iklan, promosi kanal, footer redaksi, dan ajakan follow dibuang.

Tanggal dan penulis hanya dinilai di situs yang menampilkannya di halaman (6 situs untuk tanggal, 4 situs untuk penulis). Deskripsi, tag, dan gambar utama terisi 24/24; seksi hanya 9/24 karena banyak situs tidak menyediakannya.

### Hasil per sumber: recall / precision

| Sumber | agent-browser | CDP Bun | Playwright | Sebelum perbaikan |
|---|---|---|---|---|
| antaranews | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 87 (footer redaksi, embed tweet) |
| cnnindonesia | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 98 (label iklan) |
| detik | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 97 (label iklan) |
| liputan6 | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 93 (ajakan promosi) |
| sindonews | 100 / 99 | 100 / 99 | 100 / 99 | 95 / 76 (penulis, tanggal, berita terkait ikut) |
| cnbcindonesia | 100 / 100 | 100 / 100 | 100 / 100 | 100 / 100 |
| okezone | 100 / 100 | 100 / 100 | 100 / 100 | **0** (isi kosong) |
| viva | 100 / 100 | 100 / 100 | 100 / 100 | **0** (isi kosong) |

Dalam persen. Kolom "Sebelum perbaikan" diukur dengan CDP Bun pada artikel yang sama. Pengukuran sebelumnya dengan ketiga driver menunjukkan hasil yang juga identik antar driver. Sisa 1% precision sindonews tidak berupa paragraf bukan berita (jumlahnya 0); penyebab selisih kata yang tersisa belum diperiksa.

### Perbaikan yang dilakukan

Ekstraktor tidak lagi bergantung pada daftar selector per situs:

1. **Daftar selector umum** situs berita, yang hasilnya diperiksa dengan **skor kepadatan paragraf** (mirip Readability). Situs dengan struktur yang belum dikenal tetap tertangani lewat skor ini.
2. **Filter elemen bukan berita** (iklan, "baca juga", share, penulis/tanggal, keterangan foto) dan **filter baris label** (`ADVERTISEMENT`, `Pewarta:/Editor:`, ajakan follow, placeholder video, inisial redaksi).
3. Isi yang tidak dibungkus `<p>` (sindonews) diambil per baris.

Setiap perubahan ekstraktor wajib diukur ulang dengan `bun run bench:accuracy --urls <hasil sebelumnya>`.

## 2. Performa

### Hasil (27 artikel dari 9 sumber, ketiga driver membuka URL yang sama)

| Driver | Median / artikel | p95 | Cold start | Peak memory (Chrome) |
|---|---|---|---|---|
| agent-browser (default) | 25,3 dtk | 36,5 dtk | 25,4 dtk | 3,3 GB |
| CDP Bun | 0,6 dtk | 29,7 dtk | 1,4 dtk | 2,4 GB |
| Playwright | 0,3 dtk | 17,7 dtk | 3,1 dtk | 2,1 GB |

Tingkat keberhasilan: agent-browser 14/27, CDP Bun dan Playwright 15/27. Kegagalan sisanya adalah sumber yang memblokir browser otomatis atau, pada saat itu, belum terbaca ekstraktor; tidak ada yang disebabkan driver, kecuali satu timeout jaringan pada agent-browser.

### Penyebab selisih kecepatan

`agent-browser open` menunggu event `load`, yaitu sampai semua iklan selesai dimuat; di situs penuh iklan, waktu tunggunya bisa ±20 dtk. CDP Bun dan Playwright berhenti saat `DOMContentLoaded`, ketika isi berita sudah ada di halaman. Di situs ringan (liputan6, sindonews), selisihnya hanya 0,5–1 dtk.

## 3. Perbandingan driver

| | agent-browser | Playwright | CDP Bun |
|---|---|---|---|
| Akurasi | Setara | Setara | Setara |
| Kecepatan | Lambat di situs penuh iklan | Tercepat | Hampir setara Playwright |
| Dependency | Binary npm global (butuh Node.js/npm di server) | `playwright-core` di `package.json` | Tidak ada |
| Dukungan Bun | Proses terpisah, aman | Tidak resmi; teruji jalan di Windows dan Linux (Docker) | Hanya API Bun |
| Pemulihan crash Chrome | Belum ada | Otomatis | Otomatis |
| Kode yang dirawat sendiri | Pembungkus CLI | Pembungkus tipis | Klien CDP dan peluncur Chrome (298 baris kode, 311 baris test) |

## 4. Evaluasi AI agent (Hermes Agent): ditolak

Dikaji apakah membaca isi artikel lewat AI agent (Hermes Agent + Claude Sonnet 5.5, membuka halaman dengan browser lalu menyalin isi berita sesuai prompt) lebih andal daripada ekstraktor deterministik. Uji coba 1 artikel detik dan 1 artikel liputan6 per backend, dinilai dengan alat akurasi yang sama.

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

## 5. Risiko dan batasan

- **Sampel kecil:** 3 artikel per sumber, satu kali pengukuran, di laptop Windows. Performa di server Linux dengan situs sungguhan belum diukur.
- **Performa diukur sebelum ekstraktor diubah.** Ekstraktor baru melakukan lebih banyak pemeriksaan DOM; dampaknya pada waktu belum diukur ulang (diperkirakan kecil dibanding waktu muat halaman).
- **Izin penerbit:** footer antaranews melarang pengindeksan otomatis untuk AI tanpa izin tertulis; robots.txt tempo memasang `ai-train=no`. Pemakaian produksi perlu dipastikan izinnya.

