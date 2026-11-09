// Bounds for the offline batch core (#11). A permitted real-case batch is a separate gate (#14, #13, #3).

export const MAX_BATCH = 5;
export const DEFAULT_MAX_ATTEMPTS = 3;

// Opaque local ids only. A digit-leading process number cannot be a batch case id.
export const CASE_ID = /^[a-z][a-z0-9-]{0,63}$/;

// Shared pauses match case-store pauseReasonFor (#7) and companion plan failures (#5).
export const SHARED_REASONS = Object.freeze([
  'auth_expired',
  'quota_exhausted',
  'pje_session_unavailable',
]);

export const PAUSE_MESSAGES = Object.freeze({
  auth_expired: 'Sign-in expired. The batch is paused. Sign in again, then resume.',
  quota_exhausted: 'Plan usage limit reached. The batch is paused. Resume when usage is available.',
  pje_session_unavailable: 'Authenticated reads need an open, signed-in browser session. Open it, then resume.',
});
