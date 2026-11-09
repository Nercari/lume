import { portionOf } from './findings.js';

// Gaps and the provisional-draft gate (#6). A gap starts with impact `unknown`, which blocks a
// conclusive draft the same as `indispensable`. Only a human with a reason and sources can set
// `dispensable`. There is no "dismiss warning" call: the state is computed, never hidden.
export const IMPACTS = Object.freeze(['unknown', 'indispensable', 'dispensable']);
const BLOCKING = ['unknown', 'indispensable'];

export class GateError extends Error {}
export class ProvisionalDraftError extends Error {
  constructor(state) {
    super(`draft is ${state.state}: ${state.reasons.join('; ')}`);
    this.state = state;
  }
}

const gapId = (g) => `${g.docId ?? '*'}@${g.version ?? '*'}:${g.page ?? '*'}:${g.reason}`;

// Recomputes the open gaps. extractionGaps replaces the extraction-sourced set when given.
// Portions in `gone` changed or left: a reclassification that cites them is revoked.
export function syncGaps(L, extractionGaps, gone = new Set()) {
  const prev = L.gaps;
  const next = {};
  const put = (g, source) => {
    const id = gapId(g);
    const old = prev[id];
    next[id] = { id, source, docId: g.docId, version: g.version, page: g.page, reason: g.reason, detail: g.detail ?? null, impact: old?.impact ?? 'unknown', reclassification: old?.reclassification ?? null, history: old?.history ?? [] };
  };
  if (extractionGaps) for (const g of extractionGaps) put(g, 'extraction');
  else for (const g of Object.values(prev)) if (g.source === 'extraction') put(g, 'extraction');
  for (const f of Object.values(L.findings)) {
    if (f.stale || !f.decisive) continue;
    if (!f.supported) put({ docId: null, version: null, page: null, reason: `unsupported_decisive:${f.id}`, detail: f.issues.join('; ') }, 'finding');
    else if (f.class === 'unknown') put({ docId: null, version: null, page: null, reason: `decisive_unknown:${f.id}`, detail: f.text }, 'finding');
  }
  for (const g of Object.values(next)) {
    const r = g.reclassification;
    if (r && r.sources.some((s) => gone.has(s.portion) || !L.passages[s.passage])) {
      g.history.push({ ...r, revoked: { reason: 'a cited source changed', rev: L.rev } });
      g.reclassification = null;
      g.impact = 'unknown';
    }
  }
  L.gaps = next;
}

export const openGaps = (L) => Object.values(L.gaps).filter((g) => BLOCKING.includes(g.impact));

// Any actor may raise a gap to indispensable. Clearing it (dispensable) is a human decision with
// a written reason and at least one current source passage. The model has no tool that calls this;
// the actor field is set by the panel's user-action handler, and `model` is refused outright.
export function reclassifyGap(L, id, { actor, by, impact, reason, sources = [] }, now = Date.now()) {
  const g = L.gaps[id];
  if (!g) throw new GateError(`unknown gap ${id}`);
  if (!IMPACTS.includes(impact)) throw new GateError(`invalid impact ${impact}`);
  if (impact === 'dispensable') {
    if (actor !== 'human') throw new GateError('only a human can clear a gap');
    if (!by?.trim()) throw new GateError('reclassification needs the reviewer');
    if (!reason?.trim()) throw new GateError('reclassification needs a reason');
    if (!sources.length) throw new GateError('reclassification needs at least one source');
    for (const s of sources) if (!L.passages[s]) throw new GateError(`source ${s} is not a current passage`);
  }
  const rec = { actor, by: by ?? null, impact, reason: reason ?? null, at: now, rev: L.rev, sources: sources.map((s) => ({ passage: s, portion: portionOf(s) })) };
  g.history.push(rec);
  g.impact = impact;
  g.reclassification = impact === 'dispensable' ? rec : null;
  return rec;
}

export function registerDraft(L, draftId, findingIds) {
  for (const id of findingIds) if (!L.findings[id]) throw new GateError(`unknown finding ${id}`);
  L.drafts[draftId] = { findingIds: [...findingIds], rev: L.rev, stale: null };
}

// Editing is always allowed. Only `conclusive` may be presented or transferred as a ready draft.
export function draftState(L, draftId) {
  const d = L.drafts[draftId];
  if (!d) throw new GateError(`unknown draft ${draftId}`);
  const reasons = [];
  if (d.stale) reasons.push(`stale: ${d.stale.reason}`);
  const missing = d.findingIds.filter((id) => !L.findings[id] || L.findings[id].stale);
  if (missing.length && !d.stale) reasons.push(`stale: findings ${missing.join(', ')}`);
  const pending = Object.entries(L.portions).filter(([, p]) => p.status !== 'analyzed').map(([k]) => k);
  if (pending.length) reasons.push(`not analyzed: ${pending.join(', ')}`);
  if (L.inventory?.status !== 'complete') reasons.push(`inventory is ${L.inventory?.status ?? 'missing'}`);
  for (const g of openGaps(L)) reasons.push(`gap ${g.id} (${g.impact})`);
  const stale = reasons.some((r) => r.startsWith('stale:'));
  return { draftId, state: stale ? 'stale' : reasons.length ? 'provisional' : 'conclusive', editable: true, reasons };
}

// The presentation and transfer paths (#8, #9) call this before they show or move a ready draft.
export function assertConclusive(L, draftId) {
  const s = draftState(L, draftId);
  if (s.state !== 'conclusive') throw new ProvisionalDraftError(s);
  return s;
}
