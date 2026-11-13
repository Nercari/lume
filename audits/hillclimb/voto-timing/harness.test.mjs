// Tests use a fake claude binary. No real model call, no network.
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { ALLOWED_MODELS, loadDocs, preflight, run, verify } from "./harness.mjs";

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
  const r = run({ mode: "live", model: MODEL, env, bin: f.bin });
  assert.equal(r.usable, true);
  assert.equal(f.count(), 2);
  assert.equal(r.receipts.length, 2);
  assert.deepEqual(r.receipts[0].executedModels, [MODEL]);
});

test("a receipt with an unexpected executed model stops the run after the first call", () => {
  const f = fake({ auth: AUTH, calls: [ok(canned("relatorio"), [MODEL, "claude-opus-5-5"]), ok(canned("voto"))] });
  const r = run({ mode: "live", model: MODEL, env, bin: f.bin });
  assert.match(r.blocked, /do not match pinned/);
  assert.equal(f.count(), 1);
  assert.equal(r.usable, false);
  assert.equal(r.totalSec, null);
});

test("an apiKeySource other than none stops the run", () => {
  const f = fake({ auth: AUTH, calls: [{ ...ok(canned("relatorio")), apiKeySource: "ANTHROPIC_API_KEY" }] });
  assert.match(run({ mode: "live", model: MODEL, env, bin: f.bin }).blocked, /apiKeySource/);
  assert.equal(f.count(), 1);
});

test("a blocked preflight makes no model call", () => {
  const f = fake({ auth: { ...AUTH, loggedIn: false }, calls: [] });
  const r = run({ mode: "live", model: MODEL, env, bin: f.bin });
  assert.ok(r.blocked);
  assert.equal(f.count(), 0);
});

test("an unusable voto reports no time-to-usable", () => {
  const f = fake({ auth: AUTH, calls: [ok(canned("relatorio")), ok(canned("voto").replace("Nego provimento", "Dou provimento"))] });
  const r = run({ mode: "live", model: MODEL, env, bin: f.bin });
  assert.equal(r.usable, false);
  assert.equal(r.totalSec, null);
  assert.ok(r.elapsedSec > 0);
});
