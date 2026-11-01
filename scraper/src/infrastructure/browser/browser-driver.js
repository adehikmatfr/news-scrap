// Kontrak driver browser yang dipakai BrowserPageReader dan SourceUrlDiscoverer (ADR-0003).
// Implementasi: AgentBrowserCli, CdpDriver, PlaywrightDriver. File ini hanya berisi definisi tipe JSDoc.

/**
 * Semua driver memakai satu tab yang dipakai ulang, sesuai antrean serial (ADR-0002).
 * `open` selesai saat DOM siap (`DOMContentLoaded`) dan `waitFor` (jika ada) sudah muncul.
 * `eval` mengembalikan nilai ekspresi; error di skrip menjadi error.
 * `close` tidak melempar error dan aman dipanggil berkali-kali.
 * @typedef {object} BrowserDriver
 * @property {(url: string, waitFor?: string|null) => Promise<void>} open
 * @property {(script: string) => Promise<unknown>} eval
 * @property {() => Promise<void>} close
 */

export {};
