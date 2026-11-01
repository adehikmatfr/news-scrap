# ADR-0004: Ekstraksi Artikel dengan Hermes Agent (LLM + agent-browser)

- **Status:** Ditolak (Rejected), 2026-11-02
- **Tanggal:** 2026-11-02
- **Lingkup:** cara isi artikel dibaca (`PageReader`), `scraper/` dan instalasi Hermes Agent di server
- **Terkait:** [ADR-0001](0001-penggunaan-agent-browser-di-server.md) (scraper deterministik tanpa token AI), [ADR-0003](0003-driver-browser-agent-browser-playwright-atau-cdp.md) (driver browser), [benchmark akurasi](../reserch/benchmark-akurasi-ekstraksi-2026-11-02.md)

---

## Alasan penolakan

Hermes Agent **tidak dipakai di scraper**, baik sebagai jalur utama, fallback, maupun alat belajar selector. Data uji coba di bawah dipertahankan sebagai catatan.

1. **Tidak ada tambahan akurasi.** Ekstraktor deterministik sudah mencapai recall 100% dan precision 99,9% pada 8 sumber (72 pengukuran). Hermes mencapai 100%/100% pada artikel yang berhasil dibukanya; hasilnya sama, tidak lebih baik.
2. **Peran yang tersisa sudah tertangani tanpa AI.** Selector situs ditentukan sekali saat setup (skill `add-news-source`) dan diverifikasi dengan `bun run bench:accuracy`. Struktur yang belum dikenal ditangani skor kepadatan paragraf di ekstraktor. Perubahan tampilan situs lebih murah dideteksi (isi kosong, `minWords` tidak tercapai) lalu diperbaiki manual.
3. **Biaya dan waktu tanpa imbalan.** 40–55 dtk dan $0,04–0,05 per artikel (±$45–50 per 1.000 artikel, perkiraan dari 4 artikel), dibanding 0,2–2,6 dtk dan $0 pada scraper. Varian hemat token (fallback saja, memilih nomor paragraf) tetap menambah jalur ekstraksi kedua yang jarang terpakai dan harus dirawat.
4. **Risiko keamanan.** Backend yang berhasil di semua situs uji (Browser Use) hanya tersedia jika agent diberi toolset `terminal`, artinya akses shell sambil membaca halaman berita yang tak tepercaya (prompt injection). Backend agent-browser yang tanpa shell memakai agent-browser 0.26.0 yang di-pin Hermes dan menggantung di situs penuh iklan (detik).
5. **Hasil tidak deterministik.** LLM bisa memparafrase atau mengarang teks; setiap hasil butuh verifikasi tambahan terhadap teks halaman sebelum boleh dikirim.
6. **Izin penerbit.** Memproses isi berita dengan AI dan mengirimnya ke penyedia model pihak ketiga dilarang antaranews tanpa izin tertulis, dan bertentangan dengan sinyal `ai-train=no` di sebagian situs.

Keputusan ADR-0001 tetap berlaku: seluruh scraper deterministik, tanpa token AI.

---

## 1. Konteks

Scraper saat ini membaca isi artikel dengan ekstraktor deterministik (`extract-article.js`): selector umum, skor kepadatan paragraf, dan filter baris bukan berita. Usulan yang dikaji: membiarkan **AI agent** membuka halaman lewat agent-browser lalu menyalin isi beritanya sesuai prompt (buang paragraf akhir, promosi, iklan, tunggu halaman termuat penuh). Harapannya, pembacaan isi menjadi lebih andal untuk situs yang strukturnya tidak dikenal.

Agent yang dikaji adalah **Hermes Agent** (Nous Research), yang sudah terpasang di mesin pengembangan.

### Fakta yang sudah diverifikasi

Diuji 2 November 2026 di Windows 11 (laptop pengembangan), Hermes Agent v0.22.5 (2026.9.24), model `claude-sonnet-5-5` lewat provider `anthropic`.

