#!/usr/bin/env node
// Assemble lume-install/ for Windows: extension + ChatGPT assets + copy-only installer. No network.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBundlePathAllowed } from './bundle-guards.mjs';
import { archiveBundleDir } from './bundle-zip.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGING = join(SCRIPT_DIR, '..');
const REPO = join(PACKAGING, '..');

const BUNDLE_TOP_LEVEL = Object.freeze(['extension', 'chatgpt', 'guias', 'windows', 'it', 'LICENSES']);

function parseArgs(argv) {
  const opts = { out: null, zip: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) opts.out = resolve(argv[++i]);
    else if (a === '--zip' && argv[i + 1]) opts.zip = resolve(argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node packaging/scripts/bundle.mjs --out <dir> [--zip <file.zip>]');
      process.exit(0);
    } else throw new Error(`unknown argument: ${a}`);
  }
  if (!opts.out) throw new Error('--out <dir> is required');
  return opts;
}

function assertAllowedCopy(rel, size) {
  assertBundlePathAllowed(rel, size);
}

function ensureExtensionDist() {
  const dist = join(REPO, 'extension/dist');
  if (existsSync(join(dist, 'manifest.json'))) return dist;
  execFileSync('npm', ['--prefix', join(REPO, 'extension'), 'run', 'build'], { stdio: 'inherit' });
  if (!existsSync(join(dist, 'manifest.json'))) throw new Error('extension/dist still missing after build');
  return dist;
}

function copyTree(srcRoot, destRoot, manifestLines, manifestPrefix = '') {
  const prefix = manifestPrefix ? (manifestPrefix.endsWith('/') ? manifestPrefix : `${manifestPrefix}/`) : '';
  function walk(src, dest, relBase) {
    for (const name of readdirSync(src)) {
      const srcPath = join(src, name);
      const rel = relBase ? `${relBase}/${name}` : name;
      const manifestPath = `${prefix}${rel}`.replace(/\/+/g, '/');
      const st = statSync(srcPath);
      assertAllowedCopy(manifestPath, st.size);
      const destPath = join(dest, name);
      if (st.isDirectory()) {
        mkdirSync(destPath, { recursive: true });
        walk(srcPath, destPath, rel);
      } else {
        mkdirSync(dirname(destPath), { recursive: true });
        copyFileSync(srcPath, destPath);
        const hash = createHash('sha256').update(readFileSync(destPath)).digest('hex');
        manifestLines.push(`${manifestPath}\t${hash}\t${st.size}`);
      }
    }
  }
  mkdirSync(destRoot, { recursive: true });
  walk(srcRoot, destRoot, '');
}

function buildPinHeader(outDir) {
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    /* not a git checkout */
  }
  const extManifest = JSON.parse(readFileSync(join(outDir, 'extension/manifest.json'), 'utf8'));
  const extensionId = process.env.LUME_EXTENSION_ID ?? 'odjfiioakpihgkikmjadmohgckkhkjhi';
  const built = new Date().toISOString().slice(0, 10);
  return [
    `# Lume install bundle manifest`,
    `# commit=${commit}`,
    `# extension_version=${extManifest.version}`,
    `# extension_id=${extensionId}`,
    `# built=${built}`,
    '# path\\tsha256\\tsize_bytes',
  ];
}

function main() {
  const { out, zip } = parseArgs(process.argv);
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const manifestLines = [];

  copyTree(ensureExtensionDist(), join(out, 'extension'), manifestLines, 'extension');

  const chatgptRoot = join(REPO, 'chatgpt');
  if (!existsSync(chatgptRoot)) throw new Error('missing chatgpt/');
  copyTree(chatgptRoot, join(out, 'chatgpt'), manifestLines, 'chatgpt');

  for (const platform of ['windows', 'guias', 'it', 'LICENSES']) {
    const src = join(PACKAGING, platform);
    if (!existsSync(src)) throw new Error(`missing packaging/${platform}`);
    copyTree(src, join(out, platform), manifestLines, platform);
  }

  for (const doc of ['user-guide.md', 'permissions-and-limits.md']) {
    const src = join(PACKAGING, 'docs', doc);
    const dest = join(out, 'guias', doc);
    const bytes = readFileSync(src);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, bytes);
    assertAllowedCopy(`guias/${doc}`, bytes.length);
    manifestLines.push(
      `guias/${doc}\t${createHash('sha256').update(bytes).digest('hex')}\t${bytes.length}`,
    );
  }

  manifestLines.sort((a, b) => a.localeCompare(b, 'en'));
  const header = `${buildPinHeader(out).join('\n')}\n`;
  writeFileSync(join(out, 'MANIFEST.txt'), header + manifestLines.join('\n') + '\n');

  const top = readdirSync(out).filter((name) => statSync(join(out, name)).isDirectory()).sort();
  const extra = top.filter((d) => !BUNDLE_TOP_LEVEL.includes(d));
  if (extra.length) throw new Error(`unexpected bundle directories: ${extra.join(', ')}`);

  console.log(`bundle: wrote ${manifestLines.length} files to ${out}`);

  if (zip) {
    const archived = archiveBundleDir(out, zip);
    if (archived.ok) console.log(`bundle: zipped with ${archived.tool} → ${archived.path}`);
    else console.warn(archived.message);
  }
}

main();
