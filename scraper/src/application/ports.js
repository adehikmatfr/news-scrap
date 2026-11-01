// Kontrak (port) yang dibutuhkan usecase. Implementasinya ada di src/infrastructure.
// File ini hanya berisi definisi tipe JSDoc.

/**
 * @typedef {object} Pagination
 * @property {string|null} all   URL versi "tampilkan semua", jika ada
 * @property {string[]} pages    URL halaman 2, 3, ... milik artikel yang sama
 */

/**
 * Hasil ekstraksi satu halaman artikel.
 * @typedef {object} ExtractedPage
 * @property {string} title
 * @property {string} content_text
 * @property {number} word_count
 * @property {{url: string, caption: string|null}[]} images
 * @property {Pagination} pagination
 */

/**
 * @typedef {object} PageReader
 * @property {(url: string, opts: {waitFor?: string|null}) => Promise<ExtractedPage>} read
 */

/**
 * @typedef {object} UrlDiscoverer
 * @property {(source: ReturnType<typeof import('../domain/source.js').createSource>) => Promise<string[]>} discover
 */

/**
 * Artikel siap kirim.
 * @typedef {object} ArticleRecord
 * @property {string} id
 * @property {string} source
 * @property {Date} scrapedAt
 * @property {object} article
 */

/**
 * @typedef {object} ArticlePublisher
 * @property {(record: ArticleRecord) => Promise<{status: number}>} publish
 */

/**
 * @typedef {object} SentStore
 * @property {(url: string) => Promise<boolean>} has
 * @property {(url: string, info: {id: string, status: number}) => Promise<void>} markSent
 */

/**
 * Penjadwal per sumber. `handler` yang mengembalikan Promise ditunggu sebelum jadwal berikutnya dihitung.
 * @typedef {object} Scheduler
 * @property {(source: object, handler: () => Promise<unknown>) => void} schedule
 * @property {(source: object, from?: Date) => Date|null} nextRun
 * @property {() => void} stopAll
 */

/**
 * @typedef {object} Logger
 * @property {(msg: string, fields?: object) => void} info
 * @property {(msg: string, fields?: object) => void} warn
 * @property {(msg: string, fields?: object) => void} error
 */

export {};
