// Emits dist/, a directory that Chrome loads with "Load unpacked".
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'src');
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);

copyFileSync(join(root, 'manifest.json'), join(dist, 'manifest.json'));
for (const f of ['core.js', 'worker.js', 'panel.html', 'panel.js']) copyFileSync(join(src, f), join(dist, f));
// Static content scripts cannot be ES modules, so inline core.js without its export keywords.
const core = readFileSync(join(src, 'core.js'), 'utf8').replace(/^export /gm, '');
writeFileSync(join(dist, 'content.js'), `(() => {\n${core}\n${readFileSync(join(src, 'content.js'), 'utf8')}\n})();\n`);

const m = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const refs = [m.background.service_worker, m.side_panel.default_path, ...m.content_scripts.flatMap((c) => c.js)];
for (const f of refs) if (!existsSync(join(dist, f))) throw new Error(`manifest references missing file ${f}`);
for (const f of ['content.js', 'worker.js', 'panel.js', 'core.js']) execFileSync(process.execPath, ['--check', join(dist, f)]);
console.log(`build: dist/ ready (${refs.length} manifest refs ok)`);
