---
name: add-news-source
description: Menambahkan situs berita baru ke scraper (scraper/config.json). Gunakan saat user ingin menambah, mencoba, atau mengecek apakah sebuah situs berita bisa di-scrape, misalnya "tambah detik.com", "coba scrape tempo", "bisa ambil berita dari situs X?".
---

# Menambah Situs Berita Baru

Tujuan: menghasilkan satu entri `sources[]` di `scraper/config.json` yang sudah diuji, plus laporan singkat ke user.

Jalankan perintah dari folder `scraper/`. Selalu pakai session agent-browser khusus (mis. `--session riset`) dan tutup di akhir.

## 1. Cek izin dulu (berhenti jika dilarang)

- Ambil `https://<situs>/robots.txt`. Jika path artikel di-`Disallow` untuk `User-agent: *`, **berhenti** dan laporkan ke user.
- Jika halaman menampilkan "Akses ditolak" / captcha / blokir bot, **berhenti**. Jangan mencoba menembusnya.
- Catat jika ada larangan eksplisit di ToS atau footer artikel (contoh: antaranews melarang pengindeksan AI tanpa izin tertulis).

## 2. Cari sumber daftar URL (urutan prioritas)

1. **RSS**: coba `/rss`, `/feed`, `/rss/terkini.xml`, atau cari `<link rel="alternate" type="application/rss+xml">` di beranda. Jika ada → `"discovery": { "type": "rss", "url": ... }`.
2. **Halaman indeks**: halaman "terkini" / "indeks" → `"type": "index"`.

Tentukan `pattern` (regex URL artikel). **Awali dengan `^https://`** supaya link iklan yang memuat URL artikel di parameter query tidak ikut.

## 3. Uji ekstraksi pada 1–2 artikel

```powershell
agent-browser --session riset open <url-artikel>
$b = [Convert]::ToBase64String([IO.File]::ReadAllBytes("$PWD\src\infrastructure\browser\scripts\extract-article.js"))
agent-browser --session riset eval -b $b
```

Jangan pakai `eval --stdin` (di PowerShell selalu `null`) dan jangan pakai `wait --load networkidle`.

Periksa: `title`, `published_at`, `authors`, `content_text` (bandingkan dengan halaman aslinya), `word_count`, `main_image`, `images`, dan `pagination` (`all` / `pages`).

- Isi kosong atau pendek → mungkin dirender JavaScript: cari selector isi lalu set `waitFor`.
- Ada `pagination.pages` → pastikan versi "all" atau halaman lanjutan memberi isi lengkap.
- Jika selector isi tidak dikenali ekstraktor, tambahkan ke `bodySelectors` di `extract-article.js` (tetap generik, jangan merusak situs lain).

## 4. Tambahkan ke config dan uji end-to-end

Tambah entri ke `scraper/config.json`:
```json
{
  "name": "<nama>",
  "discovery": { "type": "rss|index", "url": "..." },
  "pattern": "^https://...",
  "waitFor": "<selector, opsional>",
  "minWords": 50,
  "maxArticles": 10,
  "preferAllPage": true,
  "maxPages": 10
}
```

Uji dengan config salinan di scratchpad (`maxArticles: 2`, `statePath` di scratchpad, hanya sumber baru):
```powershell
bun src/main.js --once --dry-run --config <scratchpad>\test-config.json
```
Lalu jalankan `bun test` (harus tetap lolos) dan uji ulang satu sumber lama untuk memastikan tidak ada regresi.

## 5. Laporkan ke user

- Status izin (robots.txt / ToS / catatan hukum).
- Cara discovery, jumlah URL ditemukan.
- Tabel hasil uji per artikel: judul, kata, halaman, mode pagination, jumlah gambar.
- Masalah kualitas data yang terlihat (promo, "Baca juga", gambar tidak terkait, penulis salah).
- Tutup session: `agent-browser --session riset close`.
