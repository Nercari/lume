// Tests use a fake claude binary. No real model call, no network.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ALLOWED_MODELS, gatesBlocker, loadDocs, loadGates, operative, preflight, run, verify } from "./harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const canned = (k) => readFileSync(path.join(here, "fixture/canned", `${k}.md`), "utf8");
const expected = JSON.parse(readFileSync(path.join(here, "fixture/expected.json"), "utf8"));
const docs = loadDocs();
const MODEL = "claude-haiku-5-5";

// Fake CLI: `auth status` prints cfg.auth; any other call prints cfg.calls[n] (relatorio first, voto second) and counts calls.
function fake(cfg) {
  const dir = mkdtempSync(path.join(tmpdir(), "fake-claude-"));
  const state = path.join(dir, "count");
  writeFileSync(state, "0");
  const bin = path.join(dir, "claude");
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require("node:fs");
const cfg = ${JSON.stringify(cfg)};
if (process.argv[2] === "auth") { console.log(JSON.stringify(cfg.auth)); process.exit(0); }
const n = +fs.readFileSync(${JSON.stringify(state)}, "utf8"); fs.writeFileSync(${JSON.stringify(state)}, String(n + 1));
process.stdin.resume(); process.stdin.on("data", () => {}); process.stdin.on("end", () => console.log(JSON.stringify(cfg.calls[n])));
`);
  chmodSync(bin, 0o755);
  return { bin, count: () => +readFileSync(state, "utf8") };
}
const AUTH = { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max", email: "x@example.invalid" };
const ok = (text, models = [MODEL]) => ({ is_error: false, subtype: "success", result: text, apiKeySource: null, duration_ms: 5, usage: { input_tokens: 1, output_tokens: 1 }, modelUsage: Object.fromEntries(models.map((m) => [m, {}])) });
const env = { PATH: process.env.PATH };
const OPEN = loadGates().map((g) => ({ ...g, status: "VERIFIED", evidence: "https://github.com/Nercari/lume/pull/62#issuecomment-1" })); // test-only: the real gates.json stays UNMET

test("canned run is usable and reports edit burden as UNMEASURED", () => {
  const r = run({ mode: "canned" });
  assert.equal(r.usable, true);
  assert.equal(r.editBurden, "UNMEASURED");
  assert.equal(r.modelCalls, 0);
  assert.match(r.label, /SYNTHETIC PROXY/);
  assert.deepEqual(Object.keys(r.segmentsSec), ["t_pack", "t_relatorio", "t_voto", "t_verify"]);
});

test("verify rejects each defect class", () => {
  const v = canned("voto");
  const cases = {
    "numbered paragraphs": v.replace("**2.**", "**3.**"),
    "ementa": v.replace(/^\*\*[^\n]+\*\*\n\n/, ""),
    "locator": v.replace("[doc-05]", "[doc-99]"),
    "quote": v.replace("«roubo e furto qualificado»", "«cobre qualquer furto»"),
    "date or amount": v.replace("20/08/2026", "21/08/2026"),
    "dispositivo": v.replace("Nego provimento", "Dou provimento"),
    "semicolon": v.replace("**3.** ", "**3.** Pedido; "),
    "heading": "# Voto\n" + v,
    "required facts": v.replaceAll("SM-0001", "XX"),
  };
  for (const [key, text] of Object.entries(cases)) assert.ok(verify("voto", text, docs, expected).length > 0, `${key} not rejected`);
  assert.deepEqual(verify("voto", v, docs, expected), []);
  assert.ok(verify("relatorio", canned("relatorio") + "\nNego provimento.", docs, expected).length);
});

test("verify accepts desprovimento and a locator inside the ementa, and still rejects dou provimento", () => {
  const v = canned("voto");
  const alt = v.replace("Nego provimento", "Voto pelo desprovimento").replace(/^(\*\*[^\n]*?)\*\*\n/, "$1 [doc-05]**\n");
  assert.deepEqual(verify("voto", alt, docs, expected), []);
  assert.ok(verify("voto", v.replace("Nego provimento", "Dou provimento"), docs, expected).length);
});

test("preflight blocks without a model, with opus, with an API key, and without a subscription login", () => {
  const f = fake({ auth: AUTH });
  assert.match(preflight({ model: undefined, env, bin: f.bin }).blocker, /no --model/);
  assert.match(preflight({ model: "claude-opus-5-5", env, bin: f.bin }).blocker, /allow-list/);
  assert.match(preflight({ model: MODEL, env: { ...env, ANTHROPIC_API_KEY: "x" }, bin: f.bin }).blocker, /ANTHROPIC_API_KEY/);
  const g = fake({ auth: { ...AUTH, authMethod: "api_key" } });
  assert.match(preflight({ model: MODEL, env, bin: g.bin }).blocker, /not a claude.ai/);
  const p = preflight({ model: MODEL, env, bin: f.bin });
  assert.equal(p.ok, true);
  assert.deepEqual(Object.keys(p.auth).sort(), ["apiProvider", "authMethod", "subscriptionType"]); // no email or org stored
  assert.ok(ALLOWED_MODELS.every((m) => !m.includes("opus")));
});

test("live run with matching receipts is usable and makes exactly two calls", () => {
  const f = fake({ auth: AUTH, calls: [ok(canned("relatorio")), ok(canned("voto"))] });
  const r = run({ mode: "live", model: MODEL, env, bin: f.bin, gates: OPEN });
  assert.equal(r.usable, true);
  assert.equal(f.count(), 2);
  assert.equal(r.receipts.length, 2);
  assert.deepEqual(r.receipts[0].executedModels, [MODEL]);
});

test("a receipt with an unexpected executed model stops the run after the first call", () => {
  const f = fake({ auth: AUTH, calls: [ok(canned("relatorio"), [MODEL, "claude-opus-5-5"]), ok(canned("voto"))] });
  const r = run({ mode: "live", model: MODEL, env, bin: f.bin, gates: OPEN });
  assert.match(r.blocked, /do not match pinned/);
  assert.equal(f.count(), 1);
  assert.equal(r.usable, false);
  assert.equal(r.totalSec, null);
});

test("an apiKeySource other than none stops the run", () => {
  const f = fake({ auth: AUTH, calls: [{ ...ok(canned("relatorio")), apiKeySource: "ANTHROPIC_API_KEY" }] });
  assert.match(run({ mode: "live", model: MODEL, env, bin: f.bin, gates: OPEN }).blocked, /apiKeySource/);
  assert.equal(f.count(), 1);
});

test("a blocked preflight makes no model call", () => {
  const f = fake({ auth: { ...AUTH, loggedIn: false }, calls: [] });
  const r = run({ mode: "live", model: MODEL, env, bin: f.bin, gates: OPEN });
  assert.ok(r.blocked);
  assert.equal(f.count(), 0);
});

test("an unusable voto reports no time-to-usable", () => {
  const f = fake({ auth: AUTH, calls: [ok(canned("relatorio")), ok(canned("voto").replace("Nego provimento", "Dou provimento"))] });
  const r = run({ mode: "live", model: MODEL, env, bin: f.bin, gates: OPEN, maxRevisions: 0 });
  assert.equal(r.usable, false);
  assert.equal(r.totalSec, null);
  assert.ok(r.elapsedSec > 0);
});

// Dispositive validation (Cipher finding on PR #62, discussion_r4568496726). All inputs are invented.
const P4 = "**4.** Nego provimento ao recurso e mantenho a sentença.";
const withP4 = (s) => canned("voto").replace(P4, s);

test("verify rejects an absent, wrong, ambiguous or contradictory dispositive even when the ementa says DESPROVIDO", () => {
  const v = canned("voto");
  const cases = {
    "dispositive paragraph deleted": v.replace("\n\n" + P4, ""),
    "partial grant": withP4("**4.** Dou parcial provimento ao recurso e reformo a sentença."),
    "partial grant, no verb": withP4("**4.** Parcial provimento ao recurso."),
    "full grant": withP4("**4.** Dou provimento ao recurso e reformo a sentença."),
    "no outcome stated": withP4("**4.** Mantenho a sentença."),
    "not known": withP4("**4.** Não conheço do recurso."),
    "deny and grant in one paragraph": withP4("**4.** Nego provimento ao recurso e, de ofício, dou provimento parcial."),
    "deny then grant in two paragraphs": withP4("**4.** Nego provimento ao recurso.\n\n**5.** Dou provimento ao recurso."),
    "ementa grants, dispositive denies": v.replace("RECURSO DESPROVIDO", "RECURSO PROVIDO"),
    "ementa partial grant, dispositive denies": v.replace("RECURSO DESPROVIDO", "RECURSO PARCIALMENTE PROVIDO"),
    "ementa denies, dispositive grants partially": withP4("**4.** Dou parcial provimento ao recurso."),
  };
  for (const [key, text] of Object.entries(cases)) assert.ok(verify("voto", text, docs, expected).length > 0, `${key} not rejected`);
});

test("verify accepts legitimate dispositive wordings", () => {
  const v = canned("voto");
  const ok = {
    "canned": v,
    "voto pelo desprovimento, then a costs paragraph": withP4("**4.** Voto pelo desprovimento do recurso e pela manutenção da sentença.\n\n**5.** Condeno a recorrente em custas, nos termos da lei."),
    "negado provimento": withP4("**4.** Negado provimento ao recurso."),
    "não dou provimento": withP4("**4.** Não dou provimento ao recurso."),
    "recurso não provido": withP4("**4.** Recurso não provido."),
    "recurso improvido": withP4("**4.** Recurso improvido."),
    "two consistent dispositive paragraphs": withP4("**4.** Nego provimento ao recurso.\n\n**5.** Desprovido o recurso, mantenho a sentença."),
    "ementa without an outcome word": v.replace(" RECURSO DESPROVIDO.", ""),
    "ementa DESPROVIMENTO": v.replace("RECURSO DESPROVIDO", "DESPROVIMENTO"),
  };
  for (const [key, text] of Object.entries(ok)) assert.deepEqual(verify("voto", text, docs, expected), [], `${key} wrongly rejected`);
});

test("a voto with a missing or contradictory dispositive is not usable and reports no time-to-usable", () => {
  for (const bad of [canned("voto").replace("\n\n" + P4, ""), withP4("**4.** Dou parcial provimento ao recurso e reformo a sentença.")]) {
    const f = fake({ auth: AUTH, calls: [ok(canned("relatorio")), ok(bad)] });
    const r = run({ mode: "live", model: MODEL, env, bin: f.bin, gates: OPEN });
    assert.equal(r.usable, false);
    assert.equal(r.totalSec, null);
  }
});

// Residual false-usable (Ops continuation on PR #62): a quoted or attributed precedent outcome must not stand in for this voto's own decision. All inputs are invented.
const P3 = canned("voto").match(/\*\*3\.\*\*[^\n]*/)[0];
const withP3 = (s) => canned("voto").replace(P3, s);
const noDispositive = (text) => verify("voto", text, docs, expected).some((f) => /^dispositive absent/.test(f));

test("a precedent's outcome, quoted or attributed, is not this voto's dispositive", () => {
  const cases = {
    "attributed past denial, no own decision": withP4("**4.** A Turma Recursal, em caso análogo, negou provimento ao recurso do segurado."),
    "was-denied in a precedent, no own decision": withP4("**4.** Em precedente citado, o recurso foi desprovido por exclusão expressa."),
    "quoted denial in curly quotes, no own decision": withP4("**4.** O paradigma consignou: “Nego provimento ao recurso e mantenho a sentença”."),
    "quoted denial in straight quotes, no own decision": withP4('**4.** O paradigma consignou: "Nego provimento ao recurso".'),
    "precedent denial in reasoning, own paragraph has no outcome": withP3(P3 + " A Turma Recursal negou provimento a recurso idêntico.").replace(P4, "**4.** Mantenho a sentença."),
    "ementa denies, reasoning quotes a precedent denial, no own decision": withP4("**4.** Como já se decidiu, “desprovimento do recurso” é a solução."),
  };
  for (const [key, text] of Object.entries(cases)) assert.ok(noDispositive(text), `${key} not rejected as a missing dispositive`);
});

test("a precedent in the reasoning does not reject a voto that has its own operative decision", () => {
  const ok = {
    "precedent grants partially, own decision denies": withP3(P3 + " A Turma Recursal deu parcial provimento a caso diverso."),
    "precedent denies, own decision denies": withP3(P3 + " A Turma Recursal negou provimento a recurso idêntico."),
    "own decision cites the precedent": withP4("**4.** Nego provimento ao recurso, nos termos do precedente da Turma, e mantenho a sentença."),
    "own denial after a precedent locative": withP4("**4.** No julgado paradigma, nego provimento ao recurso."),
    "own denial after an attributed opening": withP4("**4.** Como já decidiu a Turma, nego provimento ao recurso."),
    "own denial before an attributed tail": withP4("**4.** Nego provimento ao recurso, como já decidiu a Turma Recursal."),
    "own decision with quoted precedent in the same paragraph": withP4("**4.** Conforme “desprovimento” em precedente, nego provimento ao recurso."),
  };
  for (const [key, text] of Object.entries(ok)) assert.deepEqual(verify("voto", text, docs, expected), [], `${key} wrongly rejected`);
});

// Independent review rv-integrate-pedro-plugin-a14f-6206 at 58674067: an infinitive or a negation is not an operative denial. All inputs are invented.
test("an infinitive, a negated denial or a normative sentence is not this voto's dispositive", () => {
  const cases = {
    "reviewer case 1: precedent with deve-se negar, nothing else decided": withP4("**4.** No precedente da Turma, deve-se negar provimento ao recurso. Nada mais a decidir."),
    "reviewer case 2: negated denial": withP4("**4.** Não nego provimento ao recurso."),
    "infinitive only": withP4("**4.** É caso de negar provimento ao recurso."),
    "deve-se negar, own voice": withP4("**4.** Deve-se negar provimento ao recurso."),
    "precedent locative, participle": withP4("**4.** No precedente da Turma, negado provimento ao recurso."),
    "double negative, grant": withP4("**4.** Não deixo de negar provimento ao recurso."),
    "not desprovido": withP4("**4.** O recurso não está desprovido."),
    "negation with a stretch of words": withP4("**4.** Não é o caso de se negar provimento ao recurso."),
  };
  for (const [key, text] of Object.entries(cases)) assert.ok(verify("voto", text, docs, expected).length > 0, `${key} not rejected`);
  assert.ok(noDispositive(cases["reviewer case 1: precedent with deve-se negar, nothing else decided"]));
  assert.ok(noDispositive(cases["reviewer case 2: negated denial"]));
});

test("an infinitive or a negation elsewhere cannot hide a contradiction of an own denial", () => {
  const cases = {
    "own denial, then a negated denial": withP4("**4.** Nego provimento ao recurso.\n\n**5.** Não é caso de negar provimento."),
    "own denial, then a grant infinitive": withP4("**4.** Nego provimento ao recurso.\n\n**5.** É caso de dar provimento ao recurso."),
    "own denial, then não nego": withP4("**4.** Nego provimento ao recurso. Não nego provimento ao recurso."),
  };
  for (const [key, text] of Object.entries(cases)) assert.ok(verify("voto", text, docs, expected).length > 0, `${key} not rejected`);
});

test("legitimate operative denials in other grammatical forms are still accepted", () => {
  const ok = {
    "nego-lhe provimento": withP4("**4.** Nego-lhe provimento e mantenho a sentença."),
    "voto por negar provimento": withP4("**4.** Voto por negar provimento ao recurso."),
    "voto no sentido de negar provimento": withP4("**4.** Voto no sentido de negar provimento ao recurso."),
    "reasoning with an infinitive denial, own denial after": withP3(P3 + " Não há razão para dar provimento a tese contrária.").replace(P4, "**4.** Nego provimento ao recurso."),
    "own denial after a normative reasoning sentence": withP4("**4.** Deve prevalecer a cláusula 7. Nego provimento ao recurso."),
  };
  for (const [key, text] of Object.entries(ok)) {
    const f = verify("voto", text, docs, expected);
    if (key.startsWith("reasoning with")) assert.ok(f.length > 0, "documented false reject changed"); else assert.deepEqual(f, [], `${key} wrongly rejected`);
  }
});

// Cipher, Codex discussion_r4569573493 at 5c12864: attribution is clause scope. An attributed clause is dropped, an own clause in the same sentence stays. All inputs are invented.
const P5 = (x) => withP4(`**4.** Nego provimento ao recurso e mantenho a sentença.\n\n**5.** ${x}`);
test("an attributed clause does not erase an own contradicting clause in the same sentence", () => {
  const cases = {
    "cipher pair, attributed partial grant": P5("Diante do que decidiu a Turma no paradigma, dou parcial provimento ao recurso."),
    "cipher pair, same grant without attribution": P5("Dou parcial provimento ao recurso."),
    "attributed opening, own full grant": P5("Conforme decidiu a Turma, dou provimento ao recurso."),
    "attributed opening after a semicolon": P5("Como já decidiu a Turma; dou parcial provimento ao recurso."),
    "attributed clause joined by e": P5("A Turma negou provimento a recurso idêntico e, quanto a este, dou provimento."),
    "locative, own non-conhecimento": P5("No julgado paradigma, não conheço do recurso."),
  };
  for (const [key, text] of Object.entries(cases)) assert.ok(verify("voto", text, docs, expected).length > 0, `${key} not rejected`);
  assert.deepEqual(operative("**5.** Diante do que decidiu a Turma no paradigma, dou parcial provimento ao recurso."), ["PARCIAL"]);
});

// Independent review run2 at affad4e2: a bare passive ("foi dado provimento parcial") has no named source, so it is not attribution. All inputs are invented.
test("a passive without a named source is not attribution and cannot hide a contradiction", () => {
  const bad = {
    "reviewer pair, bare passive partial grant": P5("Assim, foi dado provimento parcial ao recurso."),
    "bare passive grant": P5("Foi dado provimento ao recurso."),
    "passive grant, source after the passive": P5("Foi dado provimento parcial ao recurso, nos termos do precedente da Turma."),
    "passive grant, conforme source": P5("Conforme o precedente da Turma, foi dado provimento parcial ao recurso."),
    "sourced passive, own grant in the same sentence": P5("No precedente da Turma, foi negado provimento, e dou parcial provimento ao recurso."),
  };
  for (const [key, text] of Object.entries(bad)) assert.ok(verify("voto", text, docs, expected).length > 0, `${key} not rejected`);
  const ok = {
    "locative source, passive grant elsewhere": P5("Na Turma, foi dado provimento parcial a recurso idêntico."),
    "agent source, passive": P5("Pela Turma Recursal, foram providos recursos idênticos."),
    "own passive denial agrees": P5("Foi negado provimento ao recurso."),
  };
  for (const [key, text] of Object.entries(ok)) assert.deepEqual(verify("voto", text, docs, expected), [], `${key} wrongly rejected`);
});

// Independent review run3 at 364bd546: a plural participle and a source mentioned inside an introductory phrase. All inputs are invented.
test("a plural provido is an outcome and a source inside a longer phrase is not attribution", () => {
  const bad = {
    "run3 A, plural providos": P5("Foram providos os embargos."),
    "plural providos, recursos": P5("Foram providos os recursos."),
    "run3 B, source inside nos termos do voto": P5("Nos termos do voto do relator na Turma, foi dado provimento parcial ao recurso."),
    "conformity phrase with a source": P5("De acordo com o precedente da Turma, foi dado provimento parcial ao recurso."),
    "source phrase, then own grant after the comma": P5("Na Turma, foi negado provimento, e foi dado provimento parcial ao recurso."),
  };
  for (const [key, text] of Object.entries(bad)) assert.ok(verify("voto", text, docs, expected).length > 0, `${key} not rejected`);
  const ok = {
    "sourced precedent, plural participle": P5("No precedente da Turma, foram providos recursos idênticos."),
    "sourced precedent, passive with a subject": P5("Em precedente citado, o recurso foi provido por exclusão expressa."),
    "own passive denial agrees": P5("Foi negado provimento ao recurso."),
  };
  for (const [key, text] of Object.entries(ok)) assert.deepEqual(verify("voto", text, docs, expected), [], `${key} wrongly rejected`);
  assert.deepEqual(operative("**5.** Foram providos os embargos."), ["PROVIMENTO"]);
});

// Independent review run4 at 71489c2f: a ground or the decision under review is not a source. All inputs are invented.
test("a ground phrase or the decision under review is not a source attribution", () => {
  const bad = {
    "run4, em razão do acórdão recorrido": P5("Em razão do acórdão recorrido, foi dado provimento ao recurso."),
    "em virtude do precedente": P5("Em virtude do precedente da Turma, foi dado provimento ao recurso."),
    "em face do julgado, plural": P5("Em face do julgado, foram providos os embargos."),
    "em decorrência do acórdão": P5("Em decorrência do acórdão da Turma, foi dado provimento parcial ao recurso."),
    "no acórdão recorrido": P5("No acórdão recorrido, foi dado provimento ao recurso."),
  };
  for (const [name, voto] of Object.entries(bad)) assert.ok(verify("voto", voto, docs, expected).length > 0, `${name} not rejected`);
  const ok = {
    "sourced precedent, plural participle": P5("No precedente da Turma, foram providos recursos idênticos."),
    "sourced Turma passive": P5("Na Turma, foi dado provimento parcial a recurso idêntico."),
    "sourced precedent with a subject": P5("Em precedente citado, o recurso foi provido por exclusão expressa."),
    "own passive denial agrees": P5("Foi negado provimento ao recurso."),
  };
  for (const [name, voto] of Object.entries(ok)) assert.deepEqual(verify("voto", voto, docs, expected), [], `${name} wrongly rejected`);
});

test("the shipped gates are all UNMET, so a live run stops before preflight and makes no model call", () => {
  const gates = loadGates();
  assert.equal(gates.length, 4);
  assert.ok(gates.every((g) => g.status === "UNMET" && g.evidence === ""));
  const f = fake({ auth: AUTH, calls: [] });
  const r = run({ mode: "live", model: MODEL, env, bin: f.bin });
  assert.match(r.blocked, /gates not verified: independent-evaluator.*law-vetoes.*heldout-isolation.*case-readiness/);
  assert.match(r.blocked, /Themis/);
  assert.equal(r.modelCalls, 0);
  assert.equal(f.count(), 0);
  assert.equal(r.totalSec, null);
});

test("a gate needs status VERIFIED and a Nercari GitHub issue or PR link", () => {
  assert.equal(gatesBlocker(OPEN), null);
  for (const bad of [{ status: "UNMET" }, { evidence: "" }, { evidence: "done" }, { evidence: "https://example.com/Nercari/lume/pull/1" }, { evidence: "https://github.com/other/lume/pull/1" }])
    assert.ok(gatesBlocker([{ ...OPEN[0], ...bad }]), JSON.stringify(bad));
});

test("a revision is timed, counted and summed into the time to a usable voto; the revision cap holds", () => {
  const bad = canned("voto").replace("Nego provimento", "Dou provimento");
  const f = fake({ auth: AUTH, calls: [ok(canned("relatorio")), ok(bad), ok(canned("voto"))] });
  const r = run({ mode: "live", model: MODEL, env, bin: f.bin, gates: OPEN });
  assert.equal(r.usable, true);
  assert.equal(r.revisions, 1);
  assert.equal(r.modelCalls, 3);
  assert.ok(r.segmentsSec.t_revisao_1 > 0);
  assert.equal(r.receipts.at(-1).kind, "revisao-1");
  assert.equal(r.timingKind, "SYNTHETIC_PROXY");
  assert.match(r.humanReviewSec, /UNMEASURED/);
  const g = fake({ auth: AUTH, calls: [ok(canned("relatorio")), ok(bad), ok(bad), ok(bad), ok(bad)] });
  const c = run({ mode: "live", model: MODEL, env, bin: g.bin, gates: OPEN });
  assert.equal(c.usable, false);
  assert.equal(c.revisions, 2);
  assert.equal(c.modelCalls, 4);
  assert.equal(c.totalSec, null);
});
