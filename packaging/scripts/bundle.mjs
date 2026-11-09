#!/usr/bin/env node
// Assemble lume-install/ from built extension + companion. No network.
import {
  copyFileSync,
  cpSync,
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

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGING = join(SCRIPT_DIR, '..');
const REPO = join(PACKAGING, '..');
import { assertBundlePathAllowed, MAX_BUNDLE_BYTES } from './bundle-guards.mjs';

function parseArgs(argv) {
  const opts = { out: null, nodeWin: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out' && argv[i + 1]) opts.out = resolve(argv[++i]);
    else if (a === '--node-win' && argv[i + 1]) opts.nodeWin = resolve(argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node packaging/scripts/bundle.mjs --out <dir> [--node-win <extracted-node-win-x64-dir>]');
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

function writeReleasePin(outDir) {
  let commit = 'unknown';
  try {
    commit = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    /* not a git checkout */
  }
  const extManifest = JSON.parse(readFileSync(join(outDir, 'extension/manifest.json'), 'utf8'));
  const companionPkg = JSON.parse(readFileSync(join(outDir, 'companion/package.json'), 'utf8'));
  const body = [
    `commit=${commit}`,
    `extension_version=${extManifest.version}`,
    `companion_version=${companionPkg.version}`,
    `extension_id=${process.env.LUME_EXTENSION_ID ?? 'odjfiioakpihgkikmjadmohgckkhkjhi'}`,
    `built=${new Date().toISOString().slice(0, 10)}`,
    '',
  ].join('\n');
  writeFileSync(join(outDir, 'RELEASE-PIN.txt'), body);
}

function main() {
  const { out, nodeWin } = parseArgs(process.argv);
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const manifestLines = [];

  copyTree(ensureExtensionDist(), join(out, 'extension'), manifestLines, 'extension');

  const companionDest = join(out, 'companion');
  mkdirSync(companionDest, { recursive: true });
  cpSync(join(REPO, 'companion/package.json'), join(companionDest, 'package.json'));
  const companionPkg = readFileSync(join(companionDest, 'package.json'));
  manifestLines.push(`companion/package.json\t${createHash('sha256').update(companionPkg).digest('hex')}\t${companionPkg.length}`);
  copyTree(join(REPO, 'companion/src'), join(companionDest, 'src'), manifestLines, 'companion/src');

  const manualDist = join(REPO, 'manual/dist');
  if (existsSync(manualDist)) {
    copyTree(manualDist, join(out, 'manual'), manifestLines, 'manual');
  }

  for (const platform of ['windows', 'macos', 'linux', 'guias', 'it', 'LICENSES']) {
    const src = join(PACKAGING, platform);
    if (!existsSync(src)) throw new Error(`missing packaging/${platform}`);
    copyTree(src, join(out, platform), manifestLines, platform);
  }

  if (nodeWin) {
    if (!existsSync(join(nodeWin, 'node.exe'))) throw new Error('--node-win must contain node.exe');
    copyTree(nodeWin, join(out, 'runtime/node'), manifestLines, 'runtime/node');
  }

  writeReleasePin(out);

  const pinStat = statSync(join(out, 'RELEASE-PIN.txt'));
  const pinHash = createHash('sha256').update(readFileSync(join(out, 'RELEASE-PIN.txt'))).digest('hex');
  manifestLines.push(`RELEASE-PIN.txt\t${pinHash}\t${pinStat.size}`);

  manifestLines.sort((a, b) => a.localeCompare(b, 'en'));
  const header = `# Lume install bundle manifest\n# path\\tsha256\\tsize_bytes\n`;
  writeFileSync(join(out, 'MANIFEST.txt'), header + manifestLines.join('\n') + '\n');

  console.log(`bundle: wrote ${manifestLines.length} files to ${out}`);
}

main();
