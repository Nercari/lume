// Engineering proxy: t_pack decomposition and one argv candidate. No model, no network, invented inputs (harness fixture docs).
// Baseline argv ["-I", script, "package", file] is the one in harness.mjs at f7077dd. Candidate adds "-S". The validator file is not touched.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const repo = path.resolve(process.argv[2]);
const rounds = Number(process.argv[3] ?? 200);
const fx = path.join(repo, "audits/hillclimb/voto-timing/fixture/docs");
const script = path.join(repo, "plugins/lume-claude/skills/jef-pacote/scripts/lume_check.py");
const docs = readdirSync(fx).sort().map((f) => ({ id: f.replace(/\.txt$/, ""), text: readFileSync(path.join(fx, f), "utf8") }));
const good = { documents: docs.map((d) => ({ id: d.id, status: "lido", gaps: [], pages: [{ pdf_page: 1, document_page: 1, text: d.text }] })), parts: [{ number: 1, ids: docs.map((d) => d.id) }], total_parts: 1 };
const bad = {
  "empty documents": { ...good, documents: [] },
  "duplicate id": { ...good, documents: [good.documents[0], good.documents[0]] },
  "status lido with gap": { ...good, documents: good.documents.map((d, i) => (i ? d : { ...d, gaps: ["x"] })) },
  "status invalid": { ...good, documents: good.documents.map((d, i) => (i ? d : { ...d, status: "ok" })) },
  "part missing id": { ...good, parts: [{ number: 1, ids: good.parts[0].ids.slice(1) }] },
  "part number gap": { ...good, parts: [{ number: 2, ids: good.parts[0].ids }] },
  "total_parts zero": { ...good, total_parts: 0 },
  "not an object": [],
};
const dir = mkdtempSync(path.join(tmpdir(), "voto-tpack-"));
const write = (name, obj) => { const f = path.join(dir, name); writeFileSync(f, JSON.stringify(obj)); return f; };
const argv = (flags, file) => [...flags, script, "package", file];
const VARIANTS = { baseline: ["-I"], candidate: ["-I", "-S"] };
const run = (flags, file) => { const r = spawnSync("python3", argv(flags, file), { encoding: "utf8" }); return { status: r.status, stdout: r.stdout, stderr: r.stderr }; };
// Invariant: same exit status, stdout and stderr on the valid pack and on every invalid pack.
const invariant = {};
for (const [name, obj] of [["valid", good], ...Object.entries(bad)]) {
  const f = write(`${name.replace(/\W+/g, "-")}.json`, obj);
  const a = run(VARIANTS.baseline, f), b = run(VARIANTS.candidate, f);
  invariant[name] = { equal: a.status === b.status && a.stdout === b.stdout && a.stderr === b.stderr, status: a.status, stdout: a.stdout.trim() };
}
const ms = (fn) => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6; };
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)];
// Interleaved rounds, order flipped each round, so drift and cache warmth hit both variants alike.
const t = { write: [], baseline: [], candidate: [], floorI: [], floorIS: [] };
const goodFile = write("good.json", good);
for (let i = 0; i < rounds; i++) {
  t.write.push(ms(() => writeFileSync(path.join(mkdtempSync(path.join(tmpdir(), "voto-pack-")), "pack.json"), JSON.stringify(good))));
  const order = i % 2 ? ["candidate", "baseline"] : ["baseline", "candidate"];
  for (const v of order) t[v].push(ms(() => { const r = run(VARIANTS[v], goodFile); if (JSON.parse(r.stdout).status !== "PASS") throw new Error("not PASS"); }));
  t.floorI.push(ms(() => spawnSync("python3", ["-I", "-c", "pass"])));
  t.floorIS.push(ms(() => spawnSync("python3", ["-I", "-S", "-c", "pass"])));
}
const stat = (a) => ({ median: +med(a).toFixed(3), p10: +pct(a, 0.1).toFixed(3), p90: +pct(a, 0.9).toFixed(3) });
const out = {
  label: "SYNTHETIC PROXY. Local engineering timing only. Not a Law baseline. Not an improvement claim.",
  rounds, python: spawnSync("python3", ["--version"], { encoding: "utf8" }).stdout.trim(),
  workCounts: { spawnsPerPack: 1, filesWrittenPerPack: 1, validatorFileChanged: false, argvBaseline: argv(VARIANTS.baseline, "<file>").slice(0, 1).concat(["<script>", "package", "<file>"]), argvCandidate: ["-I", "-S", "<script>", "package", "<file>"] },
  invariant, allInvariantsEqual: Object.values(invariant).every((x) => x.equal),
  ms: { mkdtempAndWrite: stat(t.write), spawnCheckBaseline: stat(t.baseline), spawnCheckCandidate: stat(t.candidate), pythonStartupFloorI: stat(t.floorI), pythonStartupFloorIS: stat(t.floorIS) },
  medianDeltaMs: +(med(t.baseline) - med(t.candidate)).toFixed(3),
};
console.log(JSON.stringify(out, null, 2));
