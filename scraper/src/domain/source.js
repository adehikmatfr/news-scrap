// Situs berita yang di-scrape, beserta jadwal dan nilai default-nya.
import { hasPlaceholder } from './discovery.js';

export const DISCOVERY_TYPES = ['rss', 'index'];

const DEFAULTS = {
  pattern: null,
  waitFor: null,
  minWords: 50,
  maxArticles: Infinity,
  maxPages: 10,
  preferAllPage: true,
  maxAgeHours: null,
};

const DISCOVERY_DEFAULTS = { days: 1, maxPages: 1 };

function assertIntInRange(name, field, value, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`source ${name}: ${field} must be an integer between ${min} and ${max}`);
  }
}

// Placeholder wajib ada jika lebih dari satu tanggal/halaman diminta; tanpa itu URL yang sama diambil berulang.
function createDiscovery(name, raw) {
  const discovery = { ...DISCOVERY_DEFAULTS, ...raw };
  assertIntInRange(name, 'discovery.days', discovery.days, 1, 7);
  assertIntInRange(name, 'discovery.maxPages', discovery.maxPages, 1, 50);
  if (discovery.days > 1 && !hasPlaceholder(discovery.url, 'date')) {
    throw new Error(`source ${name}: discovery.days > 1 requires {date} in discovery.url`);
  }
  if (discovery.maxPages > 1 && !hasPlaceholder(discovery.url, 'page')) {
    throw new Error(`source ${name}: discovery.maxPages > 1 requires {page} in discovery.url`);
  }
  return Object.freeze(discovery);
}

// Jadwal yang tidak pernah jatuh dalam 8 tahun (mis. 30 Februari) dianggap tidak valid.
function assertSchedule(name, schedule) {
  if (!schedule) throw new Error(`source ${name}: schedule is required (cron expression, e.g. "*/15 * * * *")`);
  let next;
  try {
    next = Bun.cron.parse(schedule);
  } catch (err) {
    throw new Error(`source ${name}: invalid schedule "${schedule}": ${err.message}`);
  }
  if (!next) throw new Error(`source ${name}: schedule "${schedule}" never runs`);
}

export function createSource(raw) {
  if (!raw?.name) throw new Error('source.name is required');
  if (!DISCOVERY_TYPES.includes(raw.discovery?.type)) {
    throw new Error(`source ${raw.name}: discovery.type must be one of ${DISCOVERY_TYPES.join(', ')}`);
  }
  if (!raw.discovery.url) throw new Error(`source ${raw.name}: discovery.url is required`);
  assertSchedule(raw.name, raw.schedule);
  if (raw.maxAgeHours != null && !(raw.maxAgeHours > 0)) {
    throw new Error(`source ${raw.name}: maxAgeHours must be a positive number`);
  }

  return Object.freeze({
    ...DEFAULTS,
    ...raw,
    discovery: createDiscovery(raw.name, raw.discovery),
    pattern: raw.pattern ? new RegExp(raw.pattern) : null,
  });
}
