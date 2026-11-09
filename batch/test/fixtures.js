import { confirmSelection, createAuthorizer, selectManual } from '../src/index.js';

export const CATALOG = [
  { id: 'fixture-alpha', title: 'Fixture alpha', labels: ['batch-demo', 'widget'], keywords: ['widget', 'pump'] },
  { id: 'fixture-beta', title: 'Fixture beta', labels: ['batch-demo', 'widget'], keywords: ['widget', 'valve'] },
  { id: 'fixture-gamma', title: 'Fixture gamma', labels: ['hold'], keywords: ['gauge'] },
  { id: 'fixture-delta', title: 'Fixture delta', labels: ['batch-demo'], keywords: ['widget', 'spare'] },
  { id: 'fixture-epsilon', title: 'Fixture epsilon', labels: ['batch-demo'], keywords: ['widget', 'spare'] },
  { id: 'fixture-zeta', title: 'Fixture zeta', labels: ['batch-demo'], keywords: ['spare'] },
  { id: 'fixture-eta', title: 'Fixture eta', labels: ['batch-demo'], keywords: ['other'] },
];

export const ALPHA = 'fixture-alpha';
export const BETA = 'fixture-beta';
export const GAMMA = 'fixture-gamma';

export function resultFor(caseId, patch = {}) {
  return {
    caseId,
    draftId: `draft-${caseId}`,
    draft: `draft:${caseId}`,
    evidence: [{ sourceId: `src-${caseId}`, locator: 'p1' }],
    ...patch,
  };
}

export function fail(code, extra = {}) {
  const err = new Error(code);
  err.code = code;
  Object.assign(err, extra);
  return err;
}

export function confirmIds(ids) {
  return confirmSelection(selectManual(CATALOG, ids), ids);
}

export function loadQueue(ids, runner, queueOptions = {}) {
  const selection = confirmIds(ids);
  const authorize = createAuthorizer();
  const { auth, prompted } = authorize({
    provider: 'mock-plan',
    data: 'synthetic-batch',
    caseIds: selection.caseIds,
  });
  return { selection, authorize, auth, prompted, runner };
}

export function editorFor(caseId, editorId = 'editor-1') {
  const state = { caseId, editorId, writes: 0 };
  return {
    state,
    caseNumber() { return state.caseId; },
    id() { return state.editorId; },
    write() { state.writes += 1; },
  };
}
