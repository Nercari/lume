// One aggregate report. Synthetic exercise numbers are labeled and cannot mark a Done-when item passed.
import { DONE_WHEN, DENOMINATORS, HUMAN_REVIEW } from './denominators.js';
import { judgeAcceptance } from './acceptance.js';
import { buildVersion } from './version.js';
import { assertPublishable } from './publish.js';
import { scoreCoverage } from './coverage.js';
import { scoreFactual } from './factual.js';
import { scoreOcr, recognizeLocal } from './ocr.js';
import { scoreMethod } from './method.js';
import { measureQuotaPauseResume, measureTurn } from './usage.js';

export async function runHarness(bundle, claim = {}) {
  if (bundle?.kind !== 'synthetic') throw new TypeError('the harness runner only accepts a synthetic bundle');
  const coverage = scoreCoverage(bundle.manifest, bundle.observed, { standIns: bundle.standIns ?? {} });
  const factual = scoreFactual(bundle.manifest, bundle.observed, bundle.otherFacts ?? {});
  const ocr = scoreOcr(bundle.ocr.excerpts, bundle.ocr.results);
  const ocrLocal = await recognizeLocal(bundle.ocr.engine, bundle.ocr.image);
  const method = scoreMethod(bundle.method.draft, bundle.method.env);
  const turn = await measureTurn({
    caseId: bundle.usageCaseId,
    turn: 1,
    work: async () => ({ ok: true }),
  });
  const usage = await measureQuotaPauseResume({ caseId: bundle.usageCaseId });
  const acceptance = DONE_WHEN.map((item) => judgeAcceptance(item.id, claim, { synthetic: true }));

  const report = {
    kind: 'lume-validation-aggregate',
    synthetic: true,
    identifyingContent: false,
    build: buildVersion(),
    humanReview: HUMAN_REVIEW,
    denominators: DENOMINATORS,
    observedRealCases: null,
    acceptance,
    missingSlices: coverage.slices.filter((s) => s.status === 'untested'),
    syntheticExercise: {
      label: 'synthetic',
      acceptance: false,
      caseCount: coverage.cases.length,
      coverage: {
        exerciseOk: coverage.exerciseOk,
        acceptancePassed: false,
        documentMisses: coverage.documentMisses,
        pageMismatch: coverage.pageMismatch,
        statusMismatch: coverage.statusMismatch,
        unexpected: coverage.unexpected,
        silentOmissions: coverage.silentOmissions,
        reconcileChecked: coverage.reconcileChecked,
        reconcileFailures: coverage.reconcileFailures,
      },
      slices: coverage.slices,
      factual: {
        decisive: factual.decisive,
        contradictions: factual.contradictions,
        gaps: factual.gaps,
        other: factual.other,
        inventedDecisiveFacts: factual.inventedDecisiveFacts,
        unverifiedLabeledVerified: factual.unverifiedLabeledVerified,
        exerciseMeets: factual.exerciseMeets,
        acceptancePassed: false,
        rubricAggregated: factual.rubricAggregated,
      },
      ocr: {
        excerpts: ocr.excerpts,
        cer: ocr.cer,
        wer: ocr.wer,
        localLines: ocrLocal.lines,
        localLowConfidence: ocrLocal.lowConfidence,
        network: ocrLocal.network,
        rubricScore: null,
        acceptance: ocr.acceptance,
      },
      method: {
        methodId: method.methodId,
        issueCount: method.issueCount,
        rubricScore: null,
        acceptance: method.acceptance,
      },
      usage: {
        turnLatencyMs: turn.latencyMs,
        attempts: usage.attempts,
        pauseReason: usage.pause.reason,
        resumable: usage.pause.resumable,
        resumed: usage.resumed,
        latencyMs: usage.latencyMs,
        subscriptionLimit: usage.pause.subscriptionLimit,
        softwarePrice: usage.softwarePrice,
        paidApi: usage.paidApi,
        network: usage.network,
        liveTransferMeasured: usage.liveTransferMeasured,
        longRecord: usage.longRecord,
      },
    },
  };
  return assertPublishable(report);
}
