import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(packageRoot, '..');

export const TESTED_PATHS = Object.freeze([
  'trust/src/policy.js',
  'trust/src/security.js',
  'trust/src/failure.js',
  'trust/src/storage.js',
  'trust/src/page.js',
  'chatgpt/PROJETO-LUME.md',
  'case-store/src/store.js',
  'case-store/src/codec.js',
  'case-store/src/backend.js',
  'case-store/src/redact.js',
  'chat-editor/src/session.js',
  'transfer/src/controller.js',
  'transfer/src/editor.js',
  'source-panel/src/verify.js',
  'source-panel/src/research.js',
  'analysis/src/gate.js',
  'extension/src/core.js',
  'extension/manifest.json',
]);

// Live workstation and real-account checks are outside this harness.
export const LIMITS = Object.freeze([
  { id: 'live-workstation', status: 'BLOCKED', reason: 'No permitted PJe workstation session. Extension selectors and editor autosave were not measured on a live page.' },
  { id: 'chatgpt-live', status: 'BLOCKED', reason: 'No live ChatGPT project validation in CI. Instructions are checked offline in chatgpt/ tests.' },
  { id: 'judicial-records', status: 'BLOCKED', reason: 'No judicial record was opened or mutated. Fixtures are synthetic.' },
  { id: 'os-credential-vault', status: 'BLOCKED', reason: 'No Lume OAuth host on this branch; manual ChatGPT mode uses no Lume-stored tokens.' },
]);

export function packageVersion() {
  return JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')).version;
}

export function buildReport({ security, failure, storage }) {
  const missing = TESTED_PATHS.filter((p) => !existsSync(join(repoRoot, p)));
  if (missing.length) throw new Error(`missing tested path: ${missing.join(', ')}`);
  return {
    component: 'lume-trust',
    version: packageVersion(),
    runtime: process.version,
    paths: [...TESTED_PATHS],
    security: {
      attempts: security.attempts.length,
      unauthorizedDestinations: security.unauthorizedDestinations,
      unauthorizedActions: security.unauthorizedActions,
      permissionChanges: security.permissionChanges,
      caseTargetChanges: security.caseTargetChanges,
      ids: security.attempts.map((a) => a.id),
    },
    failure: {
      interruptions: failure.interruptions.length,
      mixedCases: failure.mixedCases,
      duplicateInsertions: failure.duplicateInsertions,
      lostManualEdits: failure.lostManualEdits,
      ids: failure.interruptions.map((r) => r.id),
    },
    storage: {
      checks: storage.checks.length,
      failed: storage.failed,
      ids: storage.checks.map((c) => c.id),
    },
    limits: LIMITS.map((l) => ({ ...l })),
  };
}

export function writeReport(results) {
  const report = buildReport(results);
  const dir = join(packageRoot, 'reports');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'matrix.json'), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}