| Hal | Hasil |
|---|---|
| Lokasi instalasi | `C:\Users\Legion\AppData\Local\hermes` (`HERMES_HOME`), CLI `hermes`, metode instalasi git, Python 3.14.9 |
| Tool browser | `tools/browser_tool.py` Hermes membungkus CLI agent-browser: `browser_navigate` (= `open` + snapshot), `browser_snapshot`, `browser_console`, `browser_get_images`, dan lainnya |
| Versi agent-browser | Hermes memakai **agent-browser 0.26.0 miliknya sendiri** (`hermes/tools/agent-browser-0.26.0-win32-x64`), dipilih lewat package manager Hermes sebelum PATH. Scraper memakai 0.41.1 |
| Backend browser bawaan | Jika `browser.backend` kosong dan Browser Use CLI tersedia, Hermes mengganti semua tool agent-browser dengan satu tool `browser_exec` (Browser Use, Python), yang hanya muncul jika toolset `terminal` aktif. Untuk memakai agent-browser, `browser.backend` harus `off` |
| Pemuatan tool | Tool dimuat tertunda (`tool_search` → `tool_describe` → `tool_call`); setiap artikel butuh beberapa panggilan API |
| Mode sekali jalan | `hermes -z PROMPT` mencetak hanya jawaban akhir ke stdout; `--usage-file PATH` menulis JSON token, jumlah panggilan API, dan perkiraan biaya |
| Isolasi | `hermes profile create` membuat instance terpisah; `-p <profile>` memilihnya per perintah. `--ignore-rules` mematikan injeksi memory, `SOUL.md`, dan `AGENTS.md` |

### Hasil uji coba (1 artikel per situs, dinilai dengan `tools/compare-with-source.js`)

| Situs | Backend browser Hermes | Hasil Hermes | Waktu | Token | Perkiraan biaya |
|---|---|---|---|---|---|
| liputan6 | agent-browser 0.26.0 (`browser.backend: off`, `-t browser`) | Recall 100%, precision 100%; judul, tanggal, penulis cocok | 40 dtk | 40.402 (3 panggilan API) | $0,051 |
| detik | agent-browser 0.26.0 | **Gagal:** "browser timeout saat memuat URL (dua kali percobaan)" | 105 dtk | 31.019 (4 panggilan) | $0,026 |
| liputan6 | Browser Use, bawaan Hermes (`browser_exec`, `-t browser,terminal`) | Recall 100%, precision 100%; judul, tanggal, penulis cocok | 54 dtk | 30.179 (3 panggilan) | $0,043 |
| detik | Browser Use | Recall 100%, precision 100%; judul, tanggal, penulis cocok | 55 dtk | 19.266 (2 panggilan) | $0,048 |

Pembanding, scraper deterministik (CDP Bun) pada artikel yang sama: recall 100%, precision 100%, 0,2 dtk (liputan6) dan ±1–2,6 dtk (detik), tanpa biaya token.

Backend Browser Use mengendalikan Chrome lewat CDP dari kode Python yang ditulis model (`browser_exec`), jadi tidak terkena masalah `open` agent-browser 0.26.0. Tool ini hanya tersedia jika toolset `terminal` ikut aktif, sehingga agent juga mendapat akses shell.

Penyebab kegagalan detik diperiksa langsung: `agent-browser 0.26.0 open` pada URL yang sama tidak selesai dalam 120 dtk dan harus dihentikan. agent-browser 0.41.1 (milik scraper) membuka URL yang sama dalam ±25 dtk karena menunggu event `load` (benchmark driver). Uji coba pertama tanpa `browser.backend: off` juga gagal karena tool navigasi tidak tersedia.

Sampelnya hanya 2 artikel per backend; angka di atas bukan benchmark.

---

## 2. Masalah

Apakah membaca isi artikel lewat Hermes Agent (LLM + agent-browser) membuat hasil lebih andal daripada ekstraktor deterministik, sebanding dengan biaya, kecepatan, risiko, dan izin penerbitnya? Jika ya, di mana posisinya dalam arsitektur?

---

## 3. Opsi yang dipertimbangkan

