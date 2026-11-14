// Engineering proxy: same-work and local-time comparison of verify() between two harness modules. No model, no network, invented inputs.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
const [modPath, outFile] = process.argv.slice(2);
const fx = path.resolve("audits/hillclimb/voto-timing/fixture");
const h = await import(pathToFileURL(path.resolve(modPath)));
const docs = h.loadDocs.call ? ["doc-01","doc-02","doc-03","doc-04","doc-05"].map((id) => ({ id, text: readFileSync(path.join(fx, "docs", `${id}.txt`), "utf8") })) : [];
const expected = JSON.parse(readFileSync(path.join(fx, "expected.json"), "utf8"));
const voto = readFileSync(path.join(fx, "canned/voto.md"), "utf8");
const relatorio = readFileSync(path.join(fx, "canned/relatorio.md"), "utf8");
const P4 = "**4.** Nego provimento ao recurso e mantenho a sentença.";
const withP4 = (p) => voto.replace(P4, p);
const cases = {
  "canned voto": voto,
  "P3 precedent grants partially": voto.replace("o que afasta a alegação de falta de informação [doc-05].", "o que afasta a alegação de falta de informação [doc-05]. A Turma Recursal deu parcial provimento a caso diverso."),
  "own decision cites precedent": withP4("**4.** Nego provimento ao recurso, nos termos do precedente da Turma, e mantenho a sentença."),
  "own denial after attributed opening": withP4("**4.** Como já decidiu a Turma, nego provimento ao recurso."),
  "own denial before attributed tail": withP4("**4.** Nego provimento ao recurso, como já decidiu a Turma Recursal."),
  "quoted precedent in own paragraph": withP4("**4.** Conforme “desprovimento” em precedente, nego provimento ao recurso."),
  "negated denial": withP4("**4.** Não nego provimento ao recurso."),
  "infinitive only": withP4("**4.** É caso de negar provimento ao recurso."),
  "precedent deve-se negar": withP4("**4.** No precedente da Turma, deve-se negar provimento ao recurso. Nada mais a decidir."),
  "own denial then grant infinitive": withP4("**4.** Nego provimento ao recurso.\n\n**5.** É caso de dar provimento ao recurso."),
  "own denial then partial": withP4("**4.** Nego provimento ao recurso. Diante do que decidiu a Turma no paradigma, dou parcial provimento ao recurso."),
  "grant": withP4("**4.** Dou provimento ao recurso."),
  "partial grant": withP4("**4.** Dou parcial provimento ao recurso."),
  "no dispositive": withP4("**4.** Mantenho a sentença."),
  "ementa partial, body denies": voto.replace("RECURSO DESPROVIDO", "RECURSO PARCIALMENTE PROVIDO"),
  "semicolon": withP4("**4.** Nego provimento ao recurso; mantenho a sentença."),
};
const jobs = [...Object.entries(cases).map(([k, t]) => [k, "voto", t]), ["canned relatorio", "relatorio", relatorio]];
const runAll = () => jobs.map(([k, kind, t]) => [k, h.verify(kind, t, docs, expected)]);
const results = Object.fromEntries(runAll());
// Work count: RegExp.prototype.test calls over one pass of all jobs (counting pass only; the timing pass runs unpatched).
const orig = RegExp.prototype.test; let n = 0;
RegExp.prototype.test = function (s) { n++; return orig.call(this, s); };
runAll(); RegExp.prototype.test = orig;
const perJob = {};
RegExp.prototype.test = function (s) { n++; return orig.call(this, s); };
for (const [k, kind, t] of jobs) { n = 0; h.verify(kind, t, docs, expected); perJob[k] = n; }
RegExp.prototype.test = orig;
const ITER = 3000, ROUNDS = 7, per = [];
for (let r = 0; r < ROUNDS; r++) { const t0 = performance.now(); for (let i = 0; i < ITER; i++) runAll(); per.push(+(((performance.now() - t0) / ITER) * 1000).toFixed(2)); }
const sorted = [...per].sort((a, b) => a - b);
const out = {
  label: "SYNTHETIC PROXY. Engineering proxy, not real upload-to-voto time and not human edit reduction. No model call.",
  module: modPath, node: process.version, jobCount: jobs.length,
  regexTestCallsTotal: Object.values(perJob).reduce((a, b) => a + b, 0), regexTestCallsPerJob: perJob,
  usPerPassAllJobs: { rounds: per, median: sorted[Math.floor(ROUNDS / 2)], iterationsPerRound: ITER },
  failuresPerJob: results,
};
writeFileSync(outFile, JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify({ jobCount: out.jobCount, regexTestCallsTotal: out.regexTestCallsTotal, medianUsPerPass: out.usPerPassAllJobs.median, rounds: per, failingJobs: Object.entries(results).filter(([, f]) => f.length).length }));
