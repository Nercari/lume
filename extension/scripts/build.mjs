// Emits dist/, a directory that Chrome loads with "Load unpacked".
// The offline PDF page is the manual package's dist, copied under dist/manual/.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'src');
const dist = join(root, 'dist');
const manualDist = join(root, '..', 'manual', 'dist');
const MANUAL_FILES = ['lume-pdf.html', 'lume-pdf.js', 'pdf.worker.mjs'];
// Run from the extension directory when manual/dist is not already built.
const MANUAL_BUILD = 'npm --prefix ../manual ci && npm --prefix ../manual run build';

function manualReady(dir) {
  return MANUAL_FILES.every((f) => existsSync(join(dir, f)));
}

function ensureManualDist() {
  if (manualReady(manualDist)) return;
  const manualRoot = join(root, '..', 'manual');
  try {
    execFileSync('npm', ['--prefix', manualRoot, 'ci'], { stdio: 'inherit' });
    execFileSync('npm', ['--prefix', manualRoot, 'run', 'build'], { stdio: 'inherit' });
  } catch (err) {
    throw new Error(`manual/dist is missing and the manual package build failed (${err.message}). From the extension directory run: ${MANUAL_BUILD}`);
  }
  if (!manualReady(manualDist)) {
    throw new Error(`manual/dist is missing ${MANUAL_FILES.join(', ')}. From the extension directory run: ${MANUAL_BUILD}`);
  }
}

ensureManualDist();
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);

copyFileSync(join(root, 'manifest.json'), join(dist, 'manifest.json'));
for (const f of ['core.js', 'worker.js', 'panel.html', 'panel.js']) copyFileSync(join(src, f), join(dist, f));
// Static content scripts cannot be ES modules, so inline core.js without its export keywords.
const core = readFileSync(join(src, 'core.js'), 'utf8').replace(/^export /gm, '');
writeFileSync(join(dist, 'content.js'), `(() => {\n${core}\n${readFileSync(join(src, 'content.js'), 'utf8')}\n})();\n`);

cpSync(manualDist, join(dist, 'manual'), { recursive: true });
if (!manualReady(join(dist, 'manual'))) throw new Error('failed to copy manual/dist into dist/manual');

const m = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const refs = [m.background.service_worker, m.side_panel.default_path, ...m.content_scripts.flatMap((c) => c.js)];
for (const f of refs) if (!existsSync(join(dist, f))) throw new Error(`manifest references missing file ${f}`);
for (const f of ['content.js', 'worker.js', 'panel.js', 'core.js']) execFileSync(process.execPath, ['--check', join(dist, f)]);
console.log(`build: dist/ ready (${refs.length} manifest refs ok, manual/lume-pdf.html)`);
