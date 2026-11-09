// V owns buildCasePackParts. Until that export is in this checkout, one
// buildCasePack file is the whole study. Concatenating parts is V's job;
// this fallback is the full pack, not a truncated slice.

import { buildCasePack } from '../../manual/src/pack.js';

export async function packParts(caseResult) {
  try {
    const mod = await import('../../manual/src/parts.js');
    if (typeof mod.buildCasePackParts === 'function') {
      return mod.buildCasePackParts(caseResult, { maxChars: 120000 });
    }
  } catch {
    // parts.js is not in this checkout yet.
  }
  return [{ name: 'lume-caso-parte-01-de-01.md', text: buildCasePack(caseResult) }];
}
