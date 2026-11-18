// Asks the worker for the ChatGPT-plan access token. The worker owns refresh.
// This page never stores the token and never sends a refresh-token message.
//
// chrome.runtime.sendMessage({ type: 'lume:siwc-access' }) resolves to
// { ok: true, accessToken, accountId?, expiresAt }
// or { ok: false, code: 'signed_out' | 'not_eligible' | 'no_plan_scope' | 'expired' | 'error', message }.

export function getAccess() {
  return chrome.runtime.sendMessage({ type: 'lume:siwc-access' });
}
