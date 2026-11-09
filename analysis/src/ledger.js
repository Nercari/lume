// Coverage ledger (#6). The ledger is one plain JSON object per case, so it can live in the #7
// store as a checkpoint. A portion is one readable, permitted page of one document version.
// Every portion must reach a completed analysis call; nothing is skipped by relevance ranking.
import { reconcile } from '../../extraction/src/reconcile.js';
import { forTransmission } from '../../extraction/src/extract.js';
import { admit, detectContradictions } from './findings.js';
export { portionOf } from './findings.js';
import { syncGaps } from './gate.js';

export const LEDGER_RECORD = 'analysis-ledger';
// Absence claims and legal conclusions depend on the whole record: any inventory change can alter them.
const WHOLE_CASE = ['unknown', 'legal_conclusion'];

export const portionKey = (docId, version, page) => `${docId}@${version}:p${page}`;

// Change detection only, not security: FNV-1a over the sent passage ids and texts.
function hash(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
}

const fingerprint = (inventory) => hash(inventory.items.map((i) => `${i.id}@${i.version}:${i.state}`).sort().join('|'));

export const emptyLedger = () => ({ rev: 0, inventory: null, portions: {}, passages: {}, gaps: {}, findings: {}, drafts: {}, log: [] });

// Records (or re-records) the inventory and extraction results. Use it for the first build and for
// every later change: a late attachment, a new version, a new OCR run. exclude(passage) is the
// #2 transmission policy; excluded text becomes a gap, never a silent hole.
export function ingest(L, inventory, results, { exclude } = {}) {
  const rec = reconcile(inventory, results);
  const next = {};
  const passages = {};
  const extractionGaps = [];
  for (const r of results) {
    extractionGaps.push(...r.gaps);
    for (const page of r.pages) {
      const { send, gaps } = forTransmission(page.passages, exclude);
      extractionGaps.push(...gaps);
      if (!send.length) continue;
      const key = portionKey(r.docId, r.version, page.page);
      next[key] = {
        docId: r.docId, version: r.version, page: page.page, kind: r.kind, method: page.method,
        hash: hash(send.map((p) => `${p.id}\u0000${p.text}`).join('\u0001')),
        passageIds: send.map((p) => p.id),
        lowConfidence: send.filter((p) => p.lowConfidence).length,
        status: 'pending', call: null,
      };
      for (const p of send) passages[p.id] = p;
    }
  }
  for (const o of rec.silentOmissions) extractionGaps.push({ docId: o.docId, version: null, page: o.page, reason: 'silent_omission', detail: o.problem });

  const changed = [];
  const added = [];
  for (const [key, old] of Object.entries(L.portions)) {
    const now = next[key];
    if (!now || now.hash !== old.hash) changed.push(key);
    else Object.assign(now, { status: old.status, call: old.call });
  }
  for (const key of Object.keys(next)) if (!L.portions[key]) added.push(key);

  const print = fingerprint(inventory);
  const inventoryChanged = L.inventory != null && L.inventory.fingerprint !== print;
  L.rev++;
  L.inventory = { status: inventory.status, fingerprint: print, items: inventory.items.length, rev: L.rev };
  L.portions = next;
  L.passages = passages;

  const gone = new Set(changed);
  const staleFindings = [];
  for (const f of Object.values(L.findings)) {
    if (f.stale) continue;
    const why = f.portions.some((k) => gone.has(k)) ? 'source changed'
      : inventoryChanged && WHOLE_CASE.includes(f.class) ? 'inventory changed' : null;
    if (why) {
      f.stale = { reason: why, rev: L.rev };
      staleFindings.push(f.id);
    }
  }
  detectContradictions(L);
  syncGaps(L, extractionGaps, gone);

  const staleDrafts = [];
  for (const [id, d] of Object.entries(L.drafts)) {
    if (d.stale) continue;
    const reason = d.findingIds.some((fid) => L.findings[fid]?.stale) ? 'a finding it uses is stale'
      : inventoryChanged ? 'inventory changed after the draft' : added.length ? 'new material not yet analyzed' : null;
    if (reason) {
      d.stale = { reason, rev: L.rev };
      staleDrafts.push(id);
    }
  }
  const event = { rev: L.rev, changed, added, staleFindings, staleDrafts, inventoryChanged, reconcileOk: rec.ok };
  L.log.push(event);
  return event;
}

// Runs one analysis call per pending document version through the #7 step runner, so a completed
// call is never sent again and its record is the coverage evidence. analyzeFn gets only the
// permitted passages and returns { assertions: [...] } (see findings.js).
export async function analyze(caseRec, L, analyzeFn, stepOpts) {
  const groups = new Map();
  for (const [key, p] of Object.entries(L.portions)) {
    if (p.status === 'analyzed') continue;
    const g = `${p.docId}@${p.version}`;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(key);
  }
  const done = [];
  for (const [doc, keys] of groups) {
    const portions = keys.map((k) => L.portions[k]);
    const stepId = `analysis:${doc}:${hash(portions.map((p) => p.hash).join(''))}`;
    const passages = portions.flatMap((p) => p.passageIds.map((id) => L.passages[id]));
    const { docId, version } = portions[0];
    const out = await caseRec.runStep(stepId, ({ idempotencyKey }) => analyzeFn({ docId, version, passages, idempotencyKey }), stepOpts);
    const call = await caseRec.get('call', stepId);
    for (const k of keys) Object.assign(L.portions[k], { status: 'analyzed', call: { stepId, at: call.at, attempts: call.attempts } });
    admit(L, stepId, keys, passages, out?.assertions ?? []);
    done.push(stepId);
  }
  detectContradictions(L);
  syncGaps(L);
  return done;
}

// Reconciles every portion to a completed call record in the store. A ledger entry alone is not
// evidence: the call record must exist and be done.
export async function coverage(caseRec, L) {
  const unprocessed = [];
  let analyzed = 0;
  for (const [key, p] of Object.entries(L.portions)) {
    const call = p.call && (await caseRec.get('call', p.call.stepId));
    if (p.status === 'analyzed' && call?.status === 'done') analyzed++;
    else unprocessed.push(key);
  }
  return { ok: unprocessed.length === 0, portions: Object.keys(L.portions).length, analyzed, unprocessed };
}

export const save = (caseRec, L) => caseRec.put('checkpoint', LEDGER_RECORD, L);
export const load = async (caseRec) => (await caseRec.get('checkpoint', LEDGER_RECORD)) ?? emptyLedger();
