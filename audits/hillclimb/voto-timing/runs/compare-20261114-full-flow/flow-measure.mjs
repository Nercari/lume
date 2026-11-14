// Run 37: full synthetic packaging flow through the REAL buildPack() and run({mode:"canned"}).
// SYNTHETIC PROXY. Invented workloads only. No model call, no checkpoint, no deletion.
// harness.mjs is NOT edited. Only the validator argv/path is redirected for the ref and mid arms:
// the CJS child_process.spawnSync / fs.mkdtempSync / fs.writeFileSync are wrapped, then
// module.syncBuiltinESMExports() makes harness.mjs's live ESM bindings see the wrappers before it is imported.
// The same wrappers run for every arm (head included), so their cost is common to all arms.
// usage: node flow-measure.mjs [--fixture N] [--medium N] [--large N] [--runs N] [--warmup N]
import { createRequire } from "node:module";
import module from "node:module";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const cp = require("node:child_process");
const fs = require("node:fs");
const realSpawn = cp.spawnSync, realMk = fs.mkdtempSync, realWrite = fs.writeFileSync, realRead = fs.readFileSync, realStat = fs.statSync;
const here = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE = path.join(here, "reference/lume_check.py");
const now = () => performance.now();

// arms: ref = frozen pre-hillclimb validator + original argv `-I`; mid = frozen validator + head argv `-I -S`; head = shipped validator + `-I -S`.
const ARMS = {
  ref: { script: REFERENCE, flags: ["-I"] },
  mid: { script: REFERENCE, flags: ["-I", "-S"] },
  head: { script: null, flags: ["-I", "-S"] },
};
const ARM_NAMES = Object.keys(ARMS);
let arm = null, rec = null, capture = false;
const isValidator = (a) => typeof a === "string" && a.endsWith("jef-pacote/scripts/lume_check.py");

cp.spawnSync = function (cmd, args, opts) {
  const i = Array.isArray(args) ? args.findIndex(isValidator) : -1;
  if (cmd !== "python3" || i < 0 || !arm) return realSpawn.call(this, cmd, args, opts);
  const rest = args.slice(i + 1);
  const a = [...arm.flags, arm.script ?? args[i], ...rest];
  const t0 = now();
  const r = realSpawn.call(this, cmd, a, opts);
  const t1 = now();
  if (rec) { rec.tS0 = t0; rec.tS1 = t1; }
  if (capture) {
    const file = rest[rest.length - 1];
    const buf = realRead(file);
    capture.spawn = { argv: a.map((x) => (x === REFERENCE ? "<validator>" : x === args[i] ? "<validator>" : x === file ? "<pack>" : x)), status: r.status, stdout: r.stdout, stderr: r.stderr, packBytes: buf.length, packSha: createHash("sha256").update(buf).digest("hex") };
  }
  return r;
};
fs.mkdtempSync = function (...a) { const t0 = now(); const v = realMk.apply(this, a); if (rec) { rec.tM0 = t0; rec.tM1 = now(); } return v; };
fs.writeFileSync = function (f, ...a) {
  if (rec && typeof f === "string" && f.endsWith("pack.json")) { const t0 = now(); const v = realWrite.call(this, f, ...a); rec.tW0 = t0; rec.tW1 = now(); return v; }
  return realWrite.call(this, f, ...a);
};
module.syncBuiltinESMExports();
const h = await import("../../harness.mjs");

