---
name: comment-style
description: >
  Kontrak komentar kode untuk project ini (JavaScript/Bun): komentar dalam Bahasa Indonesia,
  menyatakan maksud dalam bentuk kini, panjang dibatasi, tanpa sejarah, retorika, HURUF KAPITAL,
  atau pengulangan kode; jalur kritis menyimpan argumen kebenaran yang dipadatkan. Muat saat
  menulis atau me-review komentar apa pun. Pemicu: "komentar", "JSDoc", "komentarnya kepanjangan",
  "rapikan komentar", "review komentar". BUKAN untuk teks yang dibaca pengguna (log, README, pesan error).
---

# Komentar Kode

## Prinsip utama

**Komentar menyatakan maksud kode: singkat, padat, dalam bentuk kini, berbahasa Indonesia.**

Pembacanya adalah engineer yang sedang membaca kode ini sekarang, misalnya saat melacak kenapa sebuah artikel terkirim dua kali atau isinya terpotong. Yang dibutuhkan: klaim yang dibuat kode dan alasan klaim itu harus berlaku. Yang tidak dibutuhkan: sejarah bagaimana kode jadi begini, argumen yang meyakinkan bahwa desainnya benar, atau pengulangan sintaks yang sudah terlihat.

**Utamakan komentar yang lebih sedikit dan lebih pendek.** Kode menjelaskan *apa* yang terjadi; komentar menjelaskan *kenapa harus begitu*. Jika alasannya tidak muat dalam dua baris, biasanya yang perlu diperbaiki adalah nama atau ukuran fungsinya, bukan komentarnya.

### Bahasa

- Komentar ditulis dalam **Bahasa Indonesia** yang baku dan ringkas.
- Identifier (nama variabel, fungsi, kelas, file) tetap **bahasa Inggris**.
- Istilah teknis yang lazim tidak diterjemahkan: `retry`, `payload`, `webhook`, `selector`, `session`, `daemon`, `fallback`, `idempotency`, `lazy-load`.
- Kutip identifier dan nilai dengan backtick: `` `waitFor` ``, `` `?page=all` ``.

---

## §1 Empat larangan

Ini cacat, bukan selera. Reviewer memblokir perubahan yang melanggarnya.

### 1.1 Tanpa sejarah: kode tidak punya bentuk lampau

Kode yang ada sekarang **adalah** desainnya. Komentar tidak boleh memuat: `dulu`, `sebelumnya`, `tidak lagi`, `sudah dihapus`, `diganti dari`, `versi lama`, `sejak refactor`, `awalnya`, `sekarang sudah`.

Sejarah tempatnya di git dan `docs/adr/`. Komentar yang menceritakan refactor langsung basi begitu refactor berikutnya datang, dan terbaca seperti peringatan tentang kode yang sudah tidak ada.

```js
// ✗ arkeologi: menceritakan kode yang sudah dihapus
// Dulu memakai execFile dan npm root -g, sekarang diganti Bun.spawn karena pindah ke Bun.

// ✓ menyatakan aturan yang berlaku sekarang
// Di Windows npm hanya memasang shim .cmd/.ps1, jadi panggil binary native di dalam paket npm-nya.
```

### 1.2 Tanpa retorika: nyatakan, jangan membujuk

Komentar mencatat keputusan. Komentar tidak berdebat, tidak mendramatisasi akibat kesalahan, dan tidak menyapa pembaca.

Buang: pertanyaan retoris, slogan, `percayalah`, `ini penting sekali`, `bayangkan jika`, `itulah kenapa`, `persis masalah yang`, `jangan sampai lupa`.

Pertahankan **klaim** yang dibungkus retorika itu; biasanya cukup satu anak kalimat.

```js
// ✗ membujuk
// Ini sangat penting! Bayangkan kalau kita pakai networkidle: scraper akan menunggu
// selamanya karena iklan tidak pernah berhenti, dan seluruh siklus jadi lambat sekali.

// ✓ menyatakan, alasan operasionalnya tetap ada
// Jangan pakai `wait --load networkidle`: iklan membuat situs berita jarang "idle".
```

### 1.3 Tanpa penekanan HURUF KAPITAL

Penekanan datang dari pilihan kata dan susunan kalimat. Huruf kapital hanya untuk token yang memang kapital: akronim (`URL`, `HTTP`, `JSON`, `RSS`, `ADR`, `DOM`), keyword yang dikutip (`POST`, `PATCH`), dan konstanta (`DISCOVERY_TYPES`, `EXTRACTOR_SCRIPT`).

`JANGAN`, `WAJIB`, `SELALU`, `HARUS`, `PENTING`, `HANYA`, `NEVER`, `MUST` adalah teriakan. Tulis dengan huruf kecil; jika perlu tegas, letakkan di induk kalimat.

### 1.4 Tanpa mengulang kode

