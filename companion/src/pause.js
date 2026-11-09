// Pause states. Every ChatGPT-plan failure maps to a pause with a user-facing next step.
// By design a plan failure never switches to paid API usage or any other payment route.
// Codes: https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery

export const PAUSE = Object.freeze({
  auth_expired: 'Your ChatGPT sign-in expired or was disconnected. Sign in again from the Lume panel to continue.',
  quota_exhausted: 'Your ChatGPT plan usage limit was reached. Lume paused this case; your work is kept. Check ChatGPT settings → Usage, then resume.',
  usage_unavailable: 'ChatGPT could not check plan usage right now. Lume paused; try resuming in a few minutes.',
  not_eligible: 'ChatGPT plan usage is not available for this account, workspace, or policy. Lume cannot continue with this account; ask your workspace administrator.',
  plan_disabled: 'ChatGPT plan usage is not enabled for Lume. Sign in again and allow ChatGPT plan usage to continue.',
  client_config: 'The Lume registration for this account is invalid. Remove the account in Lume and register it again.',
});

const BY_CODE = {
  subscription_sharing_usage_limit_exceeded: 'quota_exhausted',
  subscription_sharing_usage_unavailable: 'usage_unavailable',
  subscription_sharing_user_not_eligible: 'not_eligible',
  subscription_sharing_invalid_user: 'auth_expired',
  auth_expired: 'auth_expired',
  plan_disabled: 'plan_disabled',
  invalid_client: 'client_config',
};

// Returns a pause state, or null when the error is not a plan/auth condition.
export function pauseFor({ code, status } = {}) {
  const reason = BY_CODE[code] ?? (status === 401 ? 'auth_expired' : status === 429 ? 'quota_exhausted' : null);
  if (!reason) return null;
  return Object.freeze({ state: 'paused', reason, message: PAUSE[reason], resumable: reason !== 'not_eligible' });
}
