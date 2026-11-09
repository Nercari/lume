// Synthetic, non-legal technical fixtures only. No real case content, names or numbers. The case
// pipeline reuses the #6 test fixtures (read-only import) and persists #2 results to the #7 store.
import { emptyLedger, ingest, analyze } from '../../analysis/src/index.js';
import { inventory, item, html, scan, extract, openCase, fakeModel } from '../../analysis/test/fixtures.js';
import { persist } from '../../extraction/src/index.js';

export { item, html, scan, inventory, extract };

export const LOW = 'Gauge note: operator states a leak near valve 2.';
export const FILES = {
  D1: html('Pump TX-200 rated flow 40 litres per minute.', 'Inlet pressure stays below 6 bar.'),
  D3: scan(['Inspection on day 3 found no leak.', 0.95]),
  D4: scan([LOW, 0.5]), // below the #2 OCR threshold
};
export const ITEMS = () => [item('D1'), item('D3', { contentType: 'image/x-fake' }), item('D4', { contentType: 'image/x-fake' })];
export const LOW_ID = `D4@1:p1:0-${LOW.length}`;

export async function store(c, results) {
  for (const r of results) await persist(c, r, { imageTtlMs: 60_000 });
}

export async function caseWith({ items = ITEMS(), files = FILES, extra = [] } = {}) {
  const c = await openCase();
  const L = emptyLedger();
  const inv = inventory(items);
  const results = await extract(inv, files);
  await store(c, results);
  ingest(L, inv, results);
  await analyze(c, L, fakeModel({ extra }).fn);
  return { c, L, inv };
}

export const bySubject = (L, subject, cls) => Object.values(L.findings).find((f) => f.subject === subject && (!cls || f.class === cls));
