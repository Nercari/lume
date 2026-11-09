// Product contract (#1, #5): no silent switch to paid API credits. The companion has no API-key
// path, no billing fallback, and every plan failure becomes a pause, never a retry elsewhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { PAUSE, pauseFor } from '../src/pause.js';

const srcDir = new URL('../src/', import.meta.url);
const sources = readdirSync(srcDir).filter((f) => f.endsWith('.js')).map((f) => [f, readFileSync(new URL(f, srcDir), 'utf8')]);

test('source has no API-key or paid-billing path', () => {
  const forbidden = [/OPENAI_API_KEY/i, /api[_-]?key/i, /sk-[A-Za-z0-9]/, /x-api-key/i, /platform\.openai\.com/i, /billing/i, /fallback\s*[:=]/i, /process\.env/];
  for (const [file, text] of sources) for (const re of forbidden) assert.ok(!re.test(text), `${file} matches ${re}`);
});

test('source ships no client ID other than the documented registration entrypoint', () => {
  for (const [file, text] of sources) {
    assert.ok(!/client_id\s*[:=]\s*['"](?!dynamic_agent_client)/.test(text), `${file} hard-codes a client_id`);
  }
});

test('every plan-failure pause offers no alternative billing', () => {
  for (const msg of Object.values(PAUSE)) assert.ok(!/api key|credits|pay|billing/i.test(msg), msg);
  for (const code of ['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_user_not_eligible', 'plan_disabled']) {
    assert.deepEqual(Object.keys(pauseFor({ code })).sort(), ['message', 'reason', 'resumable', 'state']);
  }
});
