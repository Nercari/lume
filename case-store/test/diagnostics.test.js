import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASE_A, CASE_B, FAKE_TOKENS, TOKEN_SHAPE, env } from './fixtures.js';
import { redact } from '../src/index.js';

test('redact removes every fake token shape', () => {
  for (const t of FAKE_TOKENS) {
    const out = redact(`request failed: ${t}`);
    assert.doesNotMatch(out, TOKEN_SHAPE, out);
  }
});

test('diagnostics and raw storage contain no tokens and no case content', async () => {
  // Plain codec, so storage inspection sees stored values directly.
  const { make, backend } = env({ encrypted: false });
  const store = make();
  const a = await store.openCase(CASE_A);
  const b = await store.openCase(CASE_B);
  await a.saveUserEdit('d1', 'CONTENT-MARKER draft text');
  await a.appendMessage('main', { role: 'user', text: 'CONTENT-MARKER question' });
  let i = 0;
  const leaky = async () => {
    throw new Error(`upstream said ${FAKE_TOKENS[i++ % FAKE_TOKENS.length]} at ${FAKE_TOKENS[i % FAKE_TOKENS.length]}`);
  };
  await a.runStep('s1', leaky, { maxAttempts: 3 }).catch(() => {});
  await b.runStep('s2', leaky, { maxAttempts: 2 }).catch(() => {});
  await b.runStep('s3', async () => {
    throw Object.assign(new Error(`401 ${FAKE_TOKENS[0]}`), { status: 401 });
  }).catch(() => {});

  const diag = JSON.stringify(await store.diagnostics());
  assert.doesNotMatch(diag, TOKEN_SHAPE, diag);
  assert.ok(!diag.includes('CONTENT-MARKER'));
  assert.match(diag, /"pause":"auth_expired"/);

  const raw = JSON.stringify(backend.dump());
  assert.doesNotMatch(raw, TOKEN_SHAPE, raw);
});
