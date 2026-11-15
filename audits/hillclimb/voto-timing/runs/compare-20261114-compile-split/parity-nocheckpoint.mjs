// Run 38 parity: run-37 head validator (baseline) vs a candidate (path in argv[2]). Same corpus as run 36.
// Parity, old vs new validator: exit status, stdout, stderr. Invented data only.
// DELETION HOLD: no `checkpoint` argv anywhere in this file. Checkpoint parity is NOT RUN.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const here = path.dirname(new URL(import.meta.url).pathname);
const V = { baseline: path.resolve(process.argv[2]), candidate: path.resolve(process.argv[3]) };
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
const locUni = { documents: docs, references: [{ id: 'nã"o\n\u2028\ud83d\ude00\\' }] };
const locUniDoc = { documents: [{ ...docs[0], id: 'ação "é"\n\ud83d\ude00' }, { ...docs[0], id: 'ação "é"\n\ud83d\ude00' }], references: [] };
const base = "**1.** um\n\n**2.** dois\n", cand = "**1.** UM\n\n**2.** dois\n";
const dif = { base, candidate: cand, editable_items: [1] };
const difBad = { base, candidate: "sem numeracao", editable_items: [] };
const files = { ...Object.fromEntries(Object.entries(pack).map(([k, v]) => [`pack-${k}`, v])), loc, locBad, locUni, locUniDoc, dif, difBad };
const raw = {
  "raw-empty": "", "raw-invalid-json": "{not json", "raw-bom": "﻿" + JSON.stringify(good), "raw-latin1": Buffer.from([0x7b, 0x22, 0xe9, 0x22, 0x3a, 0x31, 0x7d]),
  "raw-ws-only": " \n\t\r ", "raw-ws-wrapped": " \r\n\t" + JSON.stringify(good) + " \n\t\r", "raw-formfeed": "\f" + JSON.stringify(good), "raw-nbsp": "\u00a0" + JSON.stringify(good), "raw-vtab-trail": JSON.stringify(good) + "\v",
  "raw-ws-bom": " ﻿" + JSON.stringify(good), "raw-nul-trail": JSON.stringify(good) + "\u0000",
  "raw-nan-inf": JSON.stringify(good).replace(/^\{/, '{"nan":NaN,"inf":-Infinity,"pinf":Infinity,'), "raw-nan-bare": "NaN", "raw-nan-bad": '{"a":NaNa}',
  "raw-bigint-huge": '{"n":' + "9".repeat(5000) + "}", "raw-bigint-ok": JSON.stringify(good).replace(/^\{/, '{"big":123456789012345678901234567890,"f":1.5e300,"fi":1e400,"nz":-0.0,"e":1E5,'),
  "raw-deep-100": '{"a":' + "[".repeat(100) + "]".repeat(100) + "}", "raw-deep-900": '{"a":' + "[".repeat(900) + "]".repeat(900) + "}", "raw-deep-5000": '{"a":' + "[".repeat(5000) + "]".repeat(5000) + "}", "raw-deep-100000": '{"a":' + "[".repeat(100000) + "]".repeat(100000) + "}",
  "raw-escapes": JSON.stringify(good).replace(/^\{/, '{"u":"\\ud83d\\ude00 \\u00e7 \\n \\" \\\\ \\/","lone":"\\ud800",'), "raw-dup-keys": '{"documents":[],"documents":[1]}',
  "raw-control-char": '{"a":"x\ty"}', "raw-trailing-comma": '{"a":1,}', "raw-single-quote": "{'a':1}", "raw-leading-zero": '{"a":01}', "raw-open": "[", "raw-missing-value": '{"a":}', "raw-unterminated-str": '{"a":"x', "raw-extra-close": "{}}", "raw-two-docs": "{}{}",
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
    const err = r.stderr.replaceAll(dir, "<DIR>");
    // uncaught tracebacks carry the script path and line numbers; compare only the exception line, minus the stack-usage figure (varies between runs of the same script)
    res[v] = { status: r.status, stdout: r.stdout.replaceAll(dir, "<DIR>"), stderr: err.startsWith("Traceback") ? err.trimEnd().split("\n").pop().replace(/used \d+ kB/, "used N kB") : err };
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
