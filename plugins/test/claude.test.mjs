import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { OUT, SRC, build } from "../scripts/build-lume-claude.mjs";
import { scrubHits } from "./scrub.mjs";

const plugins = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const rel = (d) => walk(d).map((f) => path.relative(d, f).split(path.sep).join("/")).sort();

test("committed lume-claude equals a fresh build from lume-workspace", () => {
  const built = build();
  assert.deepEqual(rel(OUT), [...built.keys()].sort());
  for (const [f, d] of built) assert.ok(readFileSync(path.join(OUT, f)).equals(d), f);
});

test("scripts and references stay identical to the source, except documented edits", () => {
  const edited = new Set(["skills/jef-director/references/tools.md", "skills/jef-director/references/profiles.md", "skills/jef-voto/references/jef-v1.md"]);
  for (const f of rel(SRC).filter((f) => /\/(scripts|references)\//.test(f) && !edited.has(f))) {
    assert.ok(readFileSync(path.join(SRC, f)).equals(readFileSync(path.join(OUT, f))), f);
  }
});

test("manifest is minimal and the plugin has no MCP, hooks or bin/", () => {
  const m = JSON.parse(readFileSync(path.join(OUT, ".claude-plugin/plugin.json"), "utf8"));
  const src = JSON.parse(readFileSync(path.join(SRC, "plugin.json"), "utf8"));
  assert.equal(m.name, "lume");
  assert.equal(m.version, src.version);
  assert.equal(m.author.name, "Nercari");
  for (const f of ["bin", "hooks", ".mcp.json", "mcp.json", ".codex-plugin"]) assert.ok(!existsSync(path.join(OUT, f)), f);
});

test("Chat target: each skill is self-contained, with SKILL.md-relative paths and no ${CLAUDE_*} variables", () => {
  const skills = readdirSync(path.join(OUT, "skills"));
  assert.equal(skills.length, 12);
  for (const s of skills) {
    const dir = path.join(OUT, "skills", s);
    const text = readFileSync(path.join(dir, "SKILL.md"), "utf8");
    assert.equal(text.match(/^name: (.+)$/m)?.[1], s);
    assert.match(s, /^[a-z0-9-]{1,64}$/);
    assert.match(text, /^description: ".{1,1022}"$/m);
    assert.ok(text.split("\n").length < 500, `${s}: SKILL.md too long`);
    assert.doesNotMatch(text, /skills\.read|catálogo com/);
    for (const f of rel(dir)) {
      if (!/\.(md|py)$/.test(f)) continue;
      const body = readFileSync(path.join(dir, f), "utf8");
      assert.doesNotMatch(body, /\$\{CLAUDE_|(?<![\w/-])skills\/jef-/, `${s}/${f}: Code-only variable or cross-skill path`);
      for (const [, p] of body.matchAll(/(?<![\w/.-])((?:references|scripts)\/[A-Za-z0-9_.-]+\.(?:md|py))/g)) assert.ok(existsSync(path.join(dir, p)), `${s}/${f}: ${p} missing in the skill folder`);
    }
  }
});

test("Chat target: every C<n> label, contrato and jef-director citation resolves inside the same skill folder", () => {
  for (const s of readdirSync(path.join(OUT, "skills"))) {
    const dir = path.join(OUT, "skills", s);
    const text = rel(dir).filter((f) => /\.(md|py)$/.test(f)).map((f) => readFileSync(path.join(dir, f), "utf8")).join("\n");
    for (const [, n] of text.matchAll(/(?<![\w-])C([0-8])(?![\w-])/g)) assert.ok(existsSync(path.join(dir, `references/c${n}.md`)), `${s}: C${n} cited, c${n}.md missing`);
    if (/contrato|jef-director/i.test(text)) assert.ok(existsSync(path.join(dir, "references/contrato.md")), `${s}: contrato.md missing`);
    if (/perfil|perfis/i.test(text)) assert.ok(existsSync(path.join(dir, "references/profiles.md")), `${s}: profiles.md missing`);
    assert.doesNotMatch(text, /`skill `|ChatGPT/, `${s}: malformed edit or ChatGPT mention`);
  }
});

test("tools.md carries the sandbox preflight and the profile note keeps Chat persistence honest", () => {
  const tools = readFileSync(path.join(OUT, "skills/jef-pacote/references/tools.md"), "utf8");
  assert.match(tools, /import pypdf/);
  assert.match(tools, /which pdftoppm tesseract/);
  assert.match(readFileSync(path.join(OUT, "skills/jef-estilo/references/profiles.md"), "utf8"), /nada é salvo automaticamente/);
});

test("upload limits: at most 5000 files and 200 MB, one .claude-plugin/plugin.json, no bin/", () => {
  const files = walk(OUT);
  assert.ok(files.length <= 5000);
  assert.ok(files.reduce((n, f) => n + readFileSync(f).length, 0) < 200 * 1024 * 1024);
  assert.ok(files.every((f) => readFileSync(f).length < 200 * 1024 * 1024));
  assert.equal(rel(OUT).filter((f) => f.endsWith("plugin.json")).join(), ".claude-plugin/plugin.json");
  assert.ok(!existsSync(path.join(OUT, "bin")));
});

test("lume-claude passes the public scrub", () => {
  assert.deepEqual(scrubHits(plugins), []);
});

test("claude plugin validate --strict passes when the CLI is installed", (t) => {
  const r = spawnSync("claude", ["plugin", "validate", OUT, "--strict"], { encoding: "utf8", env: { ...process.env, HOME: mkdtempSync(path.join(os.tmpdir(), "lume-home-")) } });
  if (r.error?.code === "ENOENT") return t.skip("claude CLI not installed");
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
