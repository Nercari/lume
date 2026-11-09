// Synthetic, non-legal technical fixtures and a mock PJe page only. No real case content, names
// or numbers. The case pipeline reuses #10 and #8 test fixtures (read-only imports).
import { caseWith, item } from '../../source-panel/test/fixtures.js';
import { draftModel, session } from '../../chat-editor/test/fixtures.js';
import { buildPanel, recordReview } from '../../source-panel/src/index.js';
import { openSource } from '../../extraction/src/index.js';
import { USER_ACTION } from '../../chat-editor/src/index.js';
import { el, doc } from '../../extension/test/dom.js';
import { TransferController, domEditor } from '../src/index.js';

export const CASE_NO = 'SYNTH-0001';

export function page({ caseNo = CASE_NO, editorId = 'ed-1', text = '' } = {}) {
  const editor = el('div', { id: 'editorMinuta', 'data-editor-id': editorId }, text);
  const caseEl = el('span', { class: 'numero-processo' }, caseNo);
  return { doc: doc(el('div', { id: 'autosDigitais' }, caseEl, editor)), editor, caseEl };
}

// Rebuilds the #8 draft shape from the presented panel, then asks #10 for the verified panel.
export const panelFrom = (c, L, reviews = {}) => (draftId, presented) => {
  const sections = new Map();
  for (const e of presented.panel.entries) if (e.ref !== 'conclusion') sections.set(e.ref, [...(sections.get(e.ref) ?? []), e.finding]);
  const uses = presented.panel.entries.filter((e) => e.ref === 'conclusion').map((e) => e.finding);
  return buildPanel(c, L, { sections: [...sections].map(([id, u]) => ({ id, text: '', uses: u })), conclusion: uses.length ? { text: '', reasoning: '', uses } : null }, { reviews });
};

// A synthetic reviewer confirms every citation of the draft through #10 recordReview (a human step).
export async function reviewAll(c, L, s, draftId, reviews) {
  const panel = await panelFrom(c, L)(draftId, await s.presentConclusive(draftId));
  for (const e of panel.entries) for (const cit of e.citations) {
    const src = await openSource(c, cit.passageId);
    recordReview(reviews, { finding: e.finding, passageId: cit.passageId, claimText: L.findings[e.finding].text, passageText: src.passage.text }, 'supports', USER_ACTION, { by: 'reviewer-1' });
  }
  return reviews;
}

// One conclusive draft 'd1' on a two-document case, plus a controller over a mock page.
// reviewed: the citations have a human 'supports' review, so #10 gives 'verified'.
export async function setup({ text = '', editorWrap = (e) => e, panelFor, model = draftModel(), reviewed = true } = {}) {
  const { c, L } = await caseWith({ items: [item('D1'), item('D3', { contentType: 'image/x-fake' })] });
  const s = session(c, L, model);
  await s.generate('d1', { request: 'sentença' });
  const reviews = {};
  if (reviewed) await reviewAll(c, L, s, 'd1', reviews).catch(() => {}); // a provisional draft has no panel to review
  const pg = page({ text });
  const writes = [];
  const base = domEditor(pg.doc);
  const editor = editorWrap({ ...base, write: (v) => { writes.push(v); base.write(v); } }, base);
  const mk = (over = {}) => new TransferController({ caseRec: c, ledger: L, session: s, editor, caseNumber: CASE_NO, panelFor: panelFor ?? panelFrom(c, L, reviews), ...over });
  return { c, L, s, pg, editor, writes, reviews, ctl: mk(), mk };
}
