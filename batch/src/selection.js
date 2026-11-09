// Case selection (#11). Every mode returns a visible included list and stays unconfirmed.
// Label and natural-language selectors are deterministic stubs over catalog fields.
// They never read case text and they never enqueue a case.
import { CASE_ID, MAX_BATCH } from './constants.js';
import { SelectionError } from './errors.js';

const LABEL = /^[a-z0-9-]{1,32}$/;
const TITLE = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,80}$/;

function limitOf(limit) {
  const value = limit ?? MAX_BATCH;
  if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH) throw new TypeError('limit must be from 1 to MAX_BATCH');
  return value;
}

function present(row) {
  return Object.freeze({
    id: row.id,
    title: row.title,
    labels: Object.freeze([...row.labels]),
  });
}

function mapCatalog(catalog) {
  if (!Array.isArray(catalog)) throw new TypeError('catalog required');
  const byId = new Map();
  for (const row of catalog) {
    if (!row || typeof row !== 'object') throw new TypeError('invalid catalog row');
    if (typeof row.id !== 'string' || !CASE_ID.test(row.id)) throw new TypeError('invalid case id');
    if (byId.has(row.id)) throw new SelectionError('duplicate_case');
    if (typeof row.title !== 'string' || !TITLE.test(row.title)) throw new TypeError('invalid title');
    if (!Array.isArray(row.labels) || row.labels.length === 0 || row.labels.some((label) => typeof label !== 'string' || !LABEL.test(label))) {
      throw new TypeError('invalid label');
    }
    const keywords = row.keywords ?? [];
    if (!Array.isArray(keywords) || keywords.some((word) => typeof word !== 'string' || !LABEL.test(word))) {
      throw new TypeError('invalid keyword');
    }
    byId.set(row.id, { id: row.id, title: row.title, labels: [...row.labels], keywords: [...keywords] });
  }
  return byId;
}

// included is the visible list that a later confirm can run. It is empty when the match
// set is over the limit, so a case is never dropped silently.
function selection(mode, candidates, included, limit) {
  const status = candidates.length > limit ? 'needs_narrowing' : 'preview';
  const visible = status === 'needs_narrowing' ? [] : included;
  return Object.freeze({
    mode,
    status,
    limit,
    candidates: Object.freeze(candidates),
    included: Object.freeze(visible),
    caseIds: Object.freeze(visible.map((row) => row.id)),
  });
}

export function selectManual(catalog, ids, { limit = MAX_BATCH } = {}) {
  const cap = limitOf(limit);
  const byId = mapCatalog(catalog);
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) throw new TypeError('ids must be strings');
  if (new Set(ids).size !== ids.length) throw new SelectionError('duplicate_case');
  if (ids.length > cap) throw new SelectionError('batch_limit');
  const included = ids.map((id) => {
    const row = byId.get(id);
    if (!row) throw new SelectionError('unknown_case');
    return present(row);
  });
  return selection('manual', included, included, cap);
}

export function selectByLabel(catalog, labels, { limit = MAX_BATCH } = {}) {
  const cap = limitOf(limit);
  const byId = mapCatalog(catalog);
  if (!Array.isArray(labels) || labels.length === 0 || labels.some((label) => typeof label !== 'string' || !LABEL.test(label))) {
    throw new TypeError('labels required');
  }
  const want = [...labels];
  const found = [...byId.values()]
    .filter((row) => want.every((label) => row.labels.includes(label)))
    .map(present);
  return selection('label', found, found, cap);
}

// Exact token match on labels and keywords. This is not a model call.
export function selectByNaturalLanguage(catalog, query, { limit = MAX_BATCH } = {}) {
  const cap = limitOf(limit);
  const byId = mapCatalog(catalog);
  if (typeof query !== 'string' || query.length === 0 || query.length > 200) throw new TypeError('query required');
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((term) => term.length > 0);
  if (terms.length === 0 || terms.length > 12) throw new TypeError('query required');
  const found = [...byId.values()]
    .filter((row) => {
      const hay = new Set([...row.labels, ...row.keywords]);
      return terms.every((term) => hay.has(term));
    })
    .map(present);
  return selection('natural_language', found, found, cap);
}

// acceptedIds must already be in the candidate list. A subset is allowed. An extra id is not.
export function confirmSelection(selectionValue, acceptedIds) {
  if (!selectionValue || (selectionValue.status !== 'preview' && selectionValue.status !== 'needs_narrowing')) {
    throw new SelectionError(selectionValue?.status === 'confirmed' ? 'already_confirmed' : 'not_awaiting');
  }
  if (!Array.isArray(acceptedIds) || acceptedIds.some((id) => typeof id !== 'string')) throw new TypeError('ids must be strings');
  if (acceptedIds.length === 0) throw new SelectionError('empty_selection');
  if (new Set(acceptedIds).size !== acceptedIds.length) throw new SelectionError('duplicate_case');
  if (acceptedIds.length > selectionValue.limit) throw new SelectionError('batch_limit');
  const allowed = new Map(selectionValue.candidates.map((row) => [row.id, row]));
  const included = [];
  for (const id of acceptedIds) {
    const row = allowed.get(id);
    if (!row) throw new SelectionError('unconfirmed_case');
    included.push(row);
  }
  return Object.freeze({
    mode: selectionValue.mode,
    status: 'confirmed',
    limit: selectionValue.limit,
    candidates: selectionValue.candidates,
    included: Object.freeze(included),
    caseIds: Object.freeze(included.map((row) => row.id)),
  });
}
