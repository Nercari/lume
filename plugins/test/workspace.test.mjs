import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { scrubHits } from "./scrub.mjs";

// plugins/lume-workspace is the workspace chat plugin (name "lume"). It sits next to,
// and never replaces, plugins/lume-jef (the PJe button flow the extension and packaging use).
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "lume-workspace");
const read = (rel) => readFileSync(path.join(root, rel), "utf8");

function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    return entry.isDirectory() ? filesUnder(abs) : [abs];
  });
}

test("both manifests agree and the version is the manifest version", () => {
  const main = JSON.parse(read("plugin.json"));
  const codex = JSON.parse(read(".codex-plugin/plugin.json"));
  const ui = main.extensions["com.openai"].interface;
  assert.equal(main.name, "lume");
  assert.equal(codex.name, main.name);
  assert.equal(main.version, "1.2.0");
  assert.equal(codex.version, main.version);
  assert.equal(codex.skills, "./skills");
  assert.deepEqual(codex.interface.defaultPrompt, ui.defaultPrompt);
  assert.equal(main.license, "MIT");
  assert.ok(ui.shortDescription.length <= 30);
  assert.ok(ui.defaultPrompt.length >= 1 && ui.defaultPrompt.length <= 3);
  for (const rel of [ui.logo, ui.composerIcon, main.extensions["com.openai"].onboardingSkill]) {
    assert.ok(statSync(path.join(root, rel)).isFile(), rel);
  }
  assert.equal(statSync(path.join(root, "mcp.json"), { throwIfNoEntry: false }), undefined);
  // Not a public-directory package: the README says so and the manifest must not claim a server.
  assert.match(read("LEIA-ME.md"), /não ao diretório público/);
  assert.match(ui.longDescription, /Não usa servidor, MCP/);
});

test("every skill has frontmatter and every referenced file exists", () => {
  const skills = readdirSync(path.join(root, "skills"), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  assert.equal(skills.length, 12);
  for (const name of skills) {
    const fm = read(`skills/${name}/SKILL.md`).match(/^---\r?\n([\s\S]*?)\r?\n---/);
    assert.ok(fm, name);
    assert.match(fm[1], new RegExp(`^name: ${name}$`, "m"));
    assert.match(fm[1], /^description: \S/m);
  }
  for (const file of filesUnder(root).filter((f) => f.endsWith(".md"))) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/`((?:skills|references|scripts)\/[^`\s]+\.(?:md|py))`/g)) {
      const rel = m[1];
      const candidates = rel.startsWith("skills/")
        ? [path.join(root, rel)]
        : [path.join(path.dirname(file), rel), path.join(path.dirname(file), "..", rel), path.join(root, "skills/jef-director", rel)];
      assert.ok(candidates.some((c) => statSync(c, { throwIfNoEntry: false })?.isFile()), `${rel} from ${file}`);
    }
  }
  assert.match(read("skills/jef-director/references/contrato.md"), /Revisão: 2026-11-12\.1/);
});

test("public repo scrub: plugin files and tests carry no Drive/Docs URLs, identifiers, emails, phones or personal names", () => {
  assert.deepEqual(scrubHits(path.join(root, "..")), []);
});

test("lume_check.py passes and fails as documented", () => {
  const script = path.join(root, "skills/jef-director/scripts/lume_check.py");
  const dir = mkdtempSync(path.join(tmpdir(), "lume-check-"));
  const run = (cmd, data) => {
    const input = path.join(dir, `${cmd}.json`);
    writeFileSync(input, JSON.stringify(data));
    return spawnSync("python3", ["-I", script, cmd, input], { encoding: "utf8" });
  };
  const good = {
    documents: [{ id: "1", status: "lido", gaps: [] }, { id: "2", status: "parcial", gaps: ["p3"] }],
    total_parts: 2,
    parts: [{ number: 1, ids: ["1"] }, { number: 2, ids: ["2"] }],
  };
  const ok = run("package", good);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /PASS/);
  const bad = run("package", { ...good, parts: [{ number: 1, ids: ["1"] }] });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /FAIL/);
  const loc = run("locators", {
    documents: [{ id: "1", pages: [{ pdf_page: 1, text: "texto literal da página" }] }],
    references: [{ id: "1", pdf_page: 1, quote: "texto literal" }],
  });
  assert.equal(loc.status, 0, loc.stdout + loc.stderr);
  const noQuote = run("locators", {
    documents: [{ id: "1", pages: [{ pdf_page: 1, text: "texto" }] }],
    references: [{ id: "1", pdf_page: 1, quote: "ausente" }],
  });
  assert.equal(noQuote.status, 1);
  const cp = path.join(dir, "state.json");
  const state = { schema: "lume-checkpoint/1", case_id: "c", version: 1, source_revisions: { a: "h" }, stage: "s", pending: [], completed: [] };
  const input = path.join(dir, "cp.json");
  writeFileSync(input, JSON.stringify(state));
  const first = spawnSync("python3", ["-I", script, "checkpoint", input, "--output", cp, "--expected-version", "0"], { encoding: "utf8" });
  assert.equal(first.status, 0, first.stdout + first.stderr);
  const repeat = spawnSync("python3", ["-I", script, "checkpoint", input, "--output", cp, "--expected-version", "0"], { encoding: "utf8" });
  assert.equal(repeat.status, 1, "stale expected version must be rejected");
  assert.equal(JSON.parse(readFileSync(cp, "utf8")).version, 1);
});

test("the existing PJe plugin is untouched by this package", () => {
  const jef = JSON.parse(readFileSync(path.join(root, "..", "lume-jef", "plugin.json"), "utf8"));
  assert.equal(jef.name, "lume-jef");
  assert.equal(jef.version, "0.2.0");
  assert.match(readFileSync(path.join(root, "..", "lume-jef", "skills/jef-work/SKILL.md"), "utf8"), /#lume-estudar/);
});