Jika komentar dan baris di bawahnya mengatakan hal yang sama, hapus komentarnya.

```js
// ✗
// tambah jumlah yang gagal
stats.failed++;

// ✗ nama dan signature sudah mengatakannya
// has mengecek apakah url sudah ada.
async has(url) { ... }

// ✓ mengatakan apa yang tidak bisa dikatakan signature
// readOnly dipakai saat --dry-run: baca catatan, jangan menulis
```

---

## §2 Panjang

| Komentar | Batas | Kapan boleh lebih |
|---|---|---|
| Inline (di dalam badan fungsi) | **1 baris**, maksimal 2 | tidak pernah; ekstrak fungsi bernama |
| Doc comment fungsi/kelas/field | **1–2 baris** | argumen kebenaran jalur kritis (§3) → sampai 5 |
| Header file/modul | **1–3 baris**: apa isi file ini dan satu batasan yang mengaturnya | file yang inti tugasnya protokol/alur (mis. `ports.js`) → sampai 8 |
| Test | **1 baris** menamai skenario, atau tanpa komentar (nama `it(...)` sudah cukup) | tidak pernah |

**Blok lebih dari 6 baris harus membuktikan setiap barisnya.** Sebelum menulisnya, periksa: apakah ini argumen kebenaran yang tidak bisa disimpulkan dari kode (pertahankan, padatkan), atau konteks yang tempatnya di `README.md` / `docs/adr/` (pindahkan, kutip dalam satu anak kalimat)?

---

## §3 Yang dipertahankan di jalur kritis

Jatah komentar tidak merata. Di jalur yang jika diubah diam-diam akan merusak data atau mengirim ganda, argumen kebenaran yang **dipadatkan** wajib ada. Jalur kritis project ini:

- **Idempotensi:** bagaimana `articleId` diturunkan dan kenapa stabil antar-retry dan antar-siklus.
- **Klasifikasi kegagalan:** kenapa 4xx tertentu tidak diulang sedangkan 408/429/5xx diulang; kenapa artikel tidak lengkap dihitung gagal dan tidak dicatat terkirim.
- **Urutan:** kenapa `markSent` dipanggil setelah `publish` berhasil, bukan sebelumnya.
- **Penulisan state yang aman:** kenapa tulis ke file sementara lalu `mv`.
- **Kondisi berhenti pagination:** kenapa berhenti saat isi halaman kosong atau sama, dan kenapa versi "tampilkan semua" diutamakan.
- **Workaround per situs yang tidak jelas:** perilaku agent-browser atau situs tertentu yang memaksa kode ditulis begitu (`open` Kompas yang error padahal halaman terbuka, larangan `networkidle`, pola URL yang diawali `^https://`).

Pertahankan **klaim dan alasannya**, bukan uraiannya. Satu sampai lima baris.

```js
// ✓ bentuk yang dituju: alasan jalur kritis, dipadatkan
// 4xx (kecuali 408/429) adalah kesalahan data/konfigurasi; mengulang tidak akan membantu.

// ✓
// Pada situs berat (mis. kompas.com) `open` kadang gagal mengembalikan respons
// walaupun halaman sudah terbuka. Anggap berhasil jika browser sudah di URL tujuan.
```

Selain itu (pembaca config sederhana, mapper payload, logger, fake di test) cukup doc comment satu baris atau tanpa komentar.

---

## §4 Rujukan

Rujuk **`(ADR-000N)`** atau nama dokumen (`README: Kontrak untuk sistem penerima`), dan hanya jika keputusannya tidak terlihat dari kode.

Hapus rujukan proses internal: nomor tiket, nama sesi/percakapan, `hasil diskusi`, `sesuai permintaan`, `lihat chat`. Pembaca tidak bisa menindaklanjutinya tanpa membuka sumber lain yang mungkin tidak ada.

```js
// ✗  Ditambahkan sesuai permintaan di sesi tanggal 1 November.
// ✓  Format JSON untuk penerima (README: Kontrak untuk sistem penerima).
```

---

## §5 Bentuk untuk JavaScript (Bun)

- `//` untuk komentar inline dan header file.
- JSDoc `/** */` untuk **port** (`application/ports.js`), konstruktor yang menerima dependency, dan fungsi yang diekspor lintas lapisan. Karena project ini JavaScript tanpa TypeScript, `@param` dengan **tipe** boleh dan berguna; `@param` yang hanya mengulang nama tanpa informasi tipe atau makna dihapus.
- Deskripsi `@param` diisi hanya jika maknanya tidak jelas dari nama: `@param {string} config.url  ` + "`{id}` diganti dengan ID artikel".
- Kalimat lengkap boleh tanpa titik untuk komentar inline pendek; doc comment ditulis sebagai kalimat lengkap.
- Pemisah bagian (`// --- Pagination artikel ---`) boleh dan dipertahankan, terutama di `extract-article.js`.
- `extract-article.js` berjalan di Chrome: komentarnya menjelaskan asumsi tentang struktur halaman berita, bukan API Bun.
- Test: nama `it('...')` adalah deskripsinya. Komentar di dalam test hanya untuk data uji yang tidak jelas maksudnya.

