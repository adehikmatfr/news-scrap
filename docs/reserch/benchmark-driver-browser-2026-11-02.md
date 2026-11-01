# Benchmark Driver Browser: agent-browser, CDP Bun, Playwright

- **Tanggal:** 2 November 2026, 03:56–04:07 WIB (11 menit)
- **Terkait:** [ADR-0003](../adr/0003-driver-browser-agent-browser-playwright-atau-cdp.md) bagian 6 (metode) dan 6.3 (kriteria peralihan)
- **Alat:** `scraper/tools/compare-drivers.js` (`bun run bench`)

## Lingkungan

| Hal | Nilai |
|---|---|
| Mesin | Laptop, Intel Core i5-13450HX, RAM 16 GB, Windows 11 Home |
| Jaringan | Koneksi rumah (Indonesia), tidak diukur |
| Bun | 1.4.4 |
| Chrome | Chrome for Testing 156.0.8078.80 (biner milik agent-browser, dipakai ketiga driver) |
| agent-browser | 0.41.1 |
| `playwright-core` | 1.64.1 |
| Sandbox Chrome | Mati (`--no-sandbox`) untuk CDP dan Playwright; agent-browser memakai bawaannya |

## Metode

- 9 sumber RSS baru di `config.json`, masing-masing 3 artikel terbaru: 27 URL, 81 pengukuran.
- Daftar URL diambil sekali dari RSS, lalu dipakai ketiga driver.
- Setiap URL dibuka oleh ketiga driver secara bergiliran. Urutan driver digeser per URL agar cache CDN tidak menguntungkan satu driver.
- Ketiga driver hidup bersamaan selama benchmark; jeda `delayMs` 1,5 dtk setelah setiap pengukuran tidak ikut dihitung.
- Waktu diukur dari sebelum `ScrapeArticle.execute` sampai selesai, termasuk halaman lanjutan jika ada. Artikel dianggap berhasil jika lolos `assertComplete` (judul ada, kata ≥ `minWords`).
- Tanpa webhook dan tanpa menulis `data/sent.json`.
- Memori: puncak *private bytes* (`Win32_Process.PrivatePageCount`) seluruh proses Chrome milik tiap driver, ditambah daemon agent-browser, diambil tiap 2 dtk. Proses GPU dan renderer iklan ikut terhitung. Memori Playwright di dalam proses Bun tidak terpisah dan tidak masuk angka ini.
- Tidak diikutkan: `tribunnews` (RSS membalas 403, situs memblokir browser otomatis), `kompas` (belum ada izin), `antaranews` (bukan sumber baru).

## Hasil

### Ringkasan per driver

| Driver | Berhasil | Mulai dingin | Median | p95 | Total waktu (artikel berhasil, tanpa mulai dingin) | Puncak memori Chrome |
|---|---|---|---|---|---|---|
| agent-browser | 14/27 | 25,4 dtk | 25,3 dtk | 36,5 dtk | 214 dtk (13 artikel) | 3.289 MB |
| CDP Bun | 15/27 | 1,4 dtk | 0,60 dtk | 29,7 dtk | 39 dtk (14 artikel) | 2.419 MB |
| Playwright | 15/27 | 3,1 dtk | 0,30 dtk | 17,7 dtk | 24 dtk (14 artikel) | 2.145 MB |

### Per sumber (berhasil · median)

| Sumber | agent-browser | CDP Bun | Playwright | Catatan |
|---|---|---|---|---|
| cnnindonesia | 3/3 · 25,4 dtk | 3/3 · 0,43 dtk | 3/3 · 0,28 dtk | |
| detik | 2/3 · 28,6 dtk | 3/3 · 2,6 dtk | 3/3 · 0,91 dtk | Satu kegagalan agent-browser: timeout koneksi jaringan |
| liputan6 | 3/3 · 0,73 dtk | 3/3 · 0,21 dtk | 3/3 · 0,25 dtk | |
| sindonews | 3/3 · 1,3 dtk | 3/3 · 0,60 dtk | 3/3 · 0,51 dtk | |
| cnbcindonesia | 3/3 · 30,7 dtk | 3/3 · 0,36 dtk | 3/3 · 0,25 dtk | |
| tempo | 0/3 | 0/3 | 0/3 | Halaman blokir Cloudflare, isi 0 kata |
| okezone | 0/3 | 0/3 | 0/3 | idem |
| viva | 0/3 | 0/3 | 0/3 | idem |
| republika | 0/3 | 0/3 | 0/3 | Chrome: `net::ERR_HTTP_RESPONSE_CODE_FAILURE` |

### Kesetaraan isi

| Pasangan | Judul dan `content_text` identik |
|---|---|
| CDP Bun vs Playwright | 15/15 |
| CDP Bun / Playwright vs agent-browser | 20/28 |

Semua perbedaan dengan agent-browser berselisih 2–5 kata, pada 1 artikel cnnindonesia dan 3 artikel sindonews. Satu artikel sindonews diperiksa paragraf per paragraf: satu-satunya beda adalah baris tanggal dan penghitung views, yang terbaca `views: 147` di agent-browser dan `loading...` di CDP. Perbedaan lain belum diperiksa satu per satu, tetapi polanya sama (CDP dan Playwright identik satu sama lain, selisihnya kecil).

## Temuan

### Kenapa agent-browser jauh lebih lambat

`agent-browser open` menunggu event `load` halaman, sedangkan CDP Bun dan Playwright selesai saat `DOMContentLoaded`. Diuji dengan halaman lokal:

