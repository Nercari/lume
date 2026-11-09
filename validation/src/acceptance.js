// Real-case Done-when items stay BLOCKED unless a caller passes an explicit evidence flag
// for a permitted maintainer run. A synthetic bundle cannot spend that flag.
import { BLOCKED_REASON, DONE_WHEN } from './denominators.js';

const itemOf = (id) => {
  const item = DONE_WHEN.find((d) => d.id === id);
  if (!item) throw new TypeError(`unknown acceptance item ${id}`);
  return item;
};

const blocked = (item, reason) => ({ id: item.id, text: item.text, status: 'BLOCKED', passed: false, reason });

export function judgeAcceptance(id, claim = {}, { synthetic = false } = {}) {
  const item = itemOf(id);
  const evidence = claim.evidence;
  if (!evidence || evidence.flag !== true) return blocked(item, BLOCKED_REASON);
  if (synthetic) return blocked(item, 'a synthetic bundle cannot satisfy a real-case acceptance item');
  if (evidence.source !== 'maintainer-real' || evidence.route !== 'permitted') {
    return blocked(item, 'evidence flag does not name a permitted maintainer real-case run');
  }
  if (evidence.observedMeetsDenominator !== true) return blocked(item, 'no observed result meets the acceptance denominator');
  if (id === 'report-fields' && (typeof evidence.humanReviewMethod !== 'string' || !evidence.humanReviewMethod.trim())) {
    return blocked(item, 'human review method is still a placeholder');
  }
  return { id: item.id, text: item.text, status: 'passed', passed: true, reason: null };
}
