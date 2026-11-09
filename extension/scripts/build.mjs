// Emits dist/, a directory that Chrome loads with "Load unpacked".
// The offline PDF page is the manual package's dist, copied under dist/manual/.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const src = join(root, 'src');
const dist = join(root, 'dist');
const manualDist = join(root, '..', 'manual', 'dist');
const MANUAL_FILES = ['lume-pdf.html', 'lume-pdf.js', 'pdf.worker.mjs'];
const INLINE = ['sanitize.js', 'url-rules.js', 'timeline.js', 'chunks.js', 'calibrate.js', 'profile.js', 'core.js', 'collect.js'];
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

cpSync(manualDist, join(dist, 'manual'), { recursive: true });
if (!manualReady(join(dist, 'manual'))) throw new Error('failed to copy manual/dist into dist/manual');

const requireManual = createRequire(join(root, '../manual/package.json'));
const esbuild = requireManual('esbuild');
await esbuild.build({
  entryPoints: [join(src, 'study.js')],
  bundle: true,
  format: 'esm',
  outfile: join(dist, 'study.js'),
  platform: 'browser',
  target: ['es2022'],
  legalComments: 'none',
  logLevel: 'warning',
  plugins: [
    {
      name: 'no-ocr-cdn',
      setup(build) {
        build.onLoad({ filter: /node_modules\/tesseract\.js\/.*\.js$/ }, (args) => {
          const source = readFileSync(args.path, 'utf8');
          if (!source.includes('https://cdn.jsdelivr.net/npm/')) return null;
          return { contents: source.replaceAll('https://cdn.jsdelivr.net/npm/', './'), loader: 'js' };
        });
      },
    },
  ],
});
function dropRemoteOcrUrls(file) {
  const text = readFileSync(file, 'utf8');
  const next = text
    .replaceAll('https://cdn.jsdelivr.net/npm/', './')
    .replaceAll('https://ocr.invalid/npm/', './');
  if (next !== text) writeFileSync(file, next);
}
for (const rel of ['study.js', 'manual/lume-pdf.js', 'manual/ocr/worker.min.js']) dropRemoteOcrUrls(join(dist, rel));
const bundledStudy = readFileSync(join(dist, 'study.js'), 'utf8');
if (/https?:\/\/[^'"\s]*?(?:jsdelivr\.net|unpkg\.com|tesseract\.js@|tesseract\.js-core@|traineddata)/i.test(bundledStudy)) {
  throw new Error('study.js still points a tesseract asset at a remote URL');
}

const m = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const refs = [m.background.service_worker, m.side_panel.default_path, ...m.content_scripts.flatMap((c) => c.js)];
for (const f of refs) if (!existsSync(join(dist, f))) throw new Error(`manifest references missing file ${f}`);
for (const file of walk(dist)) if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', file]);
console.log(`build: dist/ ready (${refs.length} manifest refs ok, manual/lume-pdf.html)`);
