// V owns buildCasePackParts. Parts split only above about 100k tokens.
// 350000 characters is that cap. Until the export is in this checkout, one
// buildCasePack file is the whole study: the full pack, not a truncated slice.

import { buildCasePack } from '../../manual/src/pack.js';

export const PART_MAX_CHARS = 350000;

export async function packParts(caseResult) {
  try {
    const mod = await import('../../manual/src/parts.js');
    if (typeof mod.buildCasePackParts === 'function') {
      return mod.buildCasePackParts(caseResult, { maxChars: PART_MAX_CHARS });
    }
  } catch {
    // parts.js is not in this checkout yet.
  }
  return [{ name: 'lume-caso-parte-01-de-01.md', text: buildCasePack(caseResult) }];
}