| Opsi | Kelebihan | Kekurangan |
|---|---|---|
| **A. Tetap deterministik** (kondisi sekarang) | Recall 100% dan precision 99,9% pada 8 sumber; 0,2–2,6 dtk per artikel; tanpa biaya token; hasil bisa diulang | Situs dengan struktur sangat berbeda tetap bisa gagal sampai ekstraktor diperbaiki |
| **B. Hermes untuk semua artikel** | Prompt bisa menyesuaikan aturan tanpa mengubah kode; bisa menangani tata letak yang tidak dikenal | ±40 dtk dan ±$0,05 per artikel; hasil tidak deterministik; risiko parafrase/halusinasi dan prompt injection dari isi halaman; agent-browser 0.26.0 bawaan menggantung di situs penuh iklan; melanggar larangan AI sebagian penerbit |
| **C. Hermes sebagai fallback** saat ekstraktor gagal (`IncompleteArticleError`) | Biaya hanya untuk kasus gagal; jalur utama tetap cepat dan deterministik | Tetap mengirim isi berita ke penyedia LLM untuk artikel tersebut; perlu verifikasi hasil; dua jalur ekstraksi |
| **D. Hermes untuk evaluasi saja** (di luar jalur produksi) | Membantu membuat referensi atau memeriksa situs baru saat menambah sumber; tidak ada biaya rutin | Tidak menambah keandalan saat produksi berjalan |

---

## 4. Keputusan

**Ditolak; tetap opsi A.** Bagian di bawah adalah rancangan yang dikaji sebelum penolakan (opsi A + D, C ditunda), disimpan sebagai catatan. Alasan akhir ada di bagian "Alasan penolakan".

**Alasan:**

- **Akurasi sudah setara.** Pada sumber yang sama, ekstraktor deterministik sudah mencapai recall 100% dan precision 99,9% (benchmark akurasi). Hermes menghasilkan 100%/100% pada artikel yang berhasil dibuka, jadi belum ada bukti keunggulan akurasi.
- **Keandalan bergantung pada backend.** Dengan agent-browser 0.26.0 yang di-pin Hermes, detik gagal dibuka. Dengan Browser Use bawaan Hermes, keduanya berhasil, tetapi agent harus diberi toolset `terminal` (akses shell) sambil membaca halaman tak tepercaya.
- **Biaya dan waktu.** 40–55 dtk per artikel, ±200× lebih lambat daripada scraper di liputan6, dan $0,04–0,05 per artikel (perkiraan dari 4 artikel; sekitar $45–50 per 1.000 artikel).
- **Izin penerbit.** Footer antaranews melarang "pengindeksan otomatis untuk AI" tanpa izin tertulis, dan robots.txt tempo memasang `ai-train=no`. Mengirim isi berita ke model AI termasuk pemrosesan oleh AI, jadi butuh izin eksplisit per penerbit.

### 4.1 Instalasi untuk riset (opsi D), terverifikasi di mesin pengembangan

Hermes sudah terpasang. Langkah yang dijalankan untuk memakainya dengan agent-browser tanpa menyentuh profile `default` (yang melayani gateway Telegram):

```powershell
hermes doctor                          # cek: agent-browser, Playwright Chromium, toolset browser tersedia
hermes profile create newscraper --clone --no-alias `
  --description "Ekstraksi artikel berita untuk project news-scrap (agent-browser)"
