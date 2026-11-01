# Benchmark Akurasi Ekstraksi terhadap Halaman Asli

- **Tanggal:** 2 November 2026, 04:26–04:36 WIB (10 menit)
- **Terkait:** [benchmark driver browser](benchmark-driver-browser-2026-11-02.md) (kecepatan dan memori), [ADR-0003](../adr/0003-driver-browser-agent-browser-playwright-atau-cdp.md)
- **Alat:** `scraper/tools/compare-with-source.js`

## Pertanyaan

Seberapa sama data yang dihasilkan scraper (judul, tanggal, penulis, isi berita, gambar, metadata lain) dengan yang tertulis di halaman aslinya, dan apakah driver browser berpengaruh?

## Lingkungan

Sama dengan benchmark driver: laptop Intel Core i5-13450HX, RAM 16 GB, Windows 11; Bun 1.4.4; Chrome for Testing 156.0.8078.80 untuk ketiga driver; agent-browser 0.41.1; `playwright-core` 1.64.1.

## Metode

### Referensi (kunci jawaban)

Referensi dibuat **tanpa driver dan tanpa ekstraktor**: HTML halaman diambil lewat `fetch` biasa (User-Agent dari `config.userAgent`), lalu diurai dengan `HTMLRewriter` bawaan Bun memakai selector per situs. Selector dipilih manual dari struktur halaman pada 2 November 2026 dan disimpan di tabel `REFERENCE` dalam alat.

| Bagian | Aturan referensi |
|---|---|
| Isi berita | Paragraf `<p>` di dalam wadah isi situs (sindonews: teks per baris, karena isinya tidak dibungkus `<p>`). Tidak dihitung: `script`, `iframe`, `ins`, `aside`, `blockquote` (embed media sosial), keterangan foto (`figure`/`figcaption`), blok "baca juga", iklan, dan paragraf yang diawali "Baca juga", "Advertisement", "Scroll to continue", dan sejenisnya |
| Halaman lanjutan | Link ke path artikel yang sama dengan `?page=N` atau `/N` diikuti, maksimal `maxPages` sumber |
| Judul, penulis, tanggal | Teks elemen yang terlihat pembaca (mis. `h1`, `.detail__author`, `.detail__date`). Jika elemennya tidak ditemukan di situs itu, field tersebut tidak dinilai |
| Gambar di dalam isi | `img` di dalam wadah isi (termasuk di dalam `figure`), dibandingkan berdasarkan nama file |

Referensi diambil tepat sebelum driver membuka URL yang sama.

### Penilaian

| Field | Cara menilai |
|---|---|
| Isi: recall | Bagian kata referensi yang ada di `content_text` (dihitung sebagai multiset kata, huruf kecil) |
| Isi: presisi | Bagian kata `content_text` yang ada di referensi; sisa kata = teks yang bukan isi berita |
| Paragraf hilang / sampah | Paragraf dianggap ada di sisi lain jika ≥ 50% katanya ditemukan di sana. Dinilai per kata karena ekstraktor dan referensi bisa memecah paragraf secara berbeda |
| Judul | Sama persis dengan teks `h1` setelah normalisasi spasi dan tanda kutip |
| Tanggal | `published_at` dikonversi ke WIB, dibandingkan sampai menit dengan tanggal yang terlihat |
| Penulis | Nama di baris penulis yang terlihat (tanpa label "Oleh", "Pewarta:", dan nama media) ada di `authors` |
| Deskripsi, seksi, tag, gambar utama | Hanya ada atau tidaknya; halaman tidak menampilkan field ini secara konsisten |

### Cakupan

10 sumber × 3 artikel terbaru × 3 driver = 90 pengukuran. Sumber: antaranews dan 9 sumber baru, tanpa tribunnews (RSS 403) dan kompas (belum ada izin). URL yang sama untuk ketiga driver; urutan driver digeser per URL.

## Hasil

### Per driver

| Driver | Dinilai | Recall isi | Presisi isi | Judul | Tanggal | Penulis | Gambar di isi |
|---|---|---|---|---|---|---|---|
| agent-browser | 24/30 | 74% | 93% | 24/24 | 18/18 | 12/12 | 12/27 |
| CDP Bun | 24/30 | 74% | 93% | 24/24 | 18/18 | 12/12 | 12/27 |
| Playwright | 24/30 | 74% | 93% | 24/24 | 18/18 | 12/12 | 12/27 |

