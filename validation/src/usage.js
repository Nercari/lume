// Subscription usage and latency stub. Work is a local function. This module has no HTTP client
// and no paid-API route. A quota failure is a subscription limit, not a software price.
import { LONG_RECORD_PAGES } from '../../intake/src/manifest.mjs';
import { CaseStore, PausedError, pauseReasonFor } from '../../case-store/src/store.js';
import { MemoryBackend } from '../../case-store/src/backend.js';
import { AUTOSAVE } from '../../transfer/src/editor.js';

export const PAID_API = false;

export function openRoute(route) {
  if (route !== 'subscription') throw new Error('refusing paid API fallback');
  return { route: 'subscription', paidApi: PAID_API, network: false };
}

function subscriptionPauseFor(err) {
  const reason = pauseReasonFor(err);
  if (!reason) return null;
  return Object.freeze({
    state: 'paused',
    reason,
    resumable: reason !== 'auth_expired' || err?.code !== 'subscription_sharing_user_not_eligible',
  });
}

export async function measureTurn({ caseId, turn, work, now }) {
  openRoute('subscription');
  if (typeof work !== 'function') throw new TypeError('work must be a local function');
  let tick = 0;
  const clock = now ?? (() => {
    tick += 1;
    return tick;
  });
  const start = clock();
  const result = await work();
  const end = clock();
  return {
    caseId,
    turn,
    latencyMs: end - start,
    result,
    paidApi: false,
    network: false,
    softwarePrice: null,
    subscriptionLimit: false,
  };
}

export async function measureQuotaPauseResume({ caseId, now } = {}) {
  openRoute('subscription');
  let tick = 0;
  const clock = now ?? (() => {
    tick += 5;
    return tick;
  });
  const store = new CaseStore({
    backend: new MemoryBackend(),
    now: clock,
    sleep: async () => {},
    browserSession: () => false,
  });
  const c = await store.openCase(caseId);
  const fail = Object.assign(new Error('plan limit'), { code: 'subscription_sharing_usage_limit_exceeded', status: 429 });
  const planPause = subscriptionPauseFor(fail);
  const storeReason = pauseReasonFor(fail);
  if (!planPause || planPause.reason !== 'quota_exhausted' || storeReason !== 'quota_exhausted') {
    throw new Error('quota failure did not map to a subscription pause');
  }

  let attempts = 0;
  const start = clock();
  try {
    await c.runStep('usage.turn', async () => {
      attempts += 1;
      throw fail;
    }, { maxAttempts: 3, backoffMs: 0 });
    throw new Error('expected a quota pause');
  } catch (e) {
    if (!(e instanceof PausedError) || e.pause.reason !== 'quota_exhausted') throw e;
  }
  const paused = await c.pauseState();
  await c.resume();
  const after = await c.pauseState();
  const result = await c.runStep('usage.turn', async () => {
    attempts += 1;
    return { ok: true };
  }, { maxAttempts: 3, backoffMs: 0 });
  const end = clock();

  return {
    caseId,
    attempts,
    pause: { reason: paused.reason, resumable: planPause.resumable, subscriptionLimit: true },
    storeReason,
    resumed: after === null,
    result,
    latencyMs: end - start,
    paidApi: false,
    network: false,
    softwarePrice: null,
    liveTransferMeasured: AUTOSAVE.measured,
    longRecord: { pages: LONG_RECORD_PAGES, measured: false, status: 'untested' },
  };
}
