---
name: tech-writer
description: >
  Aturan menulis dokumentasi teknis project ini dalam Bahasa Indonesia: README, ADR, runbook
  deploy/operasional, kontrak payload untuk sistem penerima, riset, CLAUDE.md, dan .env.example.
  Muat sebelum membuat atau mengubah dokumen apa pun. Pemicu: "tulis dokumentasi", "dokumentasikan",
  "bikin runbook", "bikin ADR", "update README", "rapikan dokumen". BUKAN untuk kode produksi dan
  BUKAN untuk komentar di dalam kode (skill `comment-style`).
---

# Penulisan Dokumentasi Teknis

Dokumentasi ditulis untuk engineer yang sedang menyelidiki masalah nyata, misalnya kenapa artikel terkirim ganda, isinya terpotong, atau scraper berhenti di server. **Akurasi lebih penting daripada kerapian: dokumen yang salah dengan yakin tentang jalur kritis lebih buruk daripada tidak ada dokumen.**

## Bahasa

- Dokumen ditulis dalam **Bahasa Indonesia** yang baku, ringkas, dan langsung.
- Istilah teknis yang lazim tidak diterjemahkan: `webhook`, `payload`, `retry`, `idempotency`, `session`, `daemon`, `fallback`, `dry-run`.
- Nama file, perintah, variabel env, field JSON, dan identifier kode ditulis dalam backtick dan tidak diterjemahkan.

## Dokumentasikan kode apa adanya, bukan yang dibayangkan

- **Baca sumbernya sebelum menulis.** Setiap klaim (perintah, variabel env, flag, field payload, alur, angka kinerja) harus bisa diverifikasi di repo. Rujuk `file:baris` untuk klaim penting. Jika tidak bisa diverifikasi, jangan nyatakan; tandai sebagai pertanyaan terbuka.
- **Jalankan perintah yang didokumentasikan** jika memungkinkan (`bun test`, `bun run dry-run`, langkah instalasi). Perintah yang belum diuji ditandai jelas sebagai belum diuji.
- **Angka kinerja dan ukuran** (waktu per artikel, RAM, jumlah kata) hanya ditulis jika diukur, beserta konteks pengukurannya (mesin, situs, jumlah artikel). Perkiraan diberi label "perkiraan".
- **Ikuti suara dan struktur dokumen yang ada.** `scraper/README.md`, `docs/adr/`, dan `.claude/CLAUDE.md` menetapkan konvensi; perluas, jangan membuat gaya baru.
- **Jangan menempelkan rahasia** ke dokumen: token, URL webhook produksi, kredensial. Pakai placeholder (`<WEBHOOK_TOKEN>`, `https://api.example.com`). Nilai nyata hanya ada di `.env` yang tidak di-commit.

## Jenis dokumen dan isinya

| Jenis | Lokasi | Isi wajib |
|---|---|---|
| **README** | `scraper/README.md` | Apa ini, kebutuhan, cara menjalankan, konfigurasi, kontrak untuk penerima, arsitektur, catatan. Perintah yang bisa langsung dijalankan |
| **ADR** | `docs/adr/NNNN-judul-kebab.md` | Status · tanggal · konteks · masalah · opsi yang dipertimbangkan · keputusan · konsekuensi · kapan ditinjau ulang. Lihat aturan ADR di bawah |
| **Runbook** | `docs/runbooks/<nama>.md` | Prasyarat, perintah persis, keluaran yang diharapkan, cara rollback/berhenti, tanda masalah dan penanganannya |
| **Kontrak payload** | README bagian "Kontrak untuk sistem penerima" | Contoh request lengkap (header + body), arti setiap field, perilaku terhadap tiap status respons. Diturunkan dari `src/infrastructure/publishing/payload.js` dan `webhook-publisher.js`, jangan dikarang |
| **Riset** | `docs/reserch/` | Tanggal riset, sumber, apa yang diverifikasi vs dari pengetahuan umum, rekomendasi beserta alasannya |
| **`.env.example`** | `scraper/.env.example` | Setiap variabel: fungsi, contoh nilai, nilai kosong berarti apa. Tanpa nilai rahasia |
| **CLAUDE.md** | `.claude/CLAUDE.md` | Lapisan rute dan aturan keras (penunjuk + larangan), bukan tutorial. Rincian panjang tetap di README/ADR |
| **Diagram** | Di dalam dokumen terkait | Mermaid atau ASCII yang sederhana. Diagram harus cocok dengan kode; diagram yang menggambarkan alur lama adalah cacat |

### Aturan ADR

