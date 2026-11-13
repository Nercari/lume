// Public-repo scrub for everything under plugins/ (tests included). The personal name is held
// base64-encoded so this file does not carry it in plain text.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NAME = Buffer.from("UGVkcm8gTmVyZXM=", "base64").toString("utf8").replace(" ", "\\s+");
export const PATTERNS = [
  /drive\.google\.com/i,
  /docs\.google\.com/i,
  /msg_i[d]x/,
  /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/, // CPF
  /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/, // CNPJ
  /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/, // CNJ
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/, // email
  /(?:\+?55\s?)?\(?\b\d{2}\)?\s?9?\d{4}-\d{4}\b/, // phone
  new RegExp(NAME, "i"),
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
    for (const re of PATTERNS) if (re.test(text)) hits.push(`${path.relative(pluginsDir, file)}: ${re.source === NAME ? "personal name" : re}`);
  }
  return hits;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.resolve(process.argv[2] ?? path.join(path.dirname(fileURLToPath(import.meta.url)), ".."));
  const hits = scrubHits(dir);
  console.log(hits.length ? `FAIL\n${hits.join("\n")}` : `PASS: no matches under ${dir}`);
  process.exit(hits.length ? 1 : 0);
}
