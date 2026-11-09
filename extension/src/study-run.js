import { caseFromDocuments, gapsFromMisses, ingestOne, mergeAutos } from './assemble.js';
import { packParts } from './pack-bridge.js';

function missedIds(documents, misses) {
  const have = new Set(documents.map((doc) => String(doc.id)));
  return (misses ?? []).filter((miss) => miss?.id != null && !have.has(String(miss.id)));
}

export async function processCollected(bundle, deps) {
  const misses = bundle.misses ?? [];
  if (bundle.mode === 'autos' && bundle.autosDoc) {
    deps.onDocument?.({ index: 1, total: 1, id: bundle.autosDoc.id });
    const segmented = await deps.segmentAutos(bundle.autosDoc.bytes, {
      version: '1',
      signal: deps.signal,
      ocr: async (info) => {
        deps.onOcr?.({ page: info.pageNumber, pages: info.pageCount, docId: bundle.autosDoc.id });
        return { text: await deps.ocrPdfPage(info.pdfPage) };
      },
    });
    const caseResult = mergeAutos(segmented, bundle.items);
    const parts = packParts(caseResult, bundle.items ?? []);
    return { caseResult, parts, timings: [] };
  }
  const documents = [];
  const timings = [];
  const incoming = bundle.documents ?? [];
  let index = 0;
  for (const doc of incoming) {
    index += 1;
    deps.onDocument?.({ index, total: incoming.length, id: doc.id });
    const ingested = await ingestOne(doc, deps);
    documents.push(ingested);
    timings.push({
      id: String(doc.id),
      fetchMs: doc.fetchMs ?? null,
      textMs: ingested.timing?.textMs ?? 0,
      ocrMs: ingested.timing?.ocrMs ?? 0,
      ocrPages: (ingested.timing?.ocrPages ?? []).map((page) => ({ id: String(doc.id), page: page.page, ms: page.ms })),
    });
  }
  const caseResult = caseFromDocuments(documents, gapsFromMisses(missedIds(documents, misses)));
  for (const miss of missedIds(documents, misses)) {
    if (caseResult.documents.some((doc) => doc.docId === String(miss.id))) continue;
    caseResult.documents.push({
      docId: String(miss.id),
      title: null,
      piece: 'outros',
      pages: [],
      version: '1',
      date: null,
      kind: miss.reason === 'unsupported' ? 'binary' : null,
    });
  }
  const parts = packParts(caseResult, bundle.items ?? []);
  return { caseResult, parts, timings };
}
