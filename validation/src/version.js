import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export function buildVersion() {
  return { component: pkg.name, version: pkg.version, node: process.version };
}
