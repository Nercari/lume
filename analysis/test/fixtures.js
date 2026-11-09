// Synthetic, non-legal technical fixtures only. No real case content, names or numbers.
import { CaseStore, MemoryBackend } from '../../case-store/src/index.js';
import { extractCase } from '../../extraction/src/extract.js';
import { fakeOcr, makeScan } from '../../extraction/test/fixtures.js';

export const html = (...ps) => ({ bytes: new TextEncoder().encode(ps.map((p) => `<p>${p}</p>`).join('')), contentType: 'text/html' });
export const scan = (...lines) => ({ bytes: makeScan(lines), contentType: 'image/x-fake' });

// #4 inventory shape: { status, items: [{ id, version, kind, parentId, state, expectedPages }] }.
export const item = (id, over = {}) => ({ id, version: '1', kind: 'document', parentId: null, state: 'processed', expectedPages: 1, href: `https://example.test/doc?id=${id}`, detail: null, ...over });
export const inventory = (items, status = 'complete') => ({ status, items });

export const BASE_FILES = {
  D1: html('Pump TX-200 rated flow 40 litres per minute.', 'Inlet pressure stays below 6 bar.'),
  D3: scan(['Inspection on day 3 found no leak.', 0.95]),
};
export const baseItems = () => [item('D1'), item('D2', { state: 'restricted', detail: 'marked restricted in list' }), item('D3', { contentType: 'image/x-fake' })];

export const extract = (inv, files) => extractCase(inv, async (it) => files[it.id], { ocr: fakeOcr });

export async function openCase() {
  const store = new CaseStore({ backend: new MemoryBackend(), sleep: async () => {}, now: () => 1_000 });
  return store.openCase('fixture-alpha');
}

// Deterministic stand-in for the model call. Rules map passage text to assertions; each rule cites
// the passage it matched. `calls` records every call so tests can prove no call is sent twice.
export const RULES = [
  { re: /rated flow (\d+)/, make: (m) => ({ class: 'fact', subject: 'pump.flow', value: Number(m[1]), decisive: true, text: `Rated flow is ${m[1]} l/min` }) },
  { re: /found no leak/, make: () => ({ class: 'fact', subject: 'leak', value: false, decisive: true, text: 'No leak at inspection' }) },
  { re: /operator states/, make: () => ({ class: 'allegation', subject: 'leak', value: true, decisive: true, text: 'Operator alleges a leak' }) },
];
export function fakeModel({ extra = [] } = {}) {
  const calls = [];
  const fn = async ({ docId, version, passages, idempotencyKey }) => {
    calls.push({ docId, version, idempotencyKey, passages: passages.map((p) => p.id) });
    const assertions = [];
    for (const p of passages) for (const r of RULES) {
      const m = r.re.exec(p.text);
      if (m) assertions.push({ ...r.make(m), support: [p.id] });
    }
    for (const e of extra) if (e.docId === docId) assertions.push(e.assertion);
    return { assertions };
  };
  return { fn, calls };
}
