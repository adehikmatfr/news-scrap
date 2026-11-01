// Aturan URL discovery: placeholder `{date}` (YYYY-MM-DD di zona waktu config) dan `{page}` (mulai 1).

const DAY_MS = 24 * 60 * 60 * 1000;

export const hasPlaceholder = (template, name) => template.includes(`{${name}}`);

export function formatDate(date, timezone) {
  // Locale en-CA menghasilkan format YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// Tanggal hari ini lalu mundur `days - 1` hari, agar berita menjelang tengah malam tetap terbaca setelah tanggal berganti.
export function discoveryDates(now, timezone, days) {
  return Array.from({ length: days }, (_, i) => formatDate(new Date(now.getTime() - i * DAY_MS), timezone));
}

export function renderDiscoveryUrl(template, { date, page }) {
  return template.replaceAll('{date}', date).replaceAll('{page}', String(page));
}
