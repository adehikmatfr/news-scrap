const TRACKING_PARAMS = ['fbclid', 'gclid'];

// Buang parameter tracking dan fragment agar artikel yang sama tidak diproses dua kali.
// Mengembalikan null untuk URL yang tidak valid.
export function normalizeURL(raw) {
  try {
    const u = new URL(raw);
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_') || TRACKING_PARAMS.includes(key)) u.searchParams.delete(key);
    }
    return u.href;
  } catch {
    return null;
  }
}
