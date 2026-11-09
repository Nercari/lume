import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspect, format } from 'node:util';
import { Secret, redact, createLogger } from '../src/redact.js';
import { TokenCustody } from '../src/custody.js';
import { MemoryVault, fakeTokens } from './fakes.js';

test('Secret never stringifies its value', () => {
  const s = new Secret('synthetic-secret-value-0001');
  for (const out of [String(s), `${s}`, JSON.stringify({ s }), inspect({ s }), format('%s %o %j', s, s, s)]) {
    assert.ok(!out.includes('synthetic-secret-value-0001'), out);
  }
  assert.equal(s.reveal(), 'synthetic-secret-value-0001');
});

test('redact() removes known secrets and token-shaped text', () => {
  const s = new Secret('synthetic-known-value-0002');
  const text = [
    `raw synthetic-known-value-0002`,
    'Authorization: Bearer abc.def-ghi',
    'jwt eyJhbGciOiJub25lIn0.eyJzeW50aGV0aWMiOnRydWV9.c2ln',
    'url ?code=synthetic-code&state=ok',
    'form refresh_token=synthetic-rt&grant_type=refresh_token',
    '{"access_token": "synthetic-at", "status_code": 200}',
  ].join('\n');
  const out = redact(text);
  for (const leaked of ['synthetic-known-value-0002', 'abc.def-ghi', 'eyJzeW50aGV0aWMiOnRydWV9', 'synthetic-code', 'synthetic-rt', 'synthetic-at']) {
    assert.ok(!out.includes(leaked), `${leaked} leaked in:\n${out}`);
  }
  assert.ok(out.includes('state=ok') && out.includes('status_code'), 'non-secret text kept');
  s.forget();
});

test('logger output and custody diagnostics contain no token values', async () => {
  const lines = [];
  const log = createLogger((l) => lines.push(l));
  const tokens = fakeTokens();
  const custody = new TokenCustody({ vault: new MemoryVault(), accountKey: 'acct-test', clientId: 'synthetic-client' });
  await custody.store(tokens);
  const at = await custody.accessToken();
  log.info('token', at, { at, nested: { at } });
  log.error('raw', tokens.access_token, new Error(`failed with ${tokens.refresh_token}`));
  log.info('custody', custody, await custody.describe());
  const all = lines.join('\n');
  for (const v of [tokens.access_token, tokens.refresh_token, tokens.id_token]) assert.ok(!all.includes(v), `leak: ${all}`);
});