**Driver tidak berpengaruh pada akurasi.** Selisih antar driver hanya pada widget dinamis: agent-browser menangkap `views: 492`, CDP dan Playwright menangkap `loading...` (sindonews), plus satu baris `;` ekstra di agent-browser (cnnindonesia). Selisih presisi ≤ 0,4 poin.

Angka recall 74% turun karena okezone dan viva (isi tidak terbaca sama sekali). Tanpa kedua sumber itu, 18 artikel dari 6 sumber: **recall 99%, presisi 93%**.

### Per sumber (driver CDP Bun)

| Sumber | Dinilai | Recall | Presisi | Paragraf hilang | Paragraf sampah | Judul | Tanggal | Penulis |
|---|---|---|---|---|---|---|---|---|
| antaranews | 3/3 | 100% | 95% | 0 | 4 | 3/3 | 3/3 | 3/3 |
| cnnindonesia | 3/3 | 99% | 98% | 3 | 6 | 3/3 | 3/3 | - |
| detik | 3/3 | 100% | 97% | 0 | 3 | 3/3 | 3/3 | 3/3 |
| liputan6 | 3/3 | 100% | 93% | 0 | 3 | 3/3 | 3/3 | 3/3 |
| sindonews | 3/3 | 95% | 76% | 3 | 79 | 3/3 | 3/3 | - |
| cnbcindonesia | 3/3 | 100% | 100% | 0 | 0 | 3/3 | - | - |
| okezone | 3/3 | **0%** | - | 41 | 0 | 3/3 | - | - |
| viva | 3/3 | **0%** | - | 81 | 0 | 3/3 | 3/3 | 3/3 |
| tempo | 0/3 | | | | | | | |
| republika | 0/3 | | | | | | | |

"-" berarti field itu tidak dinilai karena halaman tidak menampilkan elemennya (cnnindonesia hanya menulis "CNN Indonesia", cnbcindonesia tidak punya elemen penulis atau tanggal yang dikenali).

### Metadata yang tidak bisa dibandingkan dengan halaman

| Field | Terisi (semua driver sama) |
|---|---|
| Deskripsi | 24/24 |
| Tag | 24/24 |
| Gambar utama | 24/24 |
| Seksi | 9/24 (hanya antaranews, okezone, viva) |

## Temuan

### Yang sudah akurat

- **Judul, tanggal terbit, dan penulis cocok 100%** pada semua artikel yang bisa dinilai (24 judul, 18 tanggal, 12 penulis), termasuk penulis tanpa label media ("Muchamad Sholihin - detikNews" → `Muchamad Sholihin`).
- **Isi berita lengkap** di antaranews, cnnindonesia, detik, liputan6, sindonews (termasuk 3 halaman), dan cnbcindonesia. "Paragraf hilang" di cnnindonesia (`[Gambas:Video CNN]`, `[Gambas:Youtube]`) dan sindonews (`(ahm)`, `(sto)`: inisial editor) adalah placeholder, bukan kalimat berita.

### Teks bukan berita yang ikut terambil

| Sumber | Contoh | Penyebab |
|---|---|---|
| cnnindonesia, detik | `ADVERTISEMENT`, `SCROLL TO CONTINUE WITH CONTENT` | Label iklan di dalam wadah isi |
| antaranews | `Pewarta: … Editor: … Copyright © ANTARA 2026`, teks tweet yang di-embed, kalimat larangan crawling untuk AI | Footer dan embed berada di dalam `.post-content` |
| liputan6 | `Baca berita terkini dan terpercaya di Berita Liputan6` | Ajakan promosi di akhir isi |
| sindonews | Nama penulis, baris tanggal + penghitung views, keterangan foto, `Halaman :123`, `Lihat Juga :`, judul berita terkait, `Follow WhatsApp Channel SINDOnews` | Ekstraktor memakai `article` (tidak ada selector spesifik), jadi seluruh kepala dan kaki artikel ikut |

### Isi tidak terbaca

