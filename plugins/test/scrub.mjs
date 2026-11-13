// Public-repo scrub for everything under plugins/ (tests included). The personal name is not stored:
// only SHA-256 hashes of its two-word forms (normalized: lowercase, no accents) are. A hash cannot be
// decoded, but a short name hash can be guessed from a dictionary, so this is a detector, not secrecy.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sha = (text) => createHash("sha256").update(text).digest("hex");
export const NAME_HASHES = new Set([
  "3bfa4ebb5a09666d855743fb0d173da3c4b1c3a4f2445f76be7ae8a6baf19877", // first + last
  "089a215bf09e239ffee822d7bb33293472fa91ad87a6d62b408bd90eacd64d8b", // last + first
]);

// True when two neighbouring words of the text hash to one of the hashes.
export function hasHashedName(text, hashes = NAME_HASHES) {
  const words = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/\p{L}+/gu) ?? [];
  return words.some((w, i) => i > 0 && hashes.has(sha(`${words[i - 1]} ${w}`)));
}
export const PATTERNS = [
  /drive\.google\.com/i,
  /docs\.google\.com/i,
  /msg_i[d]x/,
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, // CPF
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/, // CNPJ
  /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/, // CNJ
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}-\d{4}\b/, // phone
];

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const abs = path.join(dir, e.name);
    if (e.name === "node_modules" || e.name === ".git") return [];
    return e.isDirectory() ? filesUnder(abs) : [abs];
  });
}

// Files this package adds under plugins/ (paths relative to plugins/). Other plugins keep their own scrub tests.
export const SCOPE = ["lume-workspace", "test/workspace.test.mjs", "test/scrub.mjs"];

// Returns "file: pattern" for every text file in SCOPE under pluginsDir that matches a pattern.
export function scrubHits(pluginsDir, scope = SCOPE) {
  const hits = [];
  const all = scope.flatMap((rel) => {
    const abs = path.join(pluginsDir, rel);
    const st = statSync(abs, { throwIfNoEntry: false });
    return !st ? [] : st.isDirectory() ? filesUnder(abs) : [abs]; // absent file: not in that tree yet
  });
  for (const file of all.filter((f) => /\.(md|json|py|mjs|js|html|txt|ya?ml)$|LICENSE$/.test(f))) {
    const text = readFileSync(file, "utf8");
    const rel = path.relative(pluginsDir, file);
    for (const re of PATTERNS) if (re.test(text)) hits.push(`${rel}: ${re}`);
    if (hasHashedName(text)) hits.push(`${rel}: personal name`);
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const hits = scrubHits(dir);
  console.log(hits.length ? `FAIL\n${hits.join("\n")}` : `PASS: no matches under ${dir}`);
  process.exit(hits.length ? 1 : 0);
}