// ---------- invented workloads ----------
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? +process.argv[i + 1] : d; };
const CFG = { fixture: arg("--fixture", 120), medium: arg("--medium", 100), large: arg("--large", 40), runs: arg("--runs", 100), warmup: arg("--warmup", 5) };
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const WORDS = "autos recurso apelante apelado sentença benefício prestação segurado perícia laudo comprovante documento folha petição contestação despacho decisão requerimento período contribuição carência competência renda valor parcela atraso juros correção prazo intimação publicação certidão cadastro relação vínculo empresa empregador salário trabalho atividade especial agente nocivo exposição formulário perfil profissiográfico tempo serviço aposentadoria idade invalidez auxílio doença incapacidade laboral médico exame conclusão quesito resposta assistente técnico juízo instância tribunal turma relator voto ementa acórdão".split(" ");
const filler = (rnd, bytes) => {
  let s = "";
  while (Buffer.byteLength(s) < bytes) {
    const n = 8 + Math.floor(rnd() * 14);
    const w = Array.from({ length: n }, () => WORDS[Math.floor(rnd() * WORDS.length)]);
    if (rnd() < 0.08) w.push(`${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}/${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}/20${10 + Math.floor(rnd() * 15)}`);
    if (rnd() < 0.05) w.push(`R$ ${1 + Math.floor(rnd() * 9)}.${String(Math.floor(rnd() * 1000)).padStart(3, "0")},${String(Math.floor(rnd() * 100)).padStart(2, "0")}`);
    s += w.join(" ") + ". " + (rnd() < 0.15 ? "\n" : "");
  }
  return s.trim();
};
const fixtureDocs = h.loadDocs();
const withFiller = (seed, count, lo, hi) => {
  const rnd = mulberry(seed);
  const docs = fixtureDocs.map((d) => ({ ...d }));
  for (let i = fixtureDocs.length + 1; i <= count; i++) docs.push({ id: `doc-${String(i).padStart(3, "0")}`, text: filler(rnd, lo + Math.floor(rnd() * (hi - lo))) });
  return docs;
};
const WORKLOADS = {
  "fixture-5": { docs: fixtureDocs, timed: CFG.fixture },
  "medium-30": { docs: withFiller(37001, 30, 3000, 9000), timed: CFG.medium },
  "large-120": { docs: withFiller(37002, 120, 4000, 40000), timed: CFG.large },
};
// parity-only workloads
const uni = fixtureDocs.map((d) => ({ ...d }));
uni.push({ id: "doc-ç-ü-☃-😀", text: "Acórdão «citação» \"aspas\" \\barra\\ \t tab\nnova linha \u0001 ctl   ls 😀 日本語 R$ 1.234,56 12/03/2020" });
uni.push({ id: "doc-quote\"x", text: "" });
const PARITY_ONLY = {
  "edge-unicode": { docs: uni },
  "err-duplicate-id": { docs: [fixtureDocs[0], { ...fixtureDocs[1], id: fixtureDocs[0].id }] },
  "err-empty-id": { docs: [{ id: "", text: "x" }] },
  "err-whitespace-id": { docs: [{ id: "   ", text: "x" }] },
  "err-empty-docs": { docs: [] },
};

const expected = JSON.parse(realRead(path.join(here, "../../fixture/expected.json"), "utf8"));
const canned = { relatorio: realRead(path.join(here, "../../fixture/canned/relatorio.md"), "utf8"), voto: realRead(path.join(here, "../../fixture/canned/voto.md"), "utf8") };

const sizes = (docs) => {
  const b = docs.map((d) => Buffer.byteLength(d.text)).sort((x, y) => x - y);
  return { docs: docs.length, textBytesTotal: b.reduce((s, x) => s + x, 0), textBytesMin: b[0] ?? 0, textBytesMedian: b[b.length >> 1] ?? 0, textBytesMax: b[b.length - 1] ?? 0 };
};

// ---------- one measured flow (real buildPack + real verify) ----------
function flow(docs) {
  rec = {};
  const t0 = now();
  rec.t0 = t0;
  const pack = h.buildPack(docs);
  const t1 = now();
  const failures = { relatorio: h.verify("relatorio", canned.relatorio, docs, expected), voto: h.verify("voto", canned.voto, docs, expected) };
  const t2 = now();
  const r = rec; rec = null;
  const st = { pack_build: r.tM0 - r.t0, mkdtemp: r.tM1 - r.tM0, stringify: r.tW0 - r.tM1, write: r.tS0 - r.tW0, spawn: r.tS1 - r.tS0, tail: t1 - r.tS1, buildpack_total: t1 - t0, verify: t2 - t1, flow_total: t2 - t0 };
  return { st, failures, parts: pack.parts.length };
}
const sha = (x) => createHash("sha256").update(typeof x === "string" ? x : JSON.stringify(x)).digest("hex");
function parityRun(armName, docs) {
  arm = ARMS[armName];
  capture = {};
  let thrown = null, failures = null;
  try { failures = flow(docs).failures; } catch (e) { thrown = String(e.message); rec = null; }
  const c = capture; capture = false;
  return { armName, thrown, failures, ...c.spawn };
}
const PARITY_KEYS = ["thrown", "failures", "status", "stdout", "stderr", "packBytes", "packSha"];
const same = (a, b) => PARITY_KEYS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));

