// Product contract (#1, #5): a plan failure never switches to paid API credits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { PAUSE, pauseFor } from '../src/siwc-auth.js';

const srcDir = new URL('../src/', import.meta.url);
const owned = ['siwc-auth.js', 'siwc-session.js', 'worker.js', 'panel.js', 'panel.html'];

test('source has no API-key or paid-billing path and no hardcoded model name', () => {
  const forbidden = [/OPENAI_API_KEY/i, /api[_-]?key/i, /sk-[A-Za-z0-9]/, /x-api-key/i, /platform\.openai\.com/i, /billing/i, /fallback\s*[:=]/i, /process\.env/, /\/v1\/responses/, /\/v1\/chat\/completions/, /backend-api/, /\/v1\/models/];
  const modelName = /\b(?:gpt-\d|gpt-6|o1-preview|o1-mini|o3-|o4-|computer-use|codex-)/i;
  for (const name of owned) {
    const text = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    for (const pattern of forbidden) assert.equal(pattern.test(text), false, `${name} matches ${pattern}`);
    assert.equal(modelName.test(text), false, name);
  }
  for (const name of readdirSync(srcDir)) {
    if (!name.endsWith('.js') && !name.endsWith('.html')) continue;
    const text = readFileSync(new URL(name, srcDir), 'utf8');
    assert.equal(modelName.test(text), false, name);
  }
});

test('source ships no client ID other than the documented registration entrypoint', () => {
  for (const name of ['siwc-auth.js', 'siwc-session.js']) {
    const text = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    assert.equal(/client_id\s*[:=]\s*['"](?!dynamic_agent_client)/.test(text), false, name);
  }
});

test('every plan-failure pause offers no alternative billing', () => {
  for (const msg of Object.values(PAUSE)) assert.equal(/api key|credits|pay|billing/i.test(msg), false, msg);
  for (const code of ['subscription_sharing_usage_limit_exceeded', 'subscription_sharing_user_not_eligible', 'plan_disabled']) {
    assert.deepEqual(Object.keys(pauseFor({ code })).sort(), ['message', 'reason', 'resumable', 'state']);
  }
  assert.equal(pauseFor({ code: 'subscription_sharing_user_not_eligible' }).resumable, false);
  assert.match(pauseFor({ code: 'subscription_sharing_user_not_eligible' }).message, /Não há correção no código/);
});
