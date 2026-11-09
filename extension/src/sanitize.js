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
