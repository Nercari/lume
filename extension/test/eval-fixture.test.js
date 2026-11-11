import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { caseSpecs, expectationOf, fixtureDocs, writeCase } from '../scripts/eval-fixture.mjs';

test('the generator builds three cases with every required document kind, the same bytes twice', () => {
  const first = caseSpecs();
  const second = caseSpecs();
  assert.equal(first.length, 3);
  const ids = new Set();
  for (let index = 0; index < first.length; index += 1) {
    const spec = first[index];
    assert.ok(spec.docs.length >= 8, `${spec.id} has ${spec.docs.length} documents`);
    const kinds = new Set(spec.docs.map((doc) => doc.kind));
    for (const kind of ['html', 'pdf-text', 'png-scan', 'pdf-scan', 'html-sigilo', 'restricted', 'corrupt']) {
      assert.ok(kinds.has(kind), `${spec.id} has no ${kind}`);
    }
    assert.equal(spec.docs.filter((doc) => doc.sigilo).length, 1);
    assert.equal(spec.docs.filter((doc) => doc.status === 403).length, 1);
    assert.equal(spec.docs.find((doc) => doc.kind === 'pdf-scan').ocrPages, 2);
    for (const doc of spec.docs) {
      assert.equal(ids.has(doc.id), false, `${doc.id} appears twice`);
      ids.add(doc.id);
      assert.equal(second[index].docs.find((other) => other.id === doc.id).bytes.equals(doc.bytes), true);
    }
  }
});

test('the fixture folder carries every byte and the expected state per document', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lume-eval-fixture-'));
  try {
    const spec = caseSpecs()[0];
    await writeCase(join(dir, spec.id), spec);
    const names = await readdir(join(dir, spec.id));
    assert.ok(names.includes('expected.json'));
    assert.ok(names.includes(`${spec.docs[0].id}.html`));
    assert.ok(names.includes(`${spec.docs[3].id}.png`));
    assert.ok(names.includes(`${spec.docs[7].id}.bin`));
    const expected = JSON.parse(await readFile(join(dir, spec.id, 'expected.json'), 'utf8'));
    assert.deepEqual(expected, expectationOf(spec));
    assert.equal(expected.documents.length, spec.docs.length);
    for (const doc of expected.documents) assert.ok(['readable', 'restricted', 'corrupt'].includes(doc.state));
    assert.equal(fixtureDocs(spec).length, spec.docs.length);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