| Halaman | agent-browser | CDP Bun |
|---|---|---|
| Gambar dibalas setelah 4 dtk | 5,9 dtk | 31 ms |
| Gambar yang tidak pernah dibalas | 21,6 dtk, lalu lanjut tanpa error | 16 ms |

Di situs dengan banyak iklan (cnnindonesia, cnbcindonesia, detik), `load` baru terjadi setelah semua iklan dimuat, atau tidak pernah terjadi sehingga agent-browser menunggu sampai batasnya sendiri (±20 dtk). Di situs yang ringan (liputan6, sindonews), selisihnya kecil (0,7–1,3 dtk vs 0,2–0,6 dtk). Jadi selisih kecepatan terutama berasal dari **kondisi tunggu**, bukan dari overhead proses CLI.

Akibat kondisi tunggu itu: konten yang diisi JavaScript setelah `DOMContentLoaded` (penghitung views, widget) bisa belum terisi pada CDP dan Playwright. Isi berita pada sumber yang berhasil tidak terdampak. Jika situs mengisi isi berita sendiri lewat JavaScript, `waitFor` per sumber tetap diperlukan.

### Masalah sumber, bukan driver

Kegagalan berikut sama persis di ketiga driver:

| Sumber | Gejala | Dugaan | Status |
|---|---|---|---|
| okezone, viva | Judul terbaca, `content_text` kosong | Ekstraktor tidak mengenali wadah isi artikel (`.c-detail.read`, `.main-content-detail`); lihat [benchmark akurasi](benchmark-akurasi-ekstraksi-2026-11-02.md) | Diperiksa di benchmark akurasi |
| tempo | `content_text` kosong; judul yang terbaca adalah judul halaman blokir Cloudflare ("Sorry, you have been blocked") | Situs memblokir Chrome headless | Tidak dicoba ditembus |
| republika | Chrome gagal membuka halaman artikel; `fetch` biasa ke URL yang sama membalas 200 dengan User-Agent bot maupun default | Situs menolak Chrome headless | Tidak dicoba ditembus. Status HTTP yang diterima Chrome belum dicatat |
| tribunnews | RSS membalas 403 | Situs memblokir akses otomatis | Tidak diikutkan |

Semua `pattern` sumber baru belum diawali `^https://`, padahal itu disyaratkan skill `add-news-source` supaya link iklan yang memuat URL artikel tidak ikut.

### Memori

Ketiga Chrome hidup bersamaan dan membuka halaman yang sama, jadi angkanya bisa dibandingkan satu sama lain, tetapi tidak menggambarkan pemakaian satu driver yang berjalan sendirian. Angka 2–3 GB per Chrome mencakup proses GPU dan renderer iklan; *private bytes* menghitung memori yang dipesan, bukan yang benar-benar terpakai.

## Penilaian terhadap kriteria ADR-0003 bagian 6.3

| Kriteria | CDP Bun | Playwright |
|---|---|---|
| 1. Lolos di Linux | Ya (spike dan uji integrasi Docker) | Ya |
| 2. Keberhasilan ≥ agent-browser | Ya (15 vs 14 dari 27) | Ya (15 vs 14) |
| 3. Isi identik ≥ 95% dengan agent-browser | **Tidak** (20/28 = 71%); sisanya dijelaskan oleh kondisi tunggu | **Tidak**, sama |
| 4. Uji 24 jam | Belum dijalankan | Belum dijalankan |
| 5. Keunggulan nyata | Ya: median 0,60 vs 25,3 dtk | Ya: median 0,30 vs 25,3 dtk |

Kriteria 3 gagal karena agent-browser menunggu `load`, sehingga pembanding bawaannya adalah "halaman setelah semua iklan dimuat". Perbedaannya ada pada widget di luar isi berita, tetapi angka 95% tetap tidak tercapai.

## Rekomendasi

1. **Default belum diganti.** Kriteria 3 dan 4 belum terpenuhi.
2. **Putuskan arti kriteria 3.** Pilihannya:
   - (a) Ubah pembanding menjadi isi berita saja, dan perlakukan widget dinamis sebagai masalah kualitas data (sudah tercatat di README: sisa elemen non-berita di `content_text`).
   - (b) Tambahkan opsi tunggu `load` dengan batas waktu ke CDP dan Playwright, lalu ukur ulang. Kecepatannya akan turun mendekati agent-browser di situs penuh iklan.
3. **Kandidat default: CDP Bun.** Playwright sedikit lebih cepat (median 0,30 vs 0,60 dtk) dan sedikit lebih hemat memori, tetapi keduanya menghasilkan isi identik. Menurut ADR-0003, CDP diutamakan jika hasilnya setara karena tanpa dependency dan tanpa npm. Selisih 0,3 dtk per artikel tidak berarti dengan jadwal 15–20 menit.
4. **Jalankan uji 24 jam** dengan driver kandidat setelah kriteria 3 diputuskan.
5. **Perbaiki sumber baru** secara terpisah: okezone dan viva lewat skill `add-news-source`; tempo, republika, dan tribunnews dikeluarkan dari `config.json` atau ditunda; semua `pattern` diawali `^https://`.

## Yang belum diukur

- Hasil di Linux dengan situs sungguhan (uji Linux sejauh ini hanya halaman lokal).
- Lebih dari satu putaran per URL; angka di atas berasal dari satu kali pengukuran per pasangan driver–URL.
- Memori tiap driver saat berjalan sendirian, dan memori proses Bun.
- Pemakaian CPU.
