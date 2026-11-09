// OCR quality is separate from document counts. The hook measures CER/WER and can run a
// local engine. It does not turn those rates into a rubric score: the anchors are not agreed.
import { measure } from '../../extraction/src/measure.js';
import { recognize } from '../../extraction/src/ocr.js';

export function scoreOcr(excerpts, results) {
  const measured = measure(excerpts, results);
  return {
    excerpts: measured.excerpts,
    cer: measured.cer,
    wer: measured.wer,
    rubricScore: null,
    separateFromDocumentCounts: true,
    acceptance: 'BLOCKED',
    reason: 'OCR rubric anchors are not agreed before this run',
  };
}

export async function recognizeLocal(engine, image) {
  if (!engine || engine.network) throw new Error('OCR hook refuses a networked engine');
  const out = await recognize(engine, image);
  return {
    engine: engine.id,
    lines: out.lines.length,
    lowConfidence: out.lines.filter((l) => l.lowConfidence).length,
    network: false,
  };
}