// ---------- stats ----------
const q = (a, p) => { const s = [...a].sort((x, y) => x - y); const i = (s.length - 1) * p; const lo = Math.floor(i); return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo); };
const stat = (a) => ({ n: a.length, median: q(a, 0.5), p25: q(a, 0.25), p75: q(a, 0.75), min: Math.min(...a), max: Math.max(...a) });
const PERMS = [[0, 1, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0], [0, 2, 1], [1, 0, 2]];
const STAGES = ["pack_build", "mkdtemp", "stringify", "write", "spawn", "tail", "buildpack_total", "verify", "flow_total"];

const results = { meta: {}, config: CFG, workloads: {}, parity: {}, run_canned: {} };
results.meta = { date: new Date().toISOString().slice(0, 10), node: process.version, python: realSpawn("python3", ["--version"], { encoding: "utf8" }).stdout.trim(), cpu: os.cpus()[0].model, cores: os.cpus().length, loadavgStart: os.loadavg(), tmpdir: process.env.TMPDIR, referenceMd5: createHash("md5").update(realRead(REFERENCE)).digest("hex"), arms: ARMS };

// parity first (untimed)
for (const [name, w] of Object.entries({ ...WORKLOADS, ...PARITY_ONLY })) {
  const runs = [0, 1].map(() => ARM_NAMES.map((a) => parityRun(a, w.docs)));
  const flat = runs.flat();
  const ref = flat.find((x) => x.armName === "ref");
  results.parity[name] = { sizes: sizes(w.docs), outcome: ref.thrown ? "FAIL(throw)" : "PASS", refStdout: ref.stdout, refThrown: ref.thrown, refPackBytes: ref.packBytes, refVerifyFailures: ref.failures, allEqualToRef: flat.every((x) => same(x, ref)), headEqualRef: flat.filter((x) => x.armName === "head").every((x) => same(x, ref)), midEqualRef: flat.filter((x) => x.armName === "mid").every((x) => same(x, ref)), argvByArm: Object.fromEntries(flat.slice(0, 3).map((x) => [x.armName, x.argv])) };
}

// timed
for (const [name, w] of Object.entries(WORKLOADS)) {
  const rounds = { ref: [], mid: [], head: [] };
  for (let r = 0; r < CFG.warmup + w.timed; r++) {
    for (const i of PERMS[r % 6]) {
      const a = ARM_NAMES[i];
      arm = ARMS[a];
      const f = flow(w.docs);
      if (f.failures.relatorio.length || f.failures.voto.length) throw new Error(`verify failed on ${name}/${a}: ${JSON.stringify(f.failures)}`);
      if (r >= CFG.warmup) rounds[a].push(f.st);
    }
  }
  const stats = {}, delta = {};
  for (const a of ARM_NAMES) { stats[a] = {}; for (const s of STAGES) stats[a][s] = stat(rounds[a].map((x) => x[s])); }
  for (const [x, y] of [["ref", "head"], ["ref", "mid"], ["mid", "head"]]) {
    delta[`${x}-${y}`] = {};
    for (const s of STAGES) {
      const d = rounds[x].map((v, i) => v[s] - rounds[y][i][s]);
      delta[`${x}-${y}`][s] = { ...stat(d), yFasterRounds: d.filter((v) => v > 0).length };
    }
  }
  results.workloads[name] = { sizes: sizes(w.docs), packBytes: results.parity[name].refPackBytes, rounds: w.timed, stats, delta, raw: rounds };
}

