// Strings that may leave the court workstation. Digit runs and document-number shapes
// are masked. Callers still have to omit text, titles and non-allow-listed values.

const SHAPES = [
  /\d{3}\.\d{3}\.\d{3}-\d{2}/g,
  /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g,
  /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/g,
  /\d{2}\/\d{2}\/\d{4}/g,
  /\d{4}-\d{2}-\d{2}/g,
];

export function maskDigitRuns(value, min) {
  return String(value).replace(new RegExp(`\\d{${min},}`, 'g'), '#');
}

export function scrubPatterns(value) {
  let s = String(value);
  for (const shape of SHAPES) s = s.replace(shape, '#');
  return s;
}

export function sanitizeId(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const s = maskDigitRuns(scrubPatterns(raw), 3);
  return s.length > 120 ? s.slice(0, 120) : s;
}

export function sanitizeHref(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 2000) return null;
  let url;
  try { url = new URL(raw, 'https://pje.invalid'); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  return maskDigitRuns(scrubPatterns(url.pathname), 3);
}

export function sanitizeToken(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const s = maskDigitRuns(scrubPatterns(raw), 4);
  if (s.length > 40 || !/^[A-Za-z0-9_-]+$/.test(s)) return null;
  return s;
}

export function sanitizeClassToken(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  const s = maskDigitRuns(scrubPatterns(raw), 3);
  if (s.length > 80 || !/^[A-Za-z0-9_#-]+$/.test(s)) return null;
  return s;
}

// URL pattern for a calibration file: digit runs become N, query values are dropped,
// parameter names stay. The path is what a later profile can turn into a named rule.
export function urlPattern(raw) {
  if (typeof raw !== 'string' || !raw || raw.length > 2000) return null;
  let url;
  try { url = new URL(raw, 'https://pje.invalid'); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  const path = url.pathname.replace(/\d+/g, 'N');
  const keys = [];
  for (const key of url.searchParams.keys()) {
    const name = key.replace(/\d+/g, 'N');
    if (name && !keys.includes(name)) keys.push(name);
  }
  return keys.length ? `${path}?${keys.join('&')}` : path;
}

export function sizeBucket(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size <= 0) return '0';
  if (size < 10_000) return 'lt-10k';
  if (size < 100_000) return 'lt-100k';
  if (size < 1_000_000) return 'lt-1m';
  return 'ge-1m';
}

export function scrubTree(value) {
  if (typeof value === 'string') return maskDigitRuns(scrubPatterns(value), 4);
  if (Array.isArray(value)) return value.map(scrubTree);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[maskDigitRuns(scrubPatterns(k), 4)] = scrubTree(v);
    return out;
  }
  return value;
}
