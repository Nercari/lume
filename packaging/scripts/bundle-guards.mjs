export const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

const BLOCKED_REL = [
  (rel) => rel.toLowerCase().endsWith('.pdf'),
  (rel) => /(?:^|\/)(private|lume-private)(?:\/|$)/.test(rel.replace(/\\/g, '/')),
  (rel) => /(?:^|\/)lume-calibracao-[^/]+\.json$/i.test(rel.replace(/\\/g, '/')),
  (rel) => /(?:^|\/)private-eval[^/]*(?:\/|$)/i.test(rel.replace(/\\/g, '/')),
];

export function assertBundlePathAllowed(rel, size) {
  const norm = rel.replace(/\\/g, '/');
  for (const rule of BLOCKED_REL) {
    if (rule(norm)) throw new Error(`refused blocked path: ${rel}`);
  }
  if (size > MAX_BUNDLE_BYTES) throw new Error(`refused file larger than 50 MB: ${rel} (${size} bytes)`);
}
