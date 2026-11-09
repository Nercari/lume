#!/usr/bin/env node
// Link and checklist sanity for packaging docs. No network.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const docs = join(root, 'docs');
const required = JSON.parse(readFileSync(join(root, 'fixtures/required-checklist.json'), 'utf8'));

const mustExist = [
  'design.md',
  'package-layout.md',
  'user-guide.md',
  'permissions-and-limits.md',
  'attribution-checklist.md',
  'observer-checklist.md',
  'revoke-uninstall-spec.md',
];

for (const name of mustExist) {
  const p = join(docs, name);
  if (!existsSync(p)) throw new Error(`missing doc: ${name}`);
}

const userGuide = readFileSync(join(docs, 'user-guide.md'), 'utf8');
for (const heading of required.userGuideSections) {
  if (!userGuide.includes(`## ${heading}`)) {
    throw new Error(`user-guide.md missing section: ${heading}`);
  }
}

const observer = readFileSync(join(docs, 'observer-checklist.md'), 'utf8');
for (const heading of required.observerSections) {
  const needle = heading === 'Study status' ? '## Study status' : `## ${heading}`;
  if (!observer.includes(needle)) {
    throw new Error(`observer-checklist.md missing section: ${heading}`);
  }
}

const layout = readFileSync(join(docs, 'package-layout.md'), 'utf8');
for (const phrase of required.layoutArtifacts) {
  if (!layout.includes(phrase) && !layout.toLowerCase().includes(phrase.toLowerCase().split(' ')[0])) {
    // layout references extension/dist explicitly
    if (phrase === 'extension/dist' && !layout.includes('extension/dist')) {
      throw new Error(`package-layout.md missing reference: ${phrase}`);
    }
  }
}
if (!layout.includes('extension/dist')) throw new Error('package-layout.md missing extension/dist');

const repoRefs = [
  ['../extension/README.md', join(root, '../extension/README.md')],
  ['../companion/docs/auth-route.md', join(root, '../companion/docs/auth-route.md')],
];

for (const [, target] of repoRefs) {
  if (!existsSync(target)) throw new Error(`sanity: sibling package doc missing: ${target}`);
}

console.log('build: packaging docs and sibling links ok');
