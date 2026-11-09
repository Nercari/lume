#!/usr/bin/env node
// Rejects identifying content in files meant for GitHub. Reports file, line and kind,
// never the matched text, so a finding does not leak through CI logs.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const D = '(?<!\\d)';
const E = '(?!\\d)';
export const PATTERNS = [
  ['cnj-case-number', new RegExp(`${D}\\d{7}-?\\d{2}\\.?\\d{4}\\.?\\d\\.?\\d{2}\\.?\\d{4}${E}`)],
  ['cnpj', new RegExp(`${D}\\d{2}\\.?\\d{3}\\.?\\d{3}/?\\d{4}-?\\d{2}${E}`)],
  ['cpf', new RegExp(`${D}\\d{3}\\.?\\d{3}\\.?\\d{3}-?\\d{2}${E}`)],
  ['email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+/],
];
// Keys whose value would be a person's name or a direct identifier.
const NAME_KEY = /^(name|nome|full_?name|.*_name|party|parties|parte|partes|autor|autora|reu|réu|requerente|requerido|advogad[oa]|lawyer|attorney|juiz|juiza|judge|relator|servidor|cpf|cnpj|email|e-mail|oab)$/i;

export function lintText(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    for (const [kind, re] of PATTERNS) if (re.test(line)) out.push({ line: i + 1, kind });
  });
  return out;
}

export function lintJson(value, path = '', out = []) {
  if (Array.isArray(value)) value.forEach((v, i) => lintJson(v, `${path}/${i}`, out));
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (NAME_KEY.test(k) && !(typeof v === 'string' && v.trim() === '') && v !== null) out.push({ path: `${path}/${k}`, kind: 'name-in-field' });
      lintJson(v, `${path}/${k}`, out);
    }
  }
  return out;
}

const SKIP = new Set(['node_modules', '.git', 'private']);
function* walk(p) {
  if (statSync(p).isDirectory()) {
    for (const e of readdirSync(p)) if (!SKIP.has(e)) yield* walk(join(p, e));
  } else yield p;
}

export function lintPaths(paths) {
  const findings = [];
  for (const root of paths) for (const f of walk(root)) {
    const text = readFileSync(f, 'utf8');
    for (const x of lintText(text)) findings.push(`${relative('.', f)}:${x.line}: ${x.kind}`);
    if (f.endsWith('.json')) {
      let v;
      try { v = JSON.parse(text); } catch { findings.push(`${relative('.', f)}: invalid JSON`); continue; }
      for (const x of lintJson(v)) findings.push(`${relative('.', f)}#${x.path}: ${x.kind}`);
    }
  }
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  if (!paths.length) { console.error('usage: node src/lint-public.mjs <file-or-dir>...'); process.exit(2); }
  const findings = lintPaths(paths);
  for (const f of findings) console.error(f);
  if (findings.length) { console.error(`lint-public: ${findings.length} finding(s)`); process.exit(1); }
  console.log('lint-public: no identifying content found');
}
