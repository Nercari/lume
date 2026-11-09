// Coverage reconciliation against the #4 inventory. Coverage and quality are separate objects:
// a page with text is "covered", and that says nothing about recognition accuracy.
import { STATES } from '../../extension/src/core.js';

const key = (docId, version) => `${docId}@${version}`;

// inventory: #4 readCase() output. results: extractCase() output. measurement: measure() output or null.
export function reconcile(inventory, results, measurement = null) {
  const byKey = new Map(results.map((r) => [key(r.docId, r.version), r]));
  const silentOmissions = [];
  const documents = [];
  const coverage = { documents: 0, documentsWithText: 0, documentGaps: 0, pagesExpected: 0, pagesWithText: 0, pagesOcr: 0, pageGaps: 0 };
  const quality = { ocrPassages: 0, lowConfidencePassages: 0, meanOcrConfidence: null, recognitionAccuracy: 'unmeasured' };
  let confSum = 0;

  if (inventory.status !== 'complete') silentOmissions.push({ docId: null, page: null, problem: `inventory is ${inventory.status}${inventory.stopReason ? ` (${inventory.stopReason})` : ''}; its list may be short` });
  for (const item of inventory.items) {
    if (!STATES.includes(item.state)) silentOmissions.push({ docId: item.id, page: null, problem: `unknown inventory state ${item.state}` });
    coverage.documents++;
    const r = byKey.get(key(item.id, item.version));
    byKey.delete(key(item.id, item.version));
    if (!r) {
      silentOmissions.push({ docId: item.id, page: null, problem: 'no extraction result and no gap' });
      documents.push({ docId: item.id, version: item.version, inventoryState: item.state, status: 'omitted' });
      continue;
    }
    const docGaps = r.gaps.filter((g) => g.page == null);
    const pages = Math.max(r.pageCount, item.expectedPages ?? 0);
    coverage.pagesExpected += pages;
    let text = 0;
    for (let n = 1; n <= pages; n++) {
      const page = r.pages.find((p) => p.page === n && p.passages.length);
      const pageGap = r.gaps.find((g) => g.page === n);
      if (page) {
        text++;
        if (page.method.startsWith('ocr:')) coverage.pagesOcr++;
      } else if (pageGap) coverage.pageGaps++;
      else if (!docGaps.length) silentOmissions.push({ docId: item.id, page: n, problem: 'page without text and without gap' });
    }
    coverage.pagesWithText += text;
    if (docGaps.length) coverage.documentGaps++;
    if (text) coverage.documentsWithText++;
    if (!docGaps.length && !pages) silentOmissions.push({ docId: item.id, page: null, problem: 'no pages and no gap' });
    for (const p of r.pages.flatMap((pg) => pg.passages)) {
      if (!p.method.startsWith('ocr:')) continue;
      quality.ocrPassages++;
      if (p.lowConfidence) quality.lowConfidencePassages++;
      confSum += p.confidence ?? 0;
    }
    documents.push({ docId: item.id, version: item.version, inventoryState: item.state, status: docGaps.length ? 'gap' : text === pages ? 'complete' : 'partial', pages, pagesWithText: text, gaps: r.gaps.map((g) => `${g.page ?? '*'}:${g.reason}`) });
  }
  const unexpected = [...byKey.values()].map((r) => ({ docId: r.docId, version: r.version }));
  for (const u of unexpected) silentOmissions.push({ docId: u.docId, page: null, problem: `result for version ${u.version} not in inventory` });
  if (quality.ocrPassages) quality.meanOcrConfidence = confSum / quality.ocrPassages;
  if (measurement) quality.recognitionAccuracy = { excerpts: measurement.excerpts, cer: measurement.cer, wer: measurement.wer };
  return { ok: silentOmissions.length === 0, silentOmissions, coverage, quality, documents, unexpected };
}
