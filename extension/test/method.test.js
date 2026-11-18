import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { stageMethod } from '../scripts/stage-method.mjs';

function filesUnder(dir, rel = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const child = rel ? join(rel, name) : name;
    if (statSync(abs).isDirectory()) out.push(...filesUnder(abs, child));
    else out.push(child);
  }
  return out.sort();
}

test('dist/metodo is a byte copy of the flattened plugin method', async () => {
  const dest = mkdtempSync(join(tmpdir(), 'lume-metodo-'));
  try {
    const staged = await stageMethod(dest);
    const fromPlugin = filesUnder(staged.projectDir);
    const copied = filesUnder(dest);
    assert.deepEqual(copied, fromPlugin);
    assert.ok(copied.includes('jef-director.md'));
    assert.ok(copied.includes('jef-pacote.md'));
    assert.ok(copied.includes('jef-relatorio.md'));
    assert.ok(copied.includes('jef-voto.md'));
    assert.ok(copied.includes('jef-revisao.md'));
    for (const name of copied) {
      const left = readFileSync(join(staged.projectDir, name));
      const right = readFileSync(join(dest, name));
      assert.equal(left.equals(right), true, name);
    }
  } finally {
    rmSync(dest, { recursive: true, force: true });
  }
});

test('the extension source holds none of the method text', () => {
  const root = new URL('..', import.meta.url).pathname;
  const needleFile = join(root, '../plugins/lume-jef/skills/jef-relatorio/references/c4.md');
  const needle = readFileSync(needleFile, 'utf8').trim().slice(0, 180);
  assert.ok(needle.length >= 80);
  const src = join(root, 'src');
  for (const name of filesUnder(src)) {
    const text = readFileSync(join(src, name), 'utf8');
    assert.equal(text.includes(needle), false, name);
    assert.equal(name.startsWith('jef-'), false, name);
  }
  assert.equal(relative(root, needleFile).includes('extension'), false);
});
