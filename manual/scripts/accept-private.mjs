#!/usr/bin/env node
// Counts for a private directory of PJe+R text exports. Prints counts only.
// Real-case files stay off CI; pass the directory on the command line.
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { checkAnswer } from '../src/check.js';
import { countDocumentoHeaders, decodeExport, isBinaryBody, segmentText } from '../src/segment-text.js';

const GAP_LABELS = new Set(['imagem/sem texto', 'binário/ilegível']);

function gapKey(gap) {
  if (GAP_LABELS.has(gap?.detail)) return gap.detail;
  const reason = String(gap?.reason ?? '');
  if (/^[a-z0-9_]+$/u.test(reason)) return reason;
  return 'unknown';
}

function hasControl(text) {
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 127) return true;
  }
  return false;
}

export function assessResult(headers, result) {
  const documents = result?.documents?.length ?? 0;
  const passages = result?.passages ?? [];
  const gaps = {};
  for (const gap of result?.gaps ?? []) {
    const key = gapKey(gap);
    gaps[key] = (gaps[key] ?? 0) + 1;
  }
  let failures = headers === documents ? 0 : 1;
  const lines = passages.map((passage) => `[Id ${passage.docId}, fl. ${passage.pageInDoc}]`);
  const checked = lines.length ? checkAnswer(lines.join('\n'), result) : { citations: [] };
  let resolved = 0;
  if (checked.citations.length !== lines.length) failures += 1;
  for (let index = 0; index < passages.length; index += 1) {
    const passage = passages[index];
    const status = passage.hasText ? 'exists' : 'unreadable';
    if (checked.citations[index]?.status === status) resolved += 1;
    else failures += 1;
    if (passage.text && (isBinaryBody(passage.text) || hasControl(passage.text))) failures += 1;
  }
  return {
    headers,
    documents,
    passages: passages.length,
    citationsChecked: lines.length,
    citationsResolved: resolved,
    gaps,
    failures,
  };
}

function failedScore(headers) {
  return {
    headers,
    documents: 0,
    passages: 0,
    citationsChecked: 0,
    citationsResolved: 0,
    gaps: {},
    failures: 1,
  };
}

export function assess(text) {
  try {
    const decoded = decodeExport(text).text;
    const result = segmentText(text);
    return assessResult(countDocumentoHeaders(decoded), result);
  } catch {
    return failedScore(0);
  }
}

export function formatScore(score) {
  const keys = Object.keys(score.gaps).sort();
  const gaps = keys.length ? keys.map((key) => `${key}:${score.gaps[key]}`).join(';') : 'none';
  return [
    score.label,
    `headers=${score.headers}`,
    `documents=${score.documents}`,
    `passages=${score.passages}`,
    `citations_checked=${score.citationsChecked}`,
    `citations_resolved=${score.citationsResolved}`,
    `gaps=${gaps}`,
    `failures=${score.failures}`,
  ].join(' ');
}

export async function runDir(dir) {
  const names = (await readdir(dir))
    .filter((name) => extname(name).toLowerCase() === '.txt')
    .sort((left, right) => left.localeCompare(right));
  const scores = [];
  for (let index = 0; index < names.length; index += 1) {
    const label = `case-${String(index + 1).padStart(2, '0')}`;
    try {
      const text = await readFile(join(dir, names[index]));
      scores.push({ label, ...assess(text) });
    } catch {
      scores.push({ label, ...failedScore(0) });
    }
  }
  return scores;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node scripts/accept-private.mjs <dir>');
    process.exit(2);
  }
  let scores;
  try {
    scores = await runDir(dir);
  } catch {
    console.error('directory not found');
    process.exit(2);
  }
  let failures = 0;
  for (const score of scores) {
    console.log(formatScore(score));
    failures += score.failures;
  }
  if (!scores.length) console.log('files=0 failures=0');
  process.exit(failures > 0 ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