hermes -p newscraper config set browser.backend off   # pakai tool agent-browser, bukan Browser Use
hermes -p newscraper config get browser.backend        # off
```

`--clone` menyalin `config.yaml`, `.env` (kredensial provider), `SOUL.md`, dan skill dari profile aktif, tetapi tidak menyalin token bot messaging. Profile bisa dihapus dengan `hermes profile delete newscraper`.

Pemanggilan per artikel (dipakai skrip uji coba, di luar repo):

```bash
hermes -p newscraper -z "<prompt>" -t browser --ignore-rules --usage-file usage.json
```

Prompt meminta: buka URL, tunggu termuat penuh, kembalikan hanya JSON dengan field payload scraper (`title`, `authors`, `published_at`, `content_text`, …), salin isi kata per kata tanpa meringkas, buang iklan/"Baca juga"/promosi/footer/keterangan foto, ikuti halaman lanjutan, dan kembalikan `{"error": ...}` jika halaman diblokir.

Instalasi di server Linux **belum diuji** dan tidak didokumentasikan di sini. Jika dibutuhkan, ikuti dokumentasi resmi Hermes, lalu ulangi langkah profile di atas.

### 4.2 Pemakaian yang tidak diizinkan

- Tidak dipakai untuk sumber yang penerbitnya melarang pemrosesan AI (antaranews tanpa izin tertulis, kompas tanpa izin scraping).
- Tidak memakai fitur stealth, proxy residensial, atau penyedia browser cloud Hermes untuk menembus blokir (tempo, republika, tribunnews).
- Toolset dibatasi `-t browser`; agent tidak boleh mendapat `terminal`, `file`, atau `code_execution`, karena isi halaman berita adalah input tak tepercaya yang bisa berisi instruksi (prompt injection). Akibatnya backend Browser Use (yang butuh `terminal`) hanya boleh dipakai untuk uji manual di mesin pengembangan, tidak di server.

### 4.3 Syarat sebelum opsi C (fallback) dipertimbangkan

1. Izin tertulis dari penerbit yang artikelnya akan diproses AI.
2. agent-browser di Hermes bisa membuka situs penuh iklan (versi lebih baru dari 0.26.0, atau batas tunggu yang bisa diatur), terbukti dengan uji ulang di detik dan cnnindonesia.
3. **Verifikasi kesetiaan otomatis:** setiap paragraf `content_text` dari LLM harus ditemukan kata per kata di teks halaman (DOM). Hasil yang gagal verifikasi ditolak, sehingga parafrase atau halusinasi tidak pernah terkirim.
4. Diimplementasikan sebagai adapter `PageReader` baru (mis. `HermesPageReader`) yang dirakit di `main.js`, sehingga usecase tidak berubah, dengan batas biaya per jalan.
5. Benchmark akurasi pada semua sumber (`bun run bench:accuracy`) menunjukkan Hermes memperbaiki artikel yang gagal di ekstraktor deterministik.

---

## 5. Konsekuensi

**Positif**
- Jalur produksi tetap deterministik, cepat, dan tanpa biaya token (sesuai ADR-0001).
- Hermes tetap tersedia di profile terpisah untuk riset situs baru, tanpa mengganggu profile `default`.
- Syarat fallback sudah terdefinisi, jadi keputusan ulang bisa didasarkan pada data.

**Negatif**
- Situs dengan struktur yang sangat berbeda tetap membutuhkan perbaikan ekstraktor secara manual.
- Profile `newscraper` menyimpan salinan kredensial provider di `hermes/profiles/newscraper/.env`.

---

## 6. Kapan ditinjau ulang

- Ekstraktor deterministik gagal (recall < 90% pada `bench:accuracy`) di sumber baru dan perbaikan generik tidak berhasil.
- Penerbit memberi izin pemrosesan AI.
- Hermes memakai agent-browser yang tidak menggantung di situs penuh iklan, atau biaya model turun signifikan.

---

## 7. Pertanyaan terbuka

1. Berapa jumlah artikel per hari yang realistis, untuk menghitung biaya opsi B atau C dengan data, bukan perkiraan dari 1 artikel?
2. Apakah agent-browser di Hermes bisa di-upgrade atau diarahkan ke 0.41.1 tanpa merusak instalasi Hermes? (Hermes memilih binary dari package manager-nya sebelum PATH.)
3. Apakah model yang lebih murah (atau lokal lewat provider `custom`) memberi akurasi yang sama?

---

## 8. Referensi

- Hermes Agent lokal: `hermes --help`, `hermes doctor`, `tools/browser_tool.py`, `tools/browser_use_cli.py`, `tools/browser_tool_install.py` di `HERMES_HOME/hermes-agent`
- [Benchmark akurasi](../reserch/benchmark-akurasi-ekstraksi-2026-11-02.md) dan alat `scraper/tools/compare-with-source.js`
- [Benchmark driver](../reserch/benchmark-driver-browser-2026-11-02.md): `agent-browser open` menunggu event `load`
