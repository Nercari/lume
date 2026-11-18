import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "lume-jef");
const refPath = path.join(root, "skills", "jef-pacote", "references", "formato.md");

test("formato.md is the shared reader contract", async () => {
  const reference = await readFile(refPath, "utf8");
  assert.match(reference, /lume-caso\/1/);
  assert.match(reference, /botao/);
  assert.match(reference, /work/);
  assert.match(reference, /idênticas/);
  assert.match(reference, /mesmo tratamento/);
  assert.match(reference, /#lume-estudar/);
  assert.match(reference, /#lume-autos/);
  assert.match(reference, /Lume: pronto · N docs · L lacunas · parte 1 de T/);
  assert.match(reference, /Lume: falhou/);
  assert.match(reference, /Págs\. do documento/);
  assert.match(reference, /\[ID X\]/);
  assert.match(reference, /\[ID X, pág\. Y\]/);
  assert.match(reference, /não lacuna/);
  assert.match(reference, /pág\. PDF/);
  assert.match(reference, /imagem_sem_texto/);
  assert.match(reference, /ilegivel/);
  assert.match(reference, /binario/);
  assert.match(reference, /falha_busca/);
  assert.match(reference, /350[\s.]?000/);
  assert.match(reference, /Ids:/);
  assert.equal(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/.test(reference), false);
});
