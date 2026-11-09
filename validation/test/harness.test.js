import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lintText } from '../../intake/src/lint-public.mjs';
import {
  DONE_WHEN,
  judgeAcceptance,
  measureQuotaPauseResume,
  openRoute,
  recognizeLocal,
  runHarness,
  scoreFactual,
} from '../src/index.js';
import { manifest, observed, otherFacts, syntheticBundle } from './fixtures.js';

const REAL_EVIDENCE = {
  flag: true,
  source: 'maintainer-real',
  route: 'permitted',
  observedMeetsDenominator: true,
  humanReviewMethod: 'maintainer-protocol',
};

test('harness runs on the synthetic set and leaves real-case items blocked', async () => {
  const report = await runHarness(syntheticBundle());
  assert.equal(report.synthetic, true);
  assert.equal(report.observedRealCases, null);
  assert.equal(report.build.component, 'lume-validation');
  assert.equal(report.build.version, '0.0.0');
  assert.equal(typeof report.build.node, 'string');
  assert.equal(report.humanReview.method, null);
  assert.equal(report.humanReview.rubricAgreed, false);
  assert.equal(report.denominators.minCases, 5);
  assert.equal(report.denominators.otherFacts, 0.95);
  assert.equal(report.denominators.inventedDecisiveFacts, 0);
  assert.equal(report.denominators.paidApiFallback, false);
  assert.equal(report.denominators.ocrRubricMinimum, null);
  assert.equal(report.denominators.methodFidelityRubricMinimum, null);

  assert.equal(report.acceptance.length, DONE_WHEN.length);
  for (const item of report.acceptance) {
    assert.equal(item.status, 'BLOCKED');
    assert.equal(item.passed, false);
    assert.match(item.reason, /#3 permitted route/);
    assert.match(item.reason, /maintainer/);
  }

  assert.equal(report.syntheticExercise.acceptance, false);
  assert.equal(report.syntheticExercise.coverage.exerciseOk, true);
  assert.equal(report.syntheticExercise.coverage.acceptancePassed, false);
  assert.equal(report.syntheticExercise.coverage.silentOmissions, 0);
  assert.equal(report.syntheticExercise.coverage.documentMisses, 0);
  assert.equal(report.syntheticExercise.coverage.reconcileFailures, 0);
  assert.equal(report.syntheticExercise.factual.inventedDecisiveFacts, 0);
  assert.equal(report.syntheticExercise.factual.unverifiedLabeledVerified, 0);
  assert.equal(report.syntheticExercise.factual.exerciseMeets, true);
  assert.equal(report.syntheticExercise.factual.acceptancePassed, false);
  assert.equal(report.syntheticExercise.factual.decisive.rate, 1);
  assert.equal(report.syntheticExercise.factual.other.rate, 1);
  assert.equal(report.syntheticExercise.factual.rubricAggregated, false);
  assert.equal(report.syntheticExercise.ocr.cer, 0);
  assert.equal(report.syntheticExercise.ocr.wer, 0);
  assert.equal(report.syntheticExercise.ocr.rubricScore, null);
  assert.equal(report.syntheticExercise.ocr.acceptance, 'BLOCKED');
  assert.equal(report.syntheticExercise.ocr.network, false);
  assert.equal(Object.hasOwn(report.syntheticExercise.coverage, 'cer'), false);
  assert.equal(report.syntheticExercise.method.issueCount, 0);
  assert.equal(report.syntheticExercise.method.rubricScore, null);
  assert.equal(report.syntheticExercise.method.acceptance, 'BLOCKED');

  const missing = report.missingSlices.find((s) => s.slice === 'late-decisive-evidence');
  assert.equal(missing.status, 'untested');
  assert.equal(missing.passed, false);
  assert.ok(report.syntheticExercise.slices.every((s) => s.passed === false));
});

test('refuses to mark real-case items passed without an evidence flag', () => {
  for (const item of DONE_WHEN) {
    const marked = judgeAcceptance(item.id, { passed: true });
    assert.equal(marked.status, 'BLOCKED');
    assert.equal(marked.passed, false);
  }
  const flaggedSynthetic = judgeAcceptance('coverage-factual', { evidence: { ...REAL_EVIDENCE } }, { synthetic: true });
  assert.equal(flaggedSynthetic.passed, false);
  assert.match(flaggedSynthetic.reason, /synthetic/);
  const opened = judgeAcceptance('report-fields', { evidence: REAL_EVIDENCE });
  assert.equal(opened.status, 'passed');
  assert.equal(opened.passed, true);
  const missingMethod = judgeAcceptance('report-fields', { evidence: { ...REAL_EVIDENCE, humanReviewMethod: ' ' } });
  assert.equal(missingMethod.passed, false);
});

test('a synthetic run stays blocked when the evidence flag is set', async () => {
  const report = await runHarness(syntheticBundle(), { evidence: REAL_EVIDENCE });
  assert.ok(report.acceptance.every((item) => item.passed === false && item.status === 'BLOCKED'));
});

test('a stand-in for a missing slice stays untested', async () => {
  const report = await runHarness(syntheticBundle({
    standIns: { 'late-decisive-evidence': { passed: true, cases: [{ id: 'case-standin' }] } },
  }));
  const missing = report.missingSlices.find((s) => s.slice === 'late-decisive-evidence');
  assert.equal(missing.status, 'untested');
  assert.equal(missing.passed, false);
  assert.equal(missing.standInIgnored, true);
  assert.equal(report.acceptance.find((item) => item.id === 'coverage-factual').passed, false);
});

test('fixture observations invent no decisive facts; an extra id is counted', () => {
  const clean = scoreFactual(manifest, observed, otherFacts);
  assert.equal(clean.inventedDecisiveFacts, 0);
  assert.equal(clean.unverifiedLabeledVerified, 0);
  const withInvented = structuredClone(observed);
  withInvented['case-synth01'].findings.decisive.push({ annotationId: 'Z9', citation: { label: 'unverified', status: 'unverified', humanReview: false } });
  assert.equal(scoreFactual(manifest, withInvented, otherFacts).inventedDecisiveFacts, 1);
  const mislabeled = structuredClone(observed);
  mislabeled['case-synth01'].findings.decisive[0].citation = { label: 'verified', status: 'unverified', humanReview: false };
  assert.equal(scoreFactual(manifest, mislabeled, otherFacts).unverifiedLabeledVerified, 1);
});

test('usage stub records pause and resume without network and refuses a paid route', async () => {
  const calls = [];
  const prev = globalThis.fetch;
  globalThis.fetch = (...args) => {
    calls.push(args);
    throw new Error('network');
  };
  try {
    const usage = await measureQuotaPauseResume({ caseId: 'case-synth01' });
    assert.equal(calls.length, 0);
    assert.equal(usage.attempts, 2);
    assert.equal(usage.pause.reason, 'quota_exhausted');
    assert.equal(usage.pause.subscriptionLimit, true);
    assert.equal(usage.pause.resumable, true);
    assert.equal(usage.resumed, true);
    assert.equal(usage.result.ok, true);
    assert.equal(usage.paidApi, false);
    assert.equal(usage.network, false);
    assert.equal(usage.softwarePrice, null);
    assert.equal(usage.liveTransferMeasured, false);
    assert.equal(usage.longRecord.measured, false);
    assert.equal(usage.longRecord.status, 'untested');
    assert.equal(usage.longRecord.pages, 1000);
    assert.equal(typeof usage.latencyMs, 'number');
  } finally {
    globalThis.fetch = prev;
  }
  assert.throws(() => openRoute('paid-api'), /paid API/);
  const route = openRoute('subscription');
  assert.equal(route.paidApi, false);
  assert.equal(route.network, false);
  await assert.rejects(recognizeLocal({ id: 'remote', network: true, async recognize() { return { lines: [] }; } }, {}), /networked/);
});

test('aggregate template is non-identifying and marks every real-case item blocked', () => {
  const text = readFileSync(new URL('../reports/aggregate-template.md', import.meta.url), 'utf8');
  assert.equal(lintText(text).length, 0);
  for (const item of DONE_WHEN) {
    assert.ok(text.includes(item.id), item.id);
    assert.ok(text.includes('BLOCKED'));
  }
  assert.equal(text.includes('status: passed'), false);
});
