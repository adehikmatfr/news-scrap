# News Scraper (agent-browser → webhook)

Scraper berita: ambil URL, metadata, isi penuh, dan URL gambar lewat **agent-browser** (CLI otomasi Chrome dari Vercel Labs), lalu kirim per artikel ke sistem luar via HTTP POST/PATCH/PUT. Sistem penerima dianggap kotak hitam; kontraknya ada di `scraper/README.md`.

Bahasa komunikasi dan komentar kode: **Bahasa Indonesia**. Gaya komentar mengikuti skill `comment-style`; penulisan dokumen (README, ADR, runbook, `.env.example`) mengikuti skill `tech-writer`.

## Isi repo

| Path | Isi |
|---|---|
| `scraper/` | **Kode utama** (runtime **Bun** ≥ 1.2, ESM, tanpa dependency). Baca `scraper/README.md` |
| `docs/reserch/research.md` | Riset perbandingan tools scraping berita |
| `docs/adr/0001-penggunaan-agent-browser-di-server.md` | ADR: agent-browser di server (status: Proposed) |
| `README.md` | Halaman depan repo untuk GitHub; rincian tetap di `scraper/README.md` |

## Perintah (jalankan dari `scraper/`)

```bash
bun test            # unit test bun:test, tanpa browser/jaringan (wajib lolos setelah mengubah kode)
bun run dry-run     # 1 siklus, tampilkan payload, tidak mengirim & tidak mencatat state
bun run mock        # penerima webhook tiruan (Bun.serve) di :8080 → data/received.jsonl
bun run once        # 1 siklus sungguhan ke webhook di config.json
```

Untuk uji cepat, salin `config.json` ke scratchpad, set `maxArticles` kecil dan `statePath` ke scratchpad, lalu `bun src/main.js --once --config <path>`. Jangan mengotori `data/sent.json` milik user.

Runtime: **semua kode wajib memakai Bun.** Jangan menambah import `node:*` atau dependency npm; pakai padanan Bun (`Bun.file`/`Bun.write`, `Bun.spawn`, `Bun.CryptoHasher`, `Bun.fileURLToPath`, Bun Shell `$`, `Bun.sleep`, `Bun.serve`, `bun:test`). Pengecualian: `extract-article.js` berjalan di Chrome, jadi memakai API DOM.

## Arsitektur (clean architecture), wajib dijaga

- `src/domain/`: aturan murni (ID artikel, validasi, gabung halaman, sumber, URL). **Tidak boleh** import dari lapisan lain atau melakukan I/O.
- `src/application/`: usecase `ScrapeSources` dan `ScrapeArticle`, serta `ports.js` (kontrak JSDoc). Hanya mengenal domain dan port.
- `src/infrastructure/`: adapter (agent-browser CLI, RSS, webhook, file state, config, logger).
- `src/main.js`: composition root, satu-satunya tempat merakit.
- Fitur baru = adapter baru yang memenuhi port + satu baris wiring di `main.js`. Usecase baru diuji dengan fakes di `test/application/fakes.js`.
- `src/infrastructure/browser/scripts/extract-article.js` dijalankan **di dalam halaman** (browser), bukan di Node; dibaca sebagai teks dan dikirim lewat `eval -b`.

## Hal yang sudah dipelajari (jangan diulang)

- **`agent-browser eval --stdin` dari PowerShell selalu `null`.** Selalu pakai `eval -b <base64>`. Output `eval` adalah nilai JSON (string hasil `JSON.stringify` perlu di-parse dua kali).
- **Jangan pakai `wait --load networkidle`** di situs berita: iklan membuat halaman tidak pernah idle, dan daemon tetap menunggu ±25 dtk walau proses CLI dibunuh. Pakai `waitFor` (selector) per sumber.
- **kompas.com:** `open` kadang mengembalikan error "EOF while parsing" padahal halaman sudah terbuka; adapter mengecek ulang dengan `get url`. Halaman indeksnya berisi link iklan doubleclick yang memuat URL kompas, jadi `pattern` harus diawali `^https://`.
- **Pagination:** agent-browser tidak mendeteksi sendiri. Kompas memecah artikel (`?page=N`, `?page=all`); ditangani `ScrapeArticle` (utamakan versi "all", fallback ikuti halaman).
- **Windows:** npm hanya memasang shim `.cmd/.ps1`; adapter mencari shim dengan `Bun.which` lalu memanggil binary native `<folder shim>/node_modules/agent-browser/bin/agent-browser-win32-x64.exe` lewat `Bun.spawn`. Di Linux cukup `agent-browser`. Bisa dipaksa dengan env `AGENT_BROWSER_BIN`.
- **tribunnews.com memblokir** browser otomatis ("Akses ditolak"). Jangan dipaksa / jangan coba menembus.
- agent-browser **tidak memakai token AI**; seluruh scraper deterministik.

## Etika & hukum

- Patuhi `robots.txt` dan ToS tiap situs; jangan menembus paywall atau proteksi bot.
- Footer artikel antaranews melarang "pengindeksan otomatis untuk AI ... tanpa izin tertulis". Ingatkan user soal izin sebelum dipakai di produksi.
- Isi berita berhak cipta: untuk analisis internal, bukan untuk dipublikasikan ulang.

## Masalah kualitas data yang diketahui (belum dikerjakan)

Sisa label "Baca juga:", paragraf promosi (Kompas), gambar tidak terkait dari blok rekomendasi, `authors` berisi nama penerbit di Kompas, `section` kosong. Rencana: filter umum + `removeSelectors` per sumber.
