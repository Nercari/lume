// Emits dist/, a directory that Chrome loads with "Load unpacked".
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'src');
const dist = join(root, 'dist');
const INLINE = ['sanitize.js', 'calibrate.js', 'profile.js', 'core.js'];

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
copyFileSync(join(root, 'manifest.json'), join(dist, 'manifest.json'));

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

for (const file of walk(src)) {
  const rel = relative(src, file);
  const dest = join(dist, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(file, dest);
}

function toClassic(source) {
  return source
    .replace(/^import\s+[\s\S]*?;[ \t]*$/gm, '')
    .replace(/^export\s+(?=(?:async\s+)?(?:function|const|class|let|var)\b)/gm, '');
}

const bundled = [...INLINE.map((name) => toClassic(readFileSync(join(src, name), 'utf8'))), toClassic(readFileSync(join(src, 'content.js'), 'utf8'))];
writeFileSync(join(dist, 'content.js'), `(() => {\n'use strict';\n${bundled.join('\n')}\n})();\n`);

const m = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const refs = [m.background.service_worker, m.side_panel.default_path, ...m.content_scripts.flatMap((c) => c.js)];
for (const f of refs) if (!existsSync(join(dist, f))) throw new Error(`manifest references missing file ${f}`);
for (const file of walk(dist)) if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file]);
console.log(`build: dist/ ready (${refs.length} manifest refs ok)`);
