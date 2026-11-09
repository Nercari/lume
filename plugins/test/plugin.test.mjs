import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import path from "node:path";
import test from "node:test";
import { buildZip, pluginRoot, zipNames } from "../scripts/build-zip.mjs";
import { renderLogo, writeLogo } from "../scripts/render-logo.mjs";

await writeLogo();

const root = pluginRoot;
const expectedSkills = [
  "jef-director",
  "jef-triagem",
  "jef-relatorio",
  "jef-pesquisa",
  "jef-voto",
  "jef-materias",
  "jef-revisao",
  "jef-pacote",
  "jef-lote",
  "jef-estilo",
  "jef-inicio",
];

async function filesUnder(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await filesUnder(abs)));
    else if (entry.isFile()) out.push(abs);
  }
  return out;
}

function frontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(match, "missing frontmatter");
  const fields = {};
  const body = match[1].replace(/\n[ \t]+/g, " ");
  for (const line of body.split("\n")) {
    const cut = line.indexOf(":");
    if (cut === -1) continue;
    const key = line.slice(0, cut).trim();
    let value = line.slice(cut + 1).trim();
    if (value === ">" || value === ">-" || value === "|") continue;
    value = value.replace(/^["']|["']$/g, "");
    if (fields[key] === undefined) fields[key] = value;
    else fields[key] += ` ${value}`;
  }
  return fields;
}

function skillOf(file) {
  const rel = path.relative(root, file).split(path.sep).join("/");
  const match = rel.match(/^skills\/([^/]+)\//);
  return match ? match[1] : null;
}

test("manifest fields and lengths", async () => {
  const manifest = JSON.parse(await readFile(path.join(root, "plugin.json"), "utf8"));
  assert.equal(
    manifest.$schema,
    "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  );
  assert.equal(manifest.name, "lume-jef");
  assert.equal(manifest.version, "0.1.0");
  assert.equal(manifest.license, "MIT");
  assert.equal(manifest.extensions["com.openai"].hooks, undefined);
  assert.equal(manifest.extensions["com.openai"].apps, undefined);
  assert.equal(manifest.hooks, undefined);
  assert.equal(manifest.apps, undefined);
  const ui = manifest.extensions["com.openai"].interface;
  assert.equal(ui.displayName, "Lume JEF");
  assert.ok(ui.displayName.length <= 30);
  assert.ok(ui.shortDescription.length > 0 && ui.shortDescription.length <= 30);
  assert.match(ui.longDescription, /não|processo|minuta/i);
  assert.ok(ui.longDescription.length <= 4000);
  assert.equal(ui.developerName, "Nercari");
  assert.equal(ui.category, "Productivity");
  assert.ok(Array.isArray(ui.defaultPrompt));
  assert.ok(ui.defaultPrompt.length >= 1 && ui.defaultPrompt.length <= 3);
  assert.equal(new Set(ui.defaultPrompt).size, ui.defaultPrompt.length);
  for (const prompt of ui.defaultPrompt) {
    assert.ok(prompt.length <= 128);
    assert.equal(prompt.includes("@"), false);
  }
  assert.equal(
    manifest.extensions["com.openai"].onboardingSkill,
    "./skills/jef-inicio/SKILL.md",
  );
  for (const rel of [ui.logo, ui.composerIcon, "./skills/jef-inicio/SKILL.md"]) {
    const abs = path.join(root, rel.replace(/^\.\//, ""));
    const info = await stat(abs);
    assert.ok(info.isFile(), rel);
  }
  await assert.rejects(stat(path.join(root, "mcp.json")));
  await assert.rejects(stat(path.join(root, "hooks")));
});

test("every skill has name and description", async () => {
  const dirs = await readdir(path.join(root, "skills"), { withFileTypes: true });
  const names = dirs.filter((d) => d.isDirectory()).map((d) => d.name).sort();
  assert.deepEqual(names, [...expectedSkills].sort());
  for (const name of names) {
    const text = await readFile(path.join(root, "skills", name, "SKILL.md"), "utf8");
    const fields = frontmatter(text);
    assert.equal(fields.name, name);
    assert.ok(fields.description && fields.description.length > 20);
  }
});

test("every referenced file exists", async () => {
  const texts = (await filesUnder(root)).filter((file) => file.endsWith(".md"));
  for (const file of texts) {
    const text = await readFile(file, "utf8");
    const skill = skillOf(file);
    for (const match of text.matchAll(/`((?:skills|references)\/[^`]+)`/g)) {
      const rel = match[1];
      const abs = rel.startsWith("skills/")
        ? path.join(root, rel)
        : path.join(root, "skills", skill, rel);
      const info = await stat(abs);
      assert.ok(info.isFile(), `${rel} from ${file}`);
    }
  }
});

test("scrub forbids drive urls, maintenance ids, and identifiers", async () => {
  const needles = ["drive.google.com", "msg_idx"];
  const patterns = [
    { name: "cpf", re: /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/ },
    { name: "cnpj", re: /\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/ },
    { name: "cnj", re: /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/ },
    { name: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  ];
  for (const file of await filesUnder(root)) {
    const buf = await readFile(file);
    const raw = buf.toString("latin1");
    for (const needle of needles) {
      assert.equal(raw.includes(needle), false, `${needle} in ${file}`);
    }
    if (/\.(md|json)$/.test(file) || path.basename(file) === "LICENSE") {
      const text = buf.toString("utf8");
      for (const pattern of patterns) {
        assert.equal(pattern.re.test(text), false, `${pattern.name} in ${file}`);
      }
    }
  }
});

test("published method keeps modules and drops maintenance", async () => {
  const joined = (
    await Promise.all(
      (await filesUnder(root))
        .filter((file) => file.endsWith(".md"))
        .map((file) => readFile(file, "utf8")),
    )
  ).join("\n");
  assert.match(joined, /ACTIVE_CONTRACT=JEF-WORKFLOW-v1/);
  assert.match(joined, /CONTRACT_REVISION=2026-11-04\.4/);
  assert.match(joined, /VOTE_FORMAT_VERSION=JEF-V1/);
  assert.match(joined, /IDP-001/);
  assert.match(joined, /### C3\.1\./);
  assert.match(joined, /### C6\.6\./);
  assert.match(joined, /FMT-001/);
  assert.match(joined, /Nunca extrair fatos de exemplos de outros casos/);
  assert.equal(joined.includes("## C9."), false);
  assert.equal(joined.includes("## C10."), false);
  assert.equal(joined.includes("## 16. Changelog"), false);
  assert.equal(joined.includes("## 18. Maintenance"), false);
  assert.match(await readFile(path.join(root, "skills/jef-director/references/contrato.md"), "utf8"), /## 17\. /);
  assert.equal(/\bDUO\b/.test(joined), false);
});

test("vision reads a page image and the plugin does not OCR", async () => {
  const pacote = await readFile(path.join(root, "skills/jef-pacote/SKILL.md"), "utf8");
  assert.match(pacote, /lido por visão/);
  assert.match(pacote, /\[ID X, pág\. Y\]/);
  assert.match(pacote, /imagem sem texto/);
  assert.match(pacote, /Tesseract/);
  assert.match(pacote, /sandbox Python/);
  assert.match(pacote, /nunca adivinhado/);
  const leia = await readFile(path.join(root, "LEIA-ME.md"), "utf8");
  const steps = leia.split("\n").filter((line) => /^\d+\.\s/.test(line));
  assert.ok(steps.length > 0 && steps.length <= 3, steps.join(" | "));
  for (const file of await filesUnder(root)) {
    assert.equal(file.endsWith(".py"), false, file);
    const raw = (await readFile(file)).toString("latin1").toLowerCase();
    assert.equal(/pytesseract|apt(?:-get)? install tesseract|pip install/.test(raw), false, file);
  }
});

test("logo is a generated 512 square png", async () => {
  const bytes = renderLogo();
  const onDisk = await readFile(path.join(root, "assets/logo.png"));
  assert.deepEqual(onDisk, bytes);
  assert.ok(bytes.length < 5 * 1024 * 1024);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(bytes.readUInt32BE(16), 512);
  assert.equal(bytes.readUInt32BE(20), 512);
  const idatStart = bytes.indexOf(Buffer.from("IDAT"));
  const length = bytes.readUInt32BE(idatStart - 4);
  const inflated = inflateSync(bytes.subarray(idatStart + 4, idatStart + 4 + length));
  assert.equal(inflated.length, 512 * (1 + 512 * 3));
});

test("tree size stays small and the zip builds in order", async () => {
  let total = 0;
  for (const file of await filesUnder(root)) {
    total += (await stat(file)).size;
  }
  assert.ok(total > 50_000 && total < 1_500_000, `tree ${total}`);
  const first = await buildZip();
  const second = await buildZip();
  assert.deepEqual(first.bytes, second.bytes);
  assert.deepEqual(zipNames(first.bytes), first.names);
  const sorted = [...first.names].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  assert.deepEqual(first.names, sorted);
  assert.equal(first.names[0] < first.names.at(-1), true);
  assert.ok(first.names.includes("plugin.json"));
  assert.ok(first.names.includes("assets/logo.png"));
  assert.equal(first.names.some((name) => name.includes("mcp.json")), false);
  assert.ok(first.bytes.length > 10_000 && first.bytes.length < 2_000_000);
});
