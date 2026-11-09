import './align.js';

export { classifyPiece, PIECES, PIECE_RULES } from './classify.js';
export { checkAnswer, CITATION_RULE, DECISIVE_RULES, decisiveRule } from './check.js';
export {
  ADAPTED_INSTRUCTIONS,
  DOC_TYPE_OPTIONS,
  buildChatGPTPackage,
  gapsSummaryOf,
  inferManualDocType,
  resolveDocType,
  splitParts,
} from './prompt.js';
export { countFieldValues, emptySummary, labelFor, renderReportMarkdown, summarizeCase } from './report.js';
export {
  FOOTER_RULES,
  footerAssinado,
  footerConsultaUrl,
  footerNumPag,
  footerNumeroDocumento,
  indexHeader,
  indexRowDated,
  indexRowIdTitle,
  isIndexHeader,
  matchFooterText,
  outlineIdPrefix,
  outlineIdSuffix,
  outlineTitle,
  parseIndexRow,
  parseOutlineTitle,
} from './rules.js';
export { OCR_MARK, OCR_MIN_LETTERS, ocrHasText } from './ocr-text.js';
export { buildCasePack, PACK_FILENAME } from './pack.js';
export { buildCasePackParts, extractPassagesFromPartText, partFileName } from './parts.js';
export { TEXT_BLOCK_CHARS, TEXT_RULES, segmentText } from './segment-text.js';
export { GAP, cleanVersion, segmentAutos, setWorkerSrc } from './segment.js';
