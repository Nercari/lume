// Cross-case comparison (#11). The context cites sources from each named case.
// It has no draft field and no write path back into a case.
import { ComparisonError } from './errors.js';

export function buildComparison(reports, { question, caseIds }) {
  if (typeof question !== 'string' || question.trim() === '') throw new TypeError('question required');
  if (!Array.isArray(caseIds) || caseIds.length === 0) throw new ComparisonError('empty_comparison');
  if (new Set(caseIds).size !== caseIds.length) throw new ComparisonError('duplicate_case');
  const citations = [];
  for (const id of caseIds) {
    const report = reports.get(id);
    if (!report) throw new ComparisonError('unknown_case');
    if (report.status !== 'succeeded') throw new ComparisonError('not_ready');
    if (!Array.isArray(report.evidence) || report.evidence.length === 0) throw new ComparisonError('no_sources');
    for (const source of report.evidence) {
      if (!source || source.caseId !== id || typeof source.sourceId !== 'string' || typeof source.locator !== 'string') {
        throw new ComparisonError('foreign_source');
      }
      citations.push(Object.freeze({ caseId: id, sourceId: source.sourceId, locator: source.locator }));
    }
  }
  return Object.freeze({
    kind: 'comparison',
    question,
    citations: Object.freeze(citations),
  });
}