| Sumber | Gejala | Penyebab | Status |
|---|---|---|---|
| okezone | `content_text` kosong; referensi 5–27 paragraf, sampai 4 halaman | Wadah isi `.c-detail.read` tidak ada di `bodySelectors` ekstraktor | Bisa diperbaiki di `extract-article.js` |
| viva | `content_text` kosong; referensi 17–38 paragraf, 2–3 halaman | Wadah isi `.main-content-detail` tidak ada di `bodySelectors` | Bisa diperbaiki |
| tempo | Chrome headless mendapat halaman Cloudflare "Sorry, you have been blocked"; saat benchmark ini, `fetch` biasa juga dibalas 403 (beberapa menit sebelumnya, saat memeriksa struktur halaman, masih 200) | Situs memblokir akses otomatis | Tidak dicoba ditembus |
| republika | Chrome gagal membuka artikel (`net::ERR_HTTP_RESPONSE_CODE_FAILURE`); `fetch` biasa dibalas 200 | Situs menolak Chrome headless | Tidak dicoba ditembus |

Koreksi atas benchmark driver: di sana tempo dicatat "judul terbaca, isi 0 kata" dengan dugaan ekstraktor. Judul yang terbaca ternyata judul halaman blokir Cloudflare.

### Gambar

Gambar di dalam wadah isi hanya ditemukan di viva (27 gambar referensi; 12 cocok dengan hasil ekstraksi). Di sumber lain, gambar artikel berada di luar wadah isi dan tercakup oleh `main_image` (terisi 24/24). Penilaian gambar belum cukup data untuk disimpulkan.

## Rekomendasi

1. **Pilihan driver bisa diputuskan dari kecepatan dan operasional saja.** Akurasi ketiganya setara; selisihnya hanya pada widget dinamis di luar isi berita. Ini menjawab kriteria 3 ADR-0003 dengan pilihan (a): bandingkan isi berita, dan perlakukan widget sebagai masalah kualitas data.
2. **Perbaikan ekstraktor dengan dampak terbesar:**
   - Tambahkan `.c-detail.read` (okezone) dan `.main-content-detail` (viva) ke `bodySelectors`, lalu uji ulang dengan alat ini.
   - Tambahkan selector isi spesifik untuk sindonews (`.detail-desc`), supaya kepala dan kaki artikel tidak ikut.
   - Buang baris label umum: `ADVERTISEMENT`, `SCROLL TO CONTINUE WITH CONTENT`, `Baca berita terkini …`, `Follow WhatsApp Channel …`, baris `Pewarta:/Editor:/Copyright`. Ini bagian dari rencana "filter umum + `removeSelectors` per sumber" di CLAUDE.md.
3. **Tempo dan republika:** keluarkan dari `config.json` atau tunda; keduanya memblokir Chrome headless dan tidak boleh ditembus. (Sudah dihapus dari `config.json`.)
4. **Ulangi benchmark ini setiap kali `extract-article.js` atau selector sumber berubah.** Tabel `REFERENCE` perlu diperiksa ulang jika situs mengubah tampilan; alat menandai artikel dengan "reference: no paragraphs" jika selector referensi tidak lagi cocok.

## Pengukuran ulang setelah perbaikan ekstraktor

Diukur 2 November 2026 pagi, setelah tempo dan republika dihapus dari `config.json`. Driver CDP Bun; **URL yang sama persis** untuk sebelum dan sesudah (`--urls`), 8 sumber × 3 artikel.

### Perubahan ekstraktor (`extract-article.js`)

