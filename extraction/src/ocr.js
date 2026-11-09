// Pluggable OCR. An engine is { id, recognize({ bytes, mime }) -> { lines: [{ text, confidence, bbox }] } }
// with confidence in 0..1 and bbox [x, y, width, height] in image pixels. Lume adds the low-confidence flag.

// shortcut: one global threshold, not calibrated; set it from the CER measurement on real excerpts (#3, #14).
export const DEFAULT_THRESHOLD = 0.8;

export async function recognize(engine, image, threshold = DEFAULT_THRESHOLD) {
  const res = await engine.recognize(image);
  if (!Array.isArray(res?.lines)) throw new TypeError('OCR engine returned no lines array');
  return {
    lines: res.lines.map((l) => {
      const c = Number.isFinite(l.confidence) ? Math.min(1, Math.max(0, l.confidence)) : null;
      return { text: String(l.text ?? '').replace(/\s+$/, ''), confidence: c, region: l.bbox ?? null, lowConfidence: c == null || c < threshold };
    }),
  };
}

// Adapter for a tesseract.js worker (runs locally in the browser via WebAssembly). The caller
// creates the worker, so this package adds no dependency and the language data stays local.
// tesseract.js reports confidence 0..100 and bbox { x0, y0, x1, y1 }.
export function createTesseractAdapter(worker, { id = 'tesseract.js' } = {}) {
  return {
    id,
    async recognize({ bytes }) {
      const { data } = await worker.recognize(bytes, {}, { blocks: true });
      const lines = data.lines ?? (data.blocks ?? []).flatMap((b) => b.paragraphs.flatMap((p) => p.lines));
      return {
        lines: lines.map((l) => ({ text: l.text, confidence: l.confidence / 100, bbox: [l.bbox.x0, l.bbox.y0, l.bbox.x1 - l.bbox.x0, l.bbox.y1 - l.bbox.y0] })),
      };
    },
  };
}