- Format: konteks · masalah · opsi · keputusan · konsekuensi · kapan ditinjau ulang · pertanyaan terbuka.
- Selama status **Diusulkan (Proposed)**, ADR boleh direvisi.
- Setelah **Diterima (Accepted)**, ADR tidak diubah isinya. Keputusan baru ditulis sebagai ADR baru yang menyatakan `Menggantikan ADR-000N`, dan ADR lama diberi status `Digantikan oleh ADR-000M`. Hanya baris status yang boleh diubah.
- Penomoran berurutan; cek nomor terakhir di `docs/adr/` sebelum membuat yang baru.

## Aturan yang tidak bisa ditawar

- **Bersuara saat ragu.** Dokumen lama yang basi atau bertentangan dengan kode harus dilaporkan, bukan disalin ulang. Contoh: dokumen yang masih menyebut perintah `node`/`npm` padahal project memakai Bun.
- **Fakta jalur kritis ditulis persis seperti yang ditegakkan kode**, atau tidak ditulis sama sekali:
  - cara `id` artikel diturunkan dan kenapa stabil (`src/domain/article.js`);
  - klasifikasi retry: status mana yang diulang dan mana yang tidak (`webhook-publisher.js`);
  - kapan artikel dicatat terkirim (`scrape-source.js`);
  - antrean serial, status sumber, dan graceful shutdown (`source-run-queue.js`, `graceful-shutdown.js`);
  - penulisan state yang aman (`json-file-sent-store.js`);
  - kondisi berhenti pagination (`scrape-article.js`).
- **Prosa yang dipangkas dari komentar kode pindah ke sini.** Skill `comment-style` membatasi komentar menjadi maksud singkat, jadi penjelasan panjang yang dibuang dari kode ditulis di README atau ADR dalam bentuk dokumen. Pastikan rujukan di komentar (mis. "lihat README bagian ...") mengarah ke bagian yang benar-benar ada. Jangan memindahkannya kembali ke kode sebagai komentar.
- **Dokumen diarahkan ulang, bukan didokumentasikan ganda.** Saat kode berubah, dokumen yang menggambarkannya ditulis ulang pada perubahan yang sama: tanpa bagian "cara lama / cara baru", tanpa catatan deprecated untuk sesuatu yang sudah dihapus. **Pengecualian: `docs/adr/`** adalah catatan keputusan yang tidak diubah; keputusan baru = ADR baru.
- **Dokumen ditulis terakhir**, setelah kode dan test selesai dan lolos, supaya yang ditulis adalah yang benar-benar jalan, bukan rencananya. Perubahan nama variabel env diikuti perubahan `.env.example` dan README pada perubahan yang sama.
- **Verifikasi dengan pencarian.** Tidak ada build atau test yang membaca dokumen, jadi pencarian teks adalah satu-satunya detektor. Setelah mengganti nama (perintah, file, env, field), cari nama lama di seluruh dokumen kecuali `docs/adr/`; hasilnya harus nol:
  ```bash
  rg -n 'NamaLama' --glob '*.md' --glob '!docs/adr/**' --glob '*.example'
  ```
- **Ringkas dan mudah dipindai:** tabel, bagian pendek, perintah yang bisa dijalankan. Materi referensi panjang ditaruh di `docs/`, bukan di CLAUDE.md.

## Gaya penulisan

- Kalimat aktif dan langsung. Satu gagasan per kalimat.
- Bentuk kini untuk perilaku sistem ("scraper melewati artikel yang sudah terkirim"), bukan narasi pengembangan ("kami menambahkan fitur ...").
- Tanpa retorika dan tanpa HURUF KAPITAL untuk penekanan; pakai **tebal** secukupnya untuk hal yang benar-benar penting.
- Judul bagian berupa kata benda atau frasa singkat ("Kebutuhan", "Menjalankan", "Kontrak untuk sistem penerima").
- Contoh selalu konkret dan bisa dijalankan; placeholder memakai `<sudut>` atau domain `example.com`.
- Tandai dengan jelas apa yang **terverifikasi** dan apa yang **perkiraan / belum diuji**.

## Keluaran

- Dokumen di lokasi yang benar sesuai konvensi repo.
- Di akhir pekerjaan, laporkan dalam beberapa baris: dokumen yang dibuat/diubah, klaim yang tidak bisa diverifikasi, dan dokumen basi yang ditemukan (beserta lokasinya), tanpa menempelkan isi dokumen.

## Bekerja dengan dokumen yang sudah ada

Jika dokumen sudah ada, revisi di tempat. Ubah hanya bagian yang terdampak; jangan menulis ulang bagian yang masih akurat.
