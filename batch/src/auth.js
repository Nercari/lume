// One task authorization for a batch (#11). The material scope is the provider, the data
// scope, and the set of case ids. The same scope does not prompt again. A material change
// needs an explicit renew. The queue never calls this per case, document, or turn.
import { SelectionError } from './errors.js';

function materialOf(provider, data, caseIds) {
  return JSON.stringify({ provider, data, caseIds: [...caseIds].sort() });
}

export function createAuthorizer() {
  let issued = 0;
  return function authorize({ provider, data, caseIds, previous = null, renew = false }) {
    if (typeof provider !== 'string' || provider.length === 0) throw new TypeError('provider required');
    if (typeof data !== 'string' || data.length === 0) throw new TypeError('data required');
    if (!Array.isArray(caseIds) || caseIds.length === 0 || caseIds.some((id) => typeof id !== 'string')) {
      throw new TypeError('caseIds required');
    }
    const material = materialOf(provider, data, caseIds);
    if (previous?.material === material) return { auth: previous, prompted: false };
    if (previous && !renew) throw new SelectionError('renew_required');
    issued += 1;
    const auth = Object.freeze({
      id: `auth-${issued}`,
      provider,
      data,
      caseIds: Object.freeze([...caseIds]),
      material,
      prompts: (previous?.prompts ?? 0) + 1,
    });
    return { auth, prompted: true };
  };
}
