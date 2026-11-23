// Parts round trip over a generated grid. SYNTHETIC: every input below is invented; no case data, no network, no model.
// Score = number of failing grid cells (direction min, target 0). Deterministic: no clock, no randomness.
// Locked: the climber edits manual/src/parts.js (or pack.js), never this folder.
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = (f) => import(pathToFileURL(path.join(root, "manual/src", f)).href);
const { buildCasePack } = await load("pack.js");
const P = await load("parts.js");

const PAGES = 1;
const para = (i, size) => `Parágrafo ${i}. ${"x".repeat(size)}`;
export function makeCase(docs, size, multi) {
  const documents = [], pages = [];
  for (let i = 0; i < docs; i++) {
    const docId = String(2000 + i);
    documents.push({ docId, piece: "petição", title: `Peça ${i + 1}` });
    const text = multi ? [para(i, size), para(i, size), para(i, size)].join("\n\n") : para(i, size);
    pages.push({ docId, pageInDoc: PAGES, hasText: true, text, method: "text" });
  }
  return { origin: "text", documents, pages, gaps: [] };
}

const strip = (s) => s.replace(/\s+/g, "");
const TAG = /^\[ID (\d+), pág\. \d+\]/gm;
const CONT = /^\[ID \d+, pág\. \d+\] \(continuação\)\n/gm;

// Returns the list of broken invariants for one cell (empty = pass).
export function cellFailures(c) {
  const r = makeCase(c.docs, c.size, c.multi);
  const why = [];
  let parts;
  try { parts = P.buildCasePackParts(r, { maxChars: c.maxChars }); } catch (e) { return ["throw"]; }
  if (!Array.isArray(parts) || !parts.length) return ["empty"];
  const total = parts.length;
  const passages = parts.map((p) => P.extractPassagesFromPartText(p.text));
  const packPassages = P.extractPassagesFromPack(buildCasePack(r));
  // content kept, in order, nothing added except continuation tags (whitespace may move at a split)
  if (strip(passages.join("\n\n").replace(CONT, "")) !== strip(packPassages)) why.push("roundtrip");
  if (parts.some((p) => p.text.length > c.maxChars)) why.push("oversize");
  if (parts.some((p, k) => p.name !== P.partFileName(k + 1, total))) why.push("name");
  if (parts.some((p, k) => !p.text.startsWith(`# ${k ? "parte" : "Pacote do caso — parte"} ${k + 1} de ${total}`) || !p.text.trimEnd().endsWith(`FIM DA PARTE ${k + 1} DE ${total}`))) why.push("frame");
  // every part opens its passages with an ID tag, so each chunk names its source
  if (passages.some((t) => !/^\[ID \d+, pág\. \d+\]/.test(t))) why.push("untagged");
  // index: each document lists exactly the parts that hold its passages
  const where = new Map();
  passages.forEach((t, k) => { for (const m of t.matchAll(TAG)) { const s = where.get(m[1]) ?? new Set(); s.add(k + 1); where.set(m[1], s); } });
  const idx = parts[0].text.match(/## Índice\s*\n\n([\s\S]*?)\n\n## Lacunas/)?.[1] ?? "";
  for (const d of r.documents) {
    const row = idx.split("\n").find((l) => l.startsWith(`| ${d.docId} |`));
    const want = [...(where.get(d.docId) ?? [])].sort((a, b) => a - b).map((n) => `${n}/${total}`).join(", ");
    if (!row || !row.includes(`| ${want} |`)) { why.push("index"); break; }
  }
  // not a cheat: a pack longer than maxChars must really split, and not into crumbs
  const need = Math.ceil(packPassages.length / c.maxChars);
  if (total < need || total > 2 * need + 2) why.push("split");
  return why;
}

export function grid() {
  const cells = [];
  for (const docs of [1, 2, 5, 12, 40]) for (const size of [50, 900, 4000, 30000, 120000]) for (const multi of [false, true]) for (const maxChars of [5000, 12000, 50000, 350000]) {
    if (docs === 40 && maxChars === 5000) continue; // the part-1 index alone is about 4.3 kB there: not a fair cell
    cells.push({ docs, size, multi, maxChars });
  }
  return cells;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const cells = grid(), bad = [];
  const by = {};
  for (const c of cells) {
    const w = cellFailures(c);
    if (w.length) { bad.push({ c, w }); for (const x of w) by[x] = (by[x] ?? 0) + 1; }
  }
  console.log(`parts-grid: cells=${cells.length} failing=${bad.length}`);
  console.log(`reasons: ${JSON.stringify(by)}`);
  for (const b of bad.slice(0, 10)) console.log(`FAIL docs=${b.c.docs} size=${b.c.size} multi=${b.c.multi} maxChars=${b.c.maxChars}: ${b.w.join("+")}`);
}
