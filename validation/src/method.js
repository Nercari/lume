// Method fidelity uses the publishable #8 checks. The maintainer's private method package is
// not in this repo, so a clean check list is not a rubric pass.
import { CHECKS, DEFAULT_METHOD } from '../../chat-editor/src/method.js';

export function scoreMethod(draft, env) {
  const issues = [];
  for (const check of CHECKS) {
    if (check.dimension !== 'method_fidelity') continue;
    for (const message of check.run(draft, env)) issues.push({ check: check.id });
  }
  return {
    methodId: DEFAULT_METHOD.id,
    issueCount: issues.length,
    rubricScore: null,
    acceptance: 'BLOCKED',
    reason: 'method-fidelity anchors are not agreed; the private method package is not in this repo',
  };
}