---

## §6 Penanda

- `TODO(scope)` wajib menyertakan scope: `TODO(kompas)`, `TODO(pagination)`, `TODO(deploy)`.
- `TODO` tanpa scope adalah cacat; beri scope atau kerjakan.
- Awalan `CATATAN:` / `NOTE:` tidak menambah apa-apa; hapus awalannya, pertahankan kalimatnya.
- Tanpa kode yang di-comment-out. Hapus; git menyimpannya.

---

## §7 Gerbang sebelum merge

Perubahan gagal review jika, di kode yang disentuhnya:

1. Ada komentar berbentuk sejarah (`dulu`, `sebelumnya`, `tidak lagi`, `sudah dihapus`, `diganti dari`, `versi lama`).
2. Ada komentar yang meneriakkan kata dengan HURUF KAPITAL untuk penekanan.
3. Komentar inline lebih dari 2 baris, atau doc comment lebih dari 5 baris tanpa argumen jalur kritis (§3).
4. Komentar mengulang baris atau signature tempatnya berada.
5. Rujukan menyebut tiket, sesi, atau proses alih-alih ADR/dokumen.
6. Ada `TODO` tanpa scope, atau kode yang di-comment-out ditambahkan.
7. Komentar menggambarkan perilaku yang tidak lagi dimiliki kode.
8. Komentar ditulis dalam bahasa Inggris (kecuali istilah teknis dan identifier).

Pencarian yang menangkap sebagian besar (jalankan dari `scraper/`, atau pakai tool Grep dengan pola yang sama):

```bash
# narasi sejarah
rg -n '//.*\b(dulu|sebelumnya|tidak lagi|sudah dihapus|diganti dari|versi lama|awalnya)\b' src tools test
# penekanan huruf kapital (tinjau hasilnya; akronim dan konstanta adalah positif palsu)
rg -n '//.*\b(JANGAN|WAJIB|SELALU|HARUS|PENTING|HANYA|NEVER|MUST|ALWAYS)\b' src tools test
# rujukan proses
rg -n '//.*(sesuai permintaan|hasil diskusi|lihat chat|tiket)' src tools test
# TODO tanpa scope
rg -nP '//\s*(TODO|FIXME|XXX)\b(?!\()' src tools test
```

---

## §8 Contoh penulisan ulang

**Header file: uraian → 2 baris.**

```js
// ✗ sebelum
// File ini berisi class yang bertugas untuk menyimpan data URL-URL artikel yang
// sudah berhasil dikirim ke webhook. Data disimpan dalam bentuk file JSON di disk.
// Class ini dibuat supaya kita tidak mengirim artikel yang sama berkali-kali ke
// sistem penerima, karena itu akan menyebabkan data duplikat di sana. Kami memilih
// file JSON karena sederhana dan tidak butuh database.

// ✓ sesudah
// Implementasi port SentStore: mencatat URL yang sudah terkirim di file JSON.
```

**Inline jalur kritis: 4 baris → 1, alasannya tetap.**

```js
// ✗ sebelum
// Di sini kita menulis ke file .tmp dulu, kemudian memindahkannya ke file aslinya.
// Kenapa? Karena kalau proses tiba-tiba mati saat menulis, file aslinya bisa rusak
// dan SEMUA catatan hilang! Dengan cara ini file asli SELALU utuh.
// (Ini teknik umum yang disebut atomic write.)

// ✓ sesudah
// Tulis ke file sementara lalu pindahkan, supaya file tidak rusak jika proses mati di tengah jalan.
```

**Doc comment: mengulang signature → menyatakan yang tidak terlihat.**

```js
// ✗ sebelum
// normalizeURL menormalkan URL dan mengembalikan URL yang sudah dinormalkan.

// ✓ sesudah
// Buang parameter tracking dan fragment agar artikel yang sama tidak diproses dua kali.
// Mengembalikan null untuk URL yang tidak valid.
```

---

## §9 Batas tanggung jawab

- **Teks yang dibaca pengguna/operator** (pesan log, pesan error, `README.md`, `.env.example`, dokumen ADR) tidak diatur skill ini. Skill ini hanya mengatur prosa yang dibaca programmer di dalam kode.
- **Penjelasan panjang** (alur, perbandingan opsi, alasan arsitektur) tempatnya di `README.md` atau `docs/adr/`, ditulis mengikuti skill `tech-writer`. Saat komentar ingin menjadi tur, tulis di sana lalu rujuk dalam satu anak kalimat.
- **Kontrak payload** didefinisikan di README bagian "Kontrak untuk sistem penerima"; komentar di `payload.js` merujuknya, tidak menyalinnya.
