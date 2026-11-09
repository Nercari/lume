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
export { GAP, cleanVersion, segmentAutos, setWorkerSrc } from './segment.js';
