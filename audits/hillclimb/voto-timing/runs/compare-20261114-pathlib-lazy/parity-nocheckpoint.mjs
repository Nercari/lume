// Parity, old vs new validator: exit status, stdout, stderr. Invented data only.
// DELETION HOLD: no `checkpoint` argv anywhere in this file. Checkpoint parity is NOT RUN.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
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
const files = { ...Object.fromEntries(Object.entries(pack).map(([k, v]) => [`pack-${k}`, v])), loc, locBad, dif, difBad };
const raw = {
  "raw-empty": "", "raw-invalid-json": "{not json", "raw-bom": "﻿" + JSON.stringify(good), "raw-latin1": Buffer.from([0x7b, 0x22, 0xe9, 0x22, 0x3a, 0x31, 0x7d]),
  "raw-array": "[1,2]", "raw-null": "null", "raw-trailing": JSON.stringify(good) + " x", "raw-utf8-accents": JSON.stringify({ ...good, note: "ação ç é" }),
};
const argvs = [
  [], ["package"], ["bogus", "F"], ["package", "F", "extra"], ["--help"], ["-h"], ["package", "--help"], ["package", "-x"], ["package", ""], ["package", "missing.json"], ["package", "-"],
  [" package", "F"], ["package", "--output=x", "F"], ["locators", "-x"], ["diff", ""], ["diff", "missing.json"],
  ["package", "./F"], ["package", "F/"], ["package", "."], ["package", ".."], ["package", "sub/../F"], ["package", "sub//F"], ["package", "sub"], ["package", "./missing//x.json"], ["package", "nodir/x.json"],
  ["package", "F/x"], ["package", "RAW:raw-empty"], ["package", "NOREAD"],
];
const bad = [];
let n = 0;
const mk = (v) => {
  const dir = mkdtempSync(path.join(tmpdir(), `parity-${v}-`));
  mkdirSync(path.join(dir, "sub"));
  for (const [k, obj] of Object.entries(files)) writeFileSync(path.join(dir, `${k.replace(/\W+/g, "-")}.json`), JSON.stringify(obj));
  for (const [k, c] of Object.entries(raw)) writeFileSync(path.join(dir, `${k}.json`), c);
  for (const [k, obj] of Object.entries(files)) writeFileSync(path.join(dir, "sub", `${k.replace(/\W+/g, "-")}.json`), JSON.stringify(obj));
  writeFileSync(path.join(dir, "NOREAD"), "{}"); chmodSync(path.join(dir, "NOREAD"), 0o000);
  return dir;
};
const runOne = (argv, fileName) => {
  const res = {};
  for (const [v, script] of Object.entries(V)) {
    const dir = mk(v);
    const F = `${fileName.replace(/\W+/g, "-")}.json`;
    const sub = (a) => (a.startsWith("RAW:") ? `${a.slice(4)}.json` : a.replaceAll("F", F));
    const r = spawnSync("python3", ["-I", "-S", script, ...argv.map(sub)], { cwd: dir, encoding: "utf8" });
    res[v] = { status: r.status, stdout: r.stdout.replaceAll(dir, "<DIR>"), stderr: r.stderr.replaceAll(dir, "<DIR>") };
  }
  n++;
  if (JSON.stringify(res.baseline) !== JSON.stringify(res.candidate)) bad.push({ argv, fileName, res });
};
const names = [...Object.keys(files), ...Object.keys(raw)];
for (const fileName of names) for (const cmd of ["package", "locators", "diff"]) {
  runOne([cmd, "F"], fileName);
}
for (const a of argvs) runOne(a, "pack-valid");
for (const a of [["package", "F/"], ["package", "./F"]]) runOne(a, "loc");
console.log(JSON.stringify({ comparisons: n, mismatches: bad.length, checkpointParity: "NOT RUN (deletion hold)", bad }, null, 2));
process.exit(bad.length ? 1 : 0);