| Bagian | Isi |
|---|---|
| Daftar selector isi | Diperluas dengan pola umum situs berita (`.article-body`, `.story-body`, `.detail-content`, `.detail-desc`, `.main-content-detail`, `.c-detail`, `[class*="article-content"]`, `[class*="content-body"]`, `[class*="body-text"]`, dan lainnya). Selector yang terlalu lebar (`article`, `article .content`) dibuang |
| Skor kepadatan paragraf | Setiap `<p>` (≥ 25 karakter) atau blok teks yang dipisah `<br>` (≥ 80 karakter) memberi skor ke wadahnya dan setengahnya ke induk wadah; skor dikali `1 − kepadatan link`, ditambah bobot kelas (`content`/`detail`/`read`… naik, `related`/`ads`/`footer`… turun). Jika induk memuat ≥ 1,2× teks, pilihan naik ke induk (artikel yang dipecah ke beberapa wadah bersaudara) |
| Pilihan wadah | Hasil selector dipakai hanya jika cocok dengan hasil skor (memuat atau dimuat olehnya, atau isinya ≥ 70%); selain itu dipakai hasil skor. Situs dengan struktur yang tidak dikenal tetap tertangani |
| Elemen bukan isi | Dilewati berdasarkan tag (`script`, `iframe`, `aside`, `figure`, `nav`, `footer`, `blockquote`, …) dan token kelas/id (`ads`, `related`, `baca-juga`, `share`, `author`, `date`, `caption`, …), serta atribut `hidden` / `aria-hidden` |
| Isi tanpa `<p>` | Jika `<p>` memuat < 60% teks wadah, isi diambil per baris blok/`<br>` (kasus sindonews) |
| Filter baris | `ADVERTISEMENT`, `SCROLL TO CONTINUE…`, "Baca juga/berita…", "Lihat/Simak juga", ajakan follow/unduh, `Pewarta:/Editor:/Reporter:…`, `Copyright/©`, larangan mengambil konten, `Halaman : N`, `[Gambas:…]`, inisial atau kredit redaksi dalam kurung, kalimat "… menyajikan informasi terbaru", dan baris tanda baca / huruf tunggal |

### Perubahan aturan referensi

Agar referensi tidak menghitung teks yang jelas bukan berita, aturan `NOISE_LINE` referensi ditambah: larangan mengambil konten (antaranews), placeholder `[Gambas:…]`, dan inisial/kredit redaksi dalam kurung. Referensi juga memakai URL akhir setelah redirect untuk mengenali halaman lanjutan (URL okezone di RSS memakai tanggal yang berbeda dengan URL halaman). Ekstraktor lama diukur ulang dengan aturan referensi baru ini, supaya perbandingan setara.

### Hasil

| Sumber | Recall sebelum → sesudah | Presisi sebelum → sesudah | Paragraf sampah sebelum → sesudah |
|---|---|---|---|
| antaranews | 100% → 100% | 87% → **100%** | 7 → 0 |
| cnnindonesia | 100% → 100% | 98% → **100%** | 6 → 0 |
| detik | 100% → 100% | 97% → **100%** | 3 → 0 |
| liputan6 | 100% → 100% | 93% → **100%** | 3 → 0 |
| sindonews | 95% → **100%** | 76% → **99%** | 79 → 0 |
| cnbcindonesia | 100% → 100% | 100% → 100% | 0 → 0 |
| okezone | **0% → 98%** | - → **100%** | 0 → 0 |
| viva | **0% → 100%** | - → **100%** | 0 → 0 |

Gambar di dalam isi viva: 12/27 → 24/27. Judul, tanggal, dan penulis tetap 100% cocok. Satu paragraf okezone yang tercatat hilang adalah kalimat promosi "Sports Okezone menyajikan informasi terbaru…", yang sengaja dibuang ekstraktor tetapi masih dihitung referensi.

Pemeriksaan silang 3 driver (sindonews dan viva, 6 artikel): agent-browser, CDP Bun, dan Playwright sama-sama recall 100% dan presisi 100%.

**Belum diuji:** kompas (belum ada izin), jadi pengaruh perubahan ini pada `.read__content` dan pagination Kompas belum terukur. Situs di luar 8 sumber ini belum diukur; heuristik skor dirancang untuk itu, tetapi belum dibuktikan.

## Batasan

- **Referensi adalah HTML awal dari server.** Isi yang hanya disisipkan JavaScript tidak ada di referensi; pada situs yang diuji, isi berita sudah ada di HTML awal (diperiksa per situs sebelum benchmark).
- **Selector referensi dipilih manual oleh satu orang** dan bisa keliru menganggap sesuatu sebagai isi atau bukan. Aturan pengecualian ada di tabel Metode.
- Penilaian penulis dan tanggal hanya untuk situs yang menampilkan elemennya: 4 situs untuk penulis, 6 untuk tanggal.
- 3 artikel per sumber, satu kali pengukuran.
