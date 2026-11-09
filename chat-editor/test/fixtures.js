// Synthetic, non-legal technical fixtures only. No real case content, names, numbers or private
// reference material. The case pipeline is the #6 test fixture set (read-only import).
import { emptyLedger, ingest, analyze } from '../../analysis/src/index.js';
import { BASE_FILES, inventory, item, html, extract, openCase, fakeModel } from '../../analysis/test/fixtures.js';
import { CaseSession } from '../src/index.js';

export { BASE_FILES, inventory, item, html, extract };

// items default: D1 (html) and D3 (scan), no restricted item, so no gap is open.
export async function caseWith({ items = [item('D1'), item('D3', { contentType: 'image/x-fake' })], files = BASE_FILES } = {}) {
  const c = await openCase();
  const L = emptyLedger();
  const inv = inventory(items);
  ingest(L, inv, await extract(inv, files));
  const analysisModel = fakeModel();
  await analyze(c, L, analysisModel.fn);
  return { c, L, files, items, analysisModel };
}

// Deterministic stand-in for the drafting/chat model. Each draft call changes the last section
// ("revision n"), so regeneration always produces a new revision. `calls` keeps every prompt.
export function draftModel({ leak = null, skipAddress = false, noReasoning = false } = {}) {
  const calls = [];
  let n = 0;
  const fn = async (p) => {
    calls.push(p);
    const supported = p.evidence.findings.filter((f) => f.supported && f.class !== 'contradiction');
    const cite = supported[0]?.support[0];
    if (p.task === 'chat') return { text: `${supported[0]?.text ?? 'Nothing found'} [${cite}]`, uses: supported.slice(0, 1).map((f) => f.id) };
    n++;
    const last = p.docType.sections.length - 1;
    const sections = p.docType.sections.map((s, i) => ({
      id: s.id,
      text: i === last ? `Order text, revision ${n}.` : `${s.title}: ${supported.map((f) => f.text).join('. ')} [${cite}]${leak ? ` ${leak}` : ''}`,
      uses: supported.map((f) => f.id),
    }));
    const conclusion = p.requestedOutcome
      ? { text: p.requestedOutcome.text, reasoning: `The requested outcome meets ${p.incompatibilities.length} incompatible findings.`, uses: supported.map((f) => f.id) }
      : { text: 'Proposed conclusion from the evidence.', reasoning: noReasoning ? '' : 'The supported findings point one way.', uses: noReasoning ? [] : supported.map((f) => f.id) };
    return { sections, conclusion, addressed: skipAddress ? [] : p.mustAddress };
  };
  return { fn, calls };
}

export const session = (c, L, model, opts = {}) => new CaseSession({ caseRec: c, ledger: L, model: model.fn, ...opts });
