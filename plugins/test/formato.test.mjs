import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "lume-jef");
const skillPath = path.join(root, "skills", "jef-pacote", "SKILL.md");
const refPath = path.join(root, "skills", "jef-pacote", "references", "formato.md");

test("jef-pacote points at the shared case format", async () => {
  const skill = await readFile(skillPath, "utf8");
  const reference = await readFile(refPath, "utf8");
  assert.match(skill, /`references\/formato\.md`/);
  assert.equal(skill.split("\n").filter((line) => line.includes("references/formato.md")).length, 1);
  assert.match(reference, /lume-caso\/1/);
  assert.match(reference, /botao/);
  assert.match(reference, /work/);
  assert.match(reference, /Págs\. do documento/);
  assert.match(reference, /\[ID X, pág\. Y\]/);
  assert.match(reference, /pág\. PDF/);
  assert.match(reference, /imagem_sem_texto/);
  assert.match(reference, /ilegivel/);
  assert.match(reference, /binario/);
  assert.match(reference, /falha_busca/);
  assert.match(reference, /350[\s.]?000/);
  assert.match(reference, /Ids:/);
  assert.match(reference, /mesmo tratamento/);
  assert.equal(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/.test(reference), false);
});