// full canned run() on the fixture (loadDocs is hardcoded to the fixture)
{
  const raw = { ref: [], mid: [], head: [] }, reps = {};
  for (let r = 0; r < CFG.warmup + CFG.runs; r++) {
    for (const i of PERMS[r % 6]) {
      const a = ARM_NAMES[i];
      arm = ARMS[a];
      const t0 = now();
      const rep = h.run({ mode: "canned" });
      const wall = now() - t0;
      if (!rep.usable || rep.modelCalls !== 0) throw new Error(`run() not usable on ${a}`);
      const { segmentsSec, elapsedSec, totalSec, ...stable } = rep;
      reps[a] = sha(stable);
      if (r >= CFG.warmup) raw[a].push({ wall, t_pack: segmentsSec.t_pack * 1000, t_relatorio: segmentsSec.t_relatorio * 1000, t_voto: segmentsSec.t_voto * 1000, t_verify: segmentsSec.t_verify * 1000, elapsed: elapsedSec * 1000 });
    }
  }
  const keys = ["wall", "t_pack", "t_relatorio", "t_voto", "t_verify", "elapsed"];
  const stats = {}, delta = {};
  for (const a of ARM_NAMES) { stats[a] = {}; for (const k of keys) stats[a][k] = stat(raw[a].map((x) => x[k])); }
  for (const [x, y] of [["ref", "head"], ["ref", "mid"], ["mid", "head"]]) { delta[`${x}-${y}`] = {}; for (const k of keys) { const d = raw[x].map((v, i) => v[k] - raw[y][i][k]); delta[`${x}-${y}`][k] = { ...stat(d), yFasterRounds: d.filter((v) => v > 0).length }; } }
  results.run_canned = { rounds: CFG.runs, reportShaByArm: reps, reportEqual: new Set(Object.values(reps)).size === 1, note: "segmentsSec are rounded to 1 ms by the harness (toFixed(3)); t_* here are x1000", stats, delta, raw };
}
results.meta.loadavgEnd = os.loadavg();

realWrite(path.join(here, "results/results.json"), JSON.stringify(results, null, 1));
const f = (v) => v.toFixed(2);
let md = "";
for (const [name, w] of Object.entries(results.workloads)) {
  md += `\n### ${name} (${w.sizes.docs} docs, text ${w.sizes.textBytesTotal} B, doc min/median/max ${w.sizes.textBytesMin}/${w.sizes.textBytesMedian}/${w.sizes.textBytesMax} B, pack.json ${w.packBytes} B, ${w.rounds} rounds)\n\n| Stage | ref ms (IQR) | mid ms | head ms (IQR) | ref-head ms | head faster in |\n| --- | --- | --- | --- | --- | --- |\n`;
  for (const s of STAGES) { const R = w.stats.ref[s], M = w.stats.mid[s], H = w.stats.head[s], D = w.delta["ref-head"][s]; md += `| ${s} | ${f(R.median)} (${f(R.p25)}-${f(R.p75)}) | ${f(M.median)} | ${f(H.median)} (${f(H.p25)}-${f(H.p75)}) | ${f(D.median)} | ${D.yFasterRounds}/${D.n} |\n`; }
  const A = w.delta["ref-mid"].flow_total, B = w.delta["mid-head"].flow_total;
  md += `\nflow_total split: ref-mid (argv only) ${f(A.median)} ms, mid-head (validator changes) ${f(B.median)} ms.\n`;
}
const rc = results.run_canned;
md += `\n### run({mode:"canned"}) on fixture-5 (${rc.rounds} rounds)\n\n| Segment | ref ms (IQR) | mid ms | head ms (IQR) | ref-head ms | head faster in |\n| --- | --- | --- | --- | --- | --- |\n`;
for (const k of ["wall", "t_pack", "t_relatorio", "t_voto", "t_verify", "elapsed"]) { const R = rc.stats.ref[k], M = rc.stats.mid[k], H = rc.stats.head[k], D = rc.delta["ref-head"][k]; md += `| ${k} | ${f(R.median)} (${f(R.p25)}-${f(R.p75)}) | ${f(M.median)} | ${f(H.median)} (${f(H.p25)}-${f(H.p75)}) | ${f(D.median)} | ${D.yFasterRounds}/${D.n} |\n`; }
md += `\nreport (minus timings) equal across arms: ${rc.reportEqual}\n\n### Parity (validator stdout/stderr/status, pack sha+bytes, verify failures, thrown message; 2 passes per arm)\n\n| Workload | docs | outcome | head==ref | mid==ref |\n| --- | --- | --- | --- | --- |\n`;
for (const [n, p] of Object.entries(results.parity)) md += `| ${n} | ${p.sizes.docs} | ${p.outcome} | ${p.headEqualRef} | ${p.midEqualRef} |\n`;
realWrite(path.join(here, "results/tables.md"), md);
console.log(md);
const bad = Object.entries(results.parity).filter(([, p]) => !p.allEqualToRef).map(([n]) => n);
if (bad.length || !rc.reportEqual) { console.error("PARITY MISMATCH:", bad); process.exit(3); }
