export const MAX_BUNDLE_BYTES = 50 * 1024 * 1024;

const BLOCKED_REL = [
  (rel) => rel.toLowerCase().endsWith('.pdf'),
  (rel) => /(?:^|\/)(private|lume-private)(?:\/|$)/.test(rel.replace(/\\/g, '/')),
  (rel) => /(?:^|\/)lume-calibracao-[^/]+\.json$/i.test(rel.replace(/\\/g, '/')),
  (rel) => /(?:^|\/)private-eval[^/]*(?:\/|$)/i.test(rel.replace(/\\/g, '/')),
];

/** Portable Node win-x64: node.exe is ~86 MB; only this file and LICENSE skip the 50 MB cap. */
export function isRuntimeNodeSizeExempt(manifestPath) {
  const norm = manifestPath.replace(/\\/g, '/');
  return norm === 'runtime/node/node.exe' || norm === 'runtime/node/LICENSE';
}

export function assertBundlePathAllowed(rel, size) {
  const norm = rel.replace(/\\/g, '/');
  for (const rule of BLOCKED_REL) {
    if (rule(norm)) throw new Error(`refused blocked path: ${rel}`);
  }
  if (size > MAX_BUNDLE_BYTES && !isRuntimeNodeSizeExempt(norm)) {
    throw new Error(`refused file larger than 50 MB: ${rel} (${size} bytes)`);
  }
}
