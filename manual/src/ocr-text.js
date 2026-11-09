// How much OCR text counts as a page. Fewer letters than this stay a gap:
// a speck, a lone glyph, or a footer the engine barely read.
export const OCR_MIN_LETTERS = 4;

export const OCR_MARK = '(texto por OCR, pode conter erros)';

export function ocrHasText(text) {
  const letters = String(text ?? '').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^A-Za-z]/g, '');
  return letters.length >= OCR_MIN_LETTERS;
}
