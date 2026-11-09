#!/usr/bin/env node
// Validates the private manifest: schema, then the rules a schema cannot express.
// Output names paths and opaque IDs only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { check } from './schema-check.mjs';

const schema = JSON.parse(readFileSync(new URL('../schema/manifest.schema.json', import.meta.url)));
export const SLICES = schema.$defs.slice.enum;
export const LONG_RECORD_PAGES = 1000;

export function validateManifest(m) {
  const errors = check(schema, m);
  if (errors.length) return errors;

  const ids = m.cases.map((c) => c.id);
  if (new Set(ids).size !== ids.length) errors.push('/cases: case IDs must be unique');

  m.cases.forEach((c, i) => {
    const at = `/cases/${i} (${c.id})`;
    if (c.slices.includes('long-record') && c.page_count < LONG_RECORD_PAGES)
      errors.push(`${at}: long-record needs page_count >= ${LONG_RECORD_PAGES}`);
    const inv = c.annotation.inventory;
    const pages = new Map(inv.map((d) => [d.doc, d.pages]));
    if (pages.size !== inv.length) errors.push(`${at}: inventory doc IDs must be unique`);
    const total = inv.reduce((s, d) => s + d.pages, 0);
    if (total !== c.page_count) errors.push(`${at}: inventory pages (${total}) must equal page_count (${c.page_count})`);
    const a = c.annotation;
    for (const key of ['decisive_facts', 'contradictions', 'gaps']) {
      const itemIds = a[key].map((x) => x.id);
      if (new Set(itemIds).size !== itemIds.length) errors.push(`${at}/${key}: item IDs must be unique`);
      a[key].forEach((x, j) => (x.sources || []).forEach((s, k) => {
        if (!pages.has(s.doc)) errors.push(`${at}/${key}/${j}/sources/${k}: doc not in inventory`);
        else if (s.page > pages.get(s.doc)) errors.push(`${at}/${key}/${j}/sources/${k}: page beyond document`);
      }));
    }
    if (c.slices.includes('contradictions') && a.contradictions.length === 0)
      errors.push(`${at}: contradictions slice needs at least one annotated contradiction`);
    if (c.slices.includes('inventory-change') && !inv.some((d) => d.added_late))
      errors.push(`${at}: inventory-change slice needs a document with added_late`);
    if (c.slices.includes('unreadable-restricted') && !inv.some((d) => !d.readable || d.restricted))
      errors.push(`${at}: unreadable-restricted slice needs an unreadable or restricted document`);
    if (c.slices.includes('scans') && !inv.some((d) => d.kind === 'scan')) errors.push(`${at}: scans slice needs a scan document`);
    if (c.slices.includes('attachments') && !inv.some((d) => d.kind === 'attachment'))
      errors.push(`${at}: attachments slice needs an attachment document`);
  });

  const covered = new Set(m.cases.flatMap((c) => c.slices));
  const pending = new Set();
  for (const p of m.pending_slices) {
    if (pending.has(p.slice)) errors.push(`/pending_slices: ${p.slice} listed twice`);
    pending.add(p.slice);
  }
  for (const s of SLICES) {
    if (covered.has(s) && pending.has(s)) errors.push(`/pending_slices: ${s} is covered by a case and also pending`);
    if (!covered.has(s) && !pending.has(s)) errors.push(`/: slice ${s} must be covered by a case or listed in pending_slices`);
  }

  const splits = new Set(m.cases.map((c) => c.split));
  if (!(splits.has('tuning') && splits.has('held-out')) && !m.split_exception)
    errors.push('/: needs tuning and held-out cases, or a split_exception');
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('usage: node src/manifest.mjs <private-manifest.json>'); process.exit(2); }
  let m;
  try { m = JSON.parse(readFileSync(file, 'utf8')); } catch { console.error('error: cannot read or parse the manifest'); process.exit(2); }
  const errors = validateManifest(m);
  for (const e of errors) console.error(`error ${e}`);
  if (errors.length) process.exit(1);
  const pend = m.pending_slices.map((p) => p.slice);
  console.log(`ok: ${m.cases.length} cases, pending slices: ${pend.length ? pend.join(', ') : 'none'}`);
}
