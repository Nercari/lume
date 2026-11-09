// GitHub may carry the aggregate report. Identifying text fails closed.
import { lintJson, lintText } from '../../intake/src/lint-public.mjs';
import { leaks } from '../../source-panel/src/research.js';

export function assertPublishable(value) {
  const text = JSON.stringify(value);
  const findings = [
    ...lintJson(value).map((f) => f.kind),
    ...lintText(text).map((f) => f.kind),
    ...leaks(text, []),
  ];
  if (findings.length) throw new Error(`report is not publishable: ${[...new Set(findings)].join(', ')}`);
  return value;
}
