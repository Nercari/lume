import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pauseFor } from '../src/pause.js';
import { createHandlers } from '../src/handlers.js';
import { createRegistration } from '../src/auth.js';
import { TokenCustody } from '../src/custody.js';
import { MemoryVault, codeError } from './fakes.js';

test('quota exhaustion pauses with a next step and stays resumable', () => {
  const p = pauseFor({ code: 'subscription_sharing_usage_limit_exceeded', status: 429 });
  assert.equal(p.reason, 'quota_exhausted');
  assert.equal(p.resumable, true);
  assert.match(p.message, /Usage/);
});

test('auth expiry pauses and asks the user to sign in again', () => {
  for (const e of [{ code: 'subscription_sharing_invalid_user' }, { code: 'auth_expired' }, { status: 401 }]) {
    const p = pauseFor(e);
    assert.equal(p.reason, 'auth_expired');
    assert.match(p.message, /Sign in again/);
  }
});

test('ineligible account is a non-resumable pause; unrelated errors are not pauses', () => {
  assert.equal(pauseFor({ code: 'subscription_sharing_user_not_eligible' }).resumable, false);
  assert.equal(pauseFor({ code: 'ECONNRESET' }), null);
  assert.equal(pauseFor(), null);
});

test('handlers expose the pause through status, without tokens', async () => {
  const custody = new TokenCustody({ vault: new MemoryVault(), accountKey: 'acct-test', clientId: 'synthetic-client' });
  const { handlers, reportFailure } = createHandlers({ registration: createRegistration({ hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000' }), custody });
  reportFailure(codeError('subscription_sharing_usage_limit_exceeded'));
  const s = await handlers.status();
  assert.equal(s.pause.reason, 'quota_exhausted');
  assert.equal(s.signedIn, false);
});
