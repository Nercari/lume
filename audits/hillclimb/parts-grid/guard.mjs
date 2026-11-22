// Guard for the parts grid climb: the public contract of manual/src/parts.js and pack.js must not move.
// Offline, invented inputs, exits 0 or throws. Locked with the check.
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeCase } from "./check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const load = (f) => import(pathToFileURL(path.join(root, "manual/src", f)).href);
const { buildCasePack } = await load("pack.js");
const P = await load("parts.js");

assert.equal(P.DEFAULT_PACK_PART_MAX_CHARS, 350_000);
for (const name of ["buildCasePackParts", "extractPassagesFromPack", "extractPassagesFromPartText", "partFileName"]) assert.equal(typeof P[name], "function", name);
assert.equal(P.partFileName(1, 3), "lume-caso-parte-01-de-03.md");
assert.equal(P.partFileName(12, 12), "lume-caso-parte-12-de-12.md");

// A small case stays one part at the default size, and its passages equal the single pack exactly (no normalizing).
for (const docs of [1, 3, 8]) {
  const r = makeCase(docs, 200, false);
  const parts = P.buildCasePackParts(r);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].name, "lume-caso-parte-01-de-01.md");
  assert.ok(parts[0].text.length <= P.DEFAULT_PACK_PART_MAX_CHARS);
  assert.match(parts[0].text, /Pacote do caso — parte 1 de 1/);
  assert.match(parts[0].text, /FIM DA PARTE 1 DE 1\s*$/);
  assert.equal(P.extractPassagesFromPartText(parts[0].text), P.extractPassagesFromPack(buildCasePack(r)));
}

// Several whole documents that fit: split at document boundaries, exact join, no continuation tag.
{
  const r = makeCase(8, 4000, false);
  const parts = P.buildCasePackParts(r, { maxChars: 12000 });
  assert.ok(parts.length > 1);
  assert.equal(parts.map((p) => P.extractPassagesFromPartText(p.text)).join("\n\n"), P.extractPassagesFromPack(buildCasePack(r)));
  assert.ok(parts.every((p) => !p.text.includes("(continuação)")));
}

// The pack itself is untouched by the climb: same call, same bytes twice.
{
  const r = makeCase(5, 900, true);
  assert.equal(buildCasePack(r), buildCasePack(r));
  assert.deepEqual(P.buildCasePackParts(r, { maxChars: 5000 }), P.buildCasePackParts(r, { maxChars: 5000 }));
}
console.log("parts-grid guard: ok");
