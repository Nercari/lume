#!/usr/bin/env node
// Scores one sheet per dimension. An aggregate exists only when all six dimensions are
// scored (or not-applicable); otherwise the scorer refuses. See docs/rubric.md.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { check } from './schema-check.mjs';

const schema = JSON.parse(readFileSync(new URL('../schema/rubric.schema.json', import.meta.url)));
export const DIMENSIONS = schema.properties.scores.required;

export function score(sheet, { aggregate = false } = {}) {
  const errors = check(schema, sheet);
  for (const d of DIMENSIONS) {
    const s = sheet.scores?.[d];
    if (!s) continue;
    if (s.status === 'scored' && !Number.isInteger(s.score)) errors.push(`/scores/${d}: scored needs score`);
    if (s.status !== 'scored' && 'score' in s) errors.push(`/scores/${d}: score given but status is ${s.status}`);
    if ('found' in s && 'expected' in s && s.found > s.expected) errors.push(`/scores/${d}: found > expected`);
  }
  if (errors.length) throw new Error(`invalid sheet:\n${errors.join('\n')}`);

  const result = { case_id: sheet.case_id, run_id: sheet.run_id, dimensions: {} };
  for (const d of DIMENSIONS) result.dimensions[d] = sheet.scores[d].status === 'scored' ? sheet.scores[d].score : sheet.scores[d].status;
  if (!aggregate) return result;

  const missing = DIMENSIONS.filter((d) => sheet.scores[d].status === 'pending');
  if (missing.length) throw new Error(`refused: aggregate needs every dimension; pending: ${missing.join(', ')}`);
  const nums = DIMENSIONS.map((d) => sheet.scores[d]).filter((s) => s.status === 'scored').map((s) => s.score);
  // Weakest dimension, so a strong draft cannot hide a factual failure.
  result.aggregate = Math.min(...nums);
  result.pass = sheet.scores.factual_support.invented_decisive_facts === 0 && result.aggregate >= 3;
  return result;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node src/rubric.mjs <sheet.json> [--aggregate]'); process.exit(2); }
  try {
    console.log(JSON.stringify(score(JSON.parse(readFileSync(file, 'utf8')), { aggregate: process.argv.includes('--aggregate') }), null, 2));
  } catch (e) { console.error(e.message); process.exit(1); }
}
