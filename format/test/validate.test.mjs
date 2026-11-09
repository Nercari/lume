import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PART_MAX_CHARS, validateDir, validateSet } from "../src/validate.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const validDir = path.join(here, "fixtures", "valid");
const cli = path.join(here, "..", "src", "validate.mjs");
const forbidden = ["TRECHO-SYN", "PROC-SYN", "ORGAO-SYN", "D1", "D2", "D3", "petição"];

async function copyValid() {
  const dir = await mkdtemp(path.join(tmpdir(), "lume-caso-"));
  for (const name of await readdir(validDir)) {
    await writeFile(path.join(dir, name), await readFile(path.join(validDir, name)));
  }
  return dir;
}

async function edit(dir, name, change) {
  const file = path.join(dir, name);
  const text = await readFile(file, "utf8");
  await writeFile(file, change(text));
}

function codes(report) {
  return report.errors.map((error) => error.code);
}

test("valid part set and sidecar", async () => {
  const report = await validateDir(validDir);
  assert.equal(report.ok, true);
  assert.deepEqual(report.counts, { parts: 2, ids: 3, tags: 2, gaps: 2, errors: 0 });
  assert.deepEqual(report.errors, []);
});

test("valid without the sidecar", async () => {
  const dir = await copyValid();
  try {
    await rm(path.join(dir, "lume-caso.json"));
    const report = await validateDir(dir);
    assert.equal(report.ok, true);
    assert.equal(report.counts.parts, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("origem work is the same shape", async () => {
  const dir = await copyValid();
  try {
    for (const name of await readdir(dir)) {
      await edit(dir, name, (text) => text.replaceAll("botao", "work"));
    }
    const report = await validateDir(dir);
    assert.equal(report.ok, true, JSON.stringify(report));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("broken version marker", async () => {
  const dir = await copyValid();
  try {
    for (const name of await readdir(dir)) {
      await edit(dir, name, (text) => text.replaceAll("lume-caso/1", "lume-caso/0"));
    }
    const report = await validateDir(dir);
    assert.equal(report.ok, false);
    assert.ok(codes(report).includes("version"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("broken contiguous parts", async () => {
  const dir = await copyValid();
  try {
    await rm(path.join(dir, "lume-caso.json"));
    for (const name of ["lume-caso-parte-01-de-02.md", "lume-caso-parte-02-de-02.md"]) {
      const next = name.replace("de-02", "de-03");
      const text = (await readFile(path.join(dir, name), "utf8"))
        .replaceAll("total: 2", "total: 3")
        .replaceAll("Parte 1 de 2", "Parte 1 de 3")
        .replaceAll("Parte 2 de 2", "Parte 2 de 3");
      await writeFile(path.join(dir, next), text);
      await rm(path.join(dir, name));
    }
    const report = await validateDir(dir);
    assert.equal(report.ok, false);
    assert.deepEqual(codes(report), ["parts_contiguous"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("broken index id in more than one part", async () => {
  const dir = await copyValid();
  try {
    await rm(path.join(dir, "lume-caso.json"));
    await edit(dir, "lume-caso-parte-01-de-02.md", (text) => text
      .replace("ids: D1\n", "ids: D1, D2\n")
      .replace("Ids: D1\n", "Ids: D1, D2\n"));
    const report = await validateDir(dir);
    assert.equal(report.ok, false);
    assert.deepEqual(codes(report), ["index_id_once"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("broken tag refers to an id outside the index", async () => {
  const dir = await copyValid();
  try {
    for (const name of await readdir(dir)) {
      if (!name.endsWith(".md")) continue;
      await edit(dir, name, (text) => text.replace("2 trechos", "3 trechos"));
    }
    await edit(dir, "lume-caso-parte-01-de-02.md", (text) => `${text}[ID D9, pág. 1]\nTRECHO-SYN-Z\n`);
    const report = await validateDir(dir);
    assert.equal(report.ok, false);
    assert.deepEqual(codes(report), ["tag_unknown_id"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("broken estimated page marker", async () => {
  const dir = await copyValid();
  try {
    await edit(dir, "lume-caso-parte-01-de-02.md", (text) => text.replace(
      "TRECHO-SYN-A\n",
      "TRECHO-SYN-A\nnota aprox. 1\n",
    ));
    const report = await validateDir(dir);
    assert.equal(report.ok, false);
    assert.deepEqual(codes(report), ["estimated_page"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("broken gaps not listed", async () => {
  const dir = await copyValid();
  try {
    await rm(path.join(dir, "lume-caso.json"));
    for (const name of await readdir(dir)) {
      await edit(dir, name, (text) => text.replace("2 lacunas", "0 lacunas"));
    }
    await edit(dir, "lume-caso-parte-01-de-02.md", (text) => text.replace(
      "- ID D2, pág. 2: ilegivel\n- ID D3: falha_busca\n",
      "- nenhuma\n",
    ));
    const report = await validateDir(dir);
    assert.equal(report.ok, false);
    assert.deepEqual(codes(report), ["gaps"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("two passages above the split cap fail", () => {
  assert.equal(PART_MAX_CHARS, 350000);
  const filler = "a".repeat(PART_MAX_CHARS);
  const text = `---
formato: lume-caso/1
processo: PROC-SYN-1
parte: 1
total: 1
ids: D1
origem: botao
---
lume-caso/1
Processo: PROC-SYN-1
Órgão: ORGAO-SYN
Gerado em: 2026-01-15T12:00:00Z
Origem: botao
Contagens: 1 documentos, 2 trechos, 0 lacunas

Parte 1 de 1
Ids: D1

Índice
ID | Tipo | Data | Págs. do documento | Situação
D1 | outros | — | 1, 2 | lido

Lacunas
- nenhuma

[ID D1, pág. 1]
${filler}
[ID D1, pág. 2]
b
`;
  const report = validateSet([{ name: "lume-caso-parte-01-de-01.md", text }]);
  assert.equal(report.ok, false);
  assert.ok(codes(report).includes("split"));
});

test("cli prints counts only", () => {
  const run = spawnSync(process.execPath, [cli, validDir], { encoding: "utf8" });
  assert.equal(run.status, 0);
  const report = JSON.parse(run.stdout);
  assert.equal(report.ok, true);
  assert.deepEqual(Object.keys(report).sort(), ["counts", "errors", "ok"]);
  assert.deepEqual(Object.keys(report.counts).sort(), ["errors", "gaps", "ids", "parts", "tags"]);
  for (const token of forbidden) assert.equal(run.stdout.includes(token), false, token);
  assert.equal(run.stderr, "");

  const missing = spawnSync(process.execPath, [cli, path.join(validDir, "nope")], { encoding: "utf8" });
  assert.equal(missing.status, 2);
  assert.equal(JSON.parse(missing.stdout).ok, false);

  const bad = spawnSync(process.execPath, [cli], { encoding: "utf8" });
  assert.equal(bad.status, 2);
});
