// Parity: same exit status, stdout and stderr, old vs new validator, over many argv shapes and inputs. Invented data only.
// Both scripts are named lume_check.py (in baseline/ and candidate/) so argparse usage text is comparable.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const V = { baseline: path.join(here, "baseline/lume_check.py"), candidate: path.join(here, "candidate/lume_check.py") };
const good = JSON.parse(readFileSync(path.join(here, "good-pack.json"), "utf8"));
const docs = good.documents;
const pack = {
  valid: good,
  "empty documents": { ...good, documents: [] },
  "duplicate id": { ...good, documents: [docs[0], docs[0]] },
  "status lido with gap": { ...good, documents: docs.map((d, i) => (i ? d : { ...d, gaps: ["x"] })) },
  "status invalid": { ...good, documents: docs.map((d, i) => (i ? d : { ...d, status: "ok" })) },
  "part missing id": { ...good, parts: [{ number: 1, ids: good.parts[0].ids.slice(1) }] },
  "part number gap": { ...good, parts: [{ number: 2, ids: good.parts[0].ids }] },
  "total_parts zero": { ...good, total_parts: 0 },
  "not an object": [],
};
const q = docs[0].pages[0].text.slice(0, 20);
const loc = { documents: docs, references: [{ id: docs[0].id, pdf_page: 1, document_page: 1, quote: q }] };
const locBad = { documents: docs, references: [{ id: "nope" }] };
const base = "**1.** um\n\n**2.** dois\n", cand = "**1.** UM\n\n**2.** dois\n";
const dif = { base, candidate: cand, editable_items: [1] };
const difBad = { base, candidate: "sem numeracao", editable_items: [] };
const cp = { schema: "lume-checkpoint/1", case_id: "c1", version: 1, source_revisions: { a: "1" }, stage: "s", pending: [], completed: [] };
const files = { ...Object.fromEntries(Object.entries(pack).map(([k, v]) => [`pack-${k}`, v])), loc, locBad, dif, difBad, cp };
const argvs = [
  [], ["package"], ["bogus", "F"], ["package", "F", "extra"], ["--help"], ["-h"], ["package", "--help"], ["package", "-x"], ["package", ""], ["package", "missing.json"], ["package", "-"],
  [" package", "F"], ["package", "--output=x", "F"], ["checkpoint", "F"], ["checkpoint", "F", "--output", "OUT/o.json", "--expected-version", "0"],
  ["checkpoint", "F", "--output", "F", "--expected-version", "0"], ["checkpoint", "F", "--output", "OUT/o.json", "--expected-version", "x"],
];
const bad = [];
let n = 0;
const runOne = (argv, fileName) => {
  const res = {};
  for (const [v, script] of Object.entries(V)) {
    const dir = mkdtempSync(path.join(tmpdir(), `parity-${v}-`));
    mkdirSync(path.join(dir, "OUT"));
    for (const [k, obj] of Object.entries(files)) writeFileSync(path.join(dir, `${k.replace(/\W+/g, "-")}.json`), JSON.stringify(obj));
    const F = `${fileName.replace(/\W+/g, "-")}.json`;
    const r = spawnSync("python3", ["-I", "-S", script, ...argv.map((a) => (a === "F" ? F : a))], { cwd: dir, encoding: "utf8" });
    const outFile = path.join(dir, "OUT/o.json");
    res[v] = { status: r.status, stdout: r.stdout.replaceAll(dir, "<DIR>"), stderr: r.stderr.replaceAll(dir, "<DIR>"), out: existsSync(outFile) ? readFileSync(outFile, "utf8") : null };
  }
  n++;
  if (JSON.stringify(res.baseline) !== JSON.stringify(res.candidate)) bad.push({ argv, fileName, res });
};
for (const fileName of Object.keys(files)) {
  for (const cmd of ["package", "locators", "diff"]) runOne([cmd, "F"], fileName);
  runOne(["checkpoint", "F"], fileName);
  runOne(["checkpoint", "F", "--output", "OUT/o.json", "--expected-version", "0"], fileName);
}
for (const a of argvs) runOne(a, "cp");
console.log(JSON.stringify({ comparisons: n, mismatches: bad.length, bad }, null, 2));
process.exit(bad.length ? 1 : 0);
