import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { buildPublic, forbidden, publicRoot } from "../scripts/build-public.mjs";
import { zipNames } from "../scripts/build-zip.mjs";

const built = await buildPublic();
const read = (rel) => readFile(path.join(publicRoot, rel), "utf8");
const texts = await Promise.all(
  built.names.filter((n) => /\.(md|json)$/.test(n) || n === "LICENSE").map(async (n) => [n, await read(n)]),
);

test("public zip is deterministic and lists every file", async () => {
  const again = await buildPublic();
  assert.deepEqual(again.bytes, built.bytes);
  assert.deepEqual(zipNames(built.bytes), built.names);
  assert.ok(built.bytes.length < 5 * 1024 * 1024);
});

test("public build carries no private style or installer", () => {
  for (const [name, text] of texts) {
    for (const needle of forbidden) assert.equal(text.includes(needle), false, `${needle} in ${name}`);
  }
  for (const name of built.names) {
    assert.equal(/^instalar\/|\.(cmd|ps1|py|sh|exe)$/.test(name), false, name);
    assert.equal(/(^|\/)(mcp\.json|\.mcp\.json|\.app\.json|hooks)(\/|$)/.test(name), false, name);
  }
});

test("public build carries no identifiers", () => {
  const patterns = [
    /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/,
    /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/,
    /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/,
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
    /drive\.google\.com|client_id|clientSecret|test_credentials|reviewer_instructions/,
  ];
  for (const [name, text] of texts) {
    for (const re of patterns) assert.equal(re.test(text), false, `${re} in ${name}`);
  }
});

test("manifest meets the directory listing limits", async () => {
  const manifest = JSON.parse(await read("plugin.json"));
  const openai = manifest.extensions["com.openai"];
  const ui = openai.interface;
  assert.equal(manifest.$schema, "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json");
  assert.match(manifest.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.equal(openai.apps, undefined);
  assert.equal(openai.hooks, undefined);
  assert.equal(openai.requires_local_executor, undefined);
  assert.ok(ui.displayName.length <= 30 && !/plugin|mcp/i.test(ui.displayName));
  assert.ok(ui.shortDescription.length <= 30);
  assert.ok(ui.longDescription.length <= 4000);
  assert.ok(ui.developerName.length <= 80);
  assert.ok(ui.category);
  assert.ok(ui.capabilities.length <= 20 && ui.capabilities.every((c) => c.length <= 120));
  for (const key of ["websiteURL", "supportURL", "privacyPolicyURL", "termsOfServiceURL"]) {
    assert.match(ui[key], /^https:\/\/[^@\s]+$/, key);
  }
  assert.ok(ui.defaultPrompt.length <= 3);
  assert.equal(new Set(ui.defaultPrompt).size, ui.defaultPrompt.length);
  for (const p of ui.defaultPrompt) assert.ok(p.length <= 128 && !p.includes("@"));
  assert.match(ui.brandColor, /^#[0-9A-F]{6}$/i);
  for (const rel of [ui.logo, ui.composerIcon, openai.onboardingSkill]) {
    assert.ok((await stat(path.join(publicRoot, rel))).isFile(), rel);
  }
  for (const [locale, t] of Object.entries(openai.publication.translations)) {
    assert.ok(t.subtitle.length <= 30 && !t.subtitle.includes("\n"), locale);
    assert.ok(t.description.length <= 4000 && !t.description.includes("\t"), locale);
  }
  assert.match(ui.longDescription, /not legal advice/);
});

test("every public skill has frontmatter and every referenced file exists", async () => {
  const skills = built.names.filter((n) => /^skills\/[^/]+\/SKILL\.md$/.test(n));
  assert.equal(skills.length, 12);
  for (const rel of skills) {
    const text = await read(rel);
    const dir = rel.split("/")[1];
    assert.match(text, new RegExp(`^---\\nname: ${dir}\\ndescription:`), rel);
  }
  for (const [name, text] of texts.filter(([n]) => n.endsWith(".md"))) {
    const skill = name.match(/^skills\/([^/]+)\//)?.[1];
    for (const m of text.matchAll(/`((?:skills|references)\/[^`]+)`/g)) {
      const rel = m[1].startsWith("skills/") ? m[1] : `skills/${skill}/${m[1]}`;
      assert.ok(built.names.includes(rel), `${m[1]} from ${name}`);
    }
  }
});
