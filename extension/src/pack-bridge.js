// Part files are the same text as the PJe view parts. The splitter lives here,
// in the extension, and does not import manual/src/parts.js.

import { PART_MAX_CHARS, renderCaseParts } from './case-view.js';

export { PART_MAX_CHARS };

export function packParts(caseResult, items = []) {
  return renderCaseParts(caseResult, items).parts.map((part) => ({
    n: part.n,
    total: part.total,
    name: part.name,
    text: part.text,
  }));
}
