// Acceptance bars from issue #14. Numeric rubric anchors for OCR and method fidelity stay
// unset until the maintainer agrees them before a real-case run (intake rubric, issue #3).
import { LONG_RECORD_PAGES, SLICES } from '../../intake/src/manifest.mjs';

export const BLOCKED_REASON = "needs #3 permitted route and the maintainer's real cases";

export const DENOMINATORS = Object.freeze({
  minCases: 5,
  longRecordPages: LONG_RECORD_PAGES,
  slices: Object.freeze([...SLICES]),
  inventory: Object.freeze({ documentIds: 1, pages: 1, statuses: 1, silentOmissions: 0 }),
  decisiveFacts: 1,
  contradictions: 1,
  materialGaps: 1,
  otherFacts: 0.95,
  inventedDecisiveFacts: 0,
  unverifiedCitationsLabeledVerified: 0,
  ocrRubricMinimum: null,
  methodFidelityRubricMinimum: null,
  paidApiFallback: false,
  subscriptionLimitSeparateFromSoftwarePrice: true,
});

export const DONE_WHEN = Object.freeze([
  {
    id: 'report-fields',
    text: 'The real-case report states each acceptance denominator, observed result, build version, and human review method.',
  },
  {
    id: 'coverage-factual',
    text: 'Coverage and factual-support targets pass on the agreed set. Missing slices remain explicitly untested, never replaced by synthetic legal cases or presented as passed.',
  },
  {
    id: 'ocr-method',
    text: 'OCR and method-fidelity scores meet the rubric agreed before the run.',
  },
  {
    id: 'usage-range',
    text: 'Usage and latency measurements establish a practical supported operating range without enabling paid API fallback.',
  },
  {
    id: 'failures-public',
    text: 'Failures have linked fixes and rechecks. GitHub carries only aggregate, non-identifying results, not raw case materials.',
  },
]);

// Filled only from a maintainer record. The harness does not invent a reviewer, protocol, or rubric.
export const HUMAN_REVIEW = Object.freeze({
  method: null,
  reviewer: null,
  protocol: null,
  completedBeforeEvaluation: null,
  rubricAgreed: false,
  note: 'Placeholder. The human review method is recorded when the maintainer supplies it.',
});
