import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BatchQueue } from '../src/index.js';
import { ALPHA, BETA, GAMMA, fail, loadQueue, resultFor } from './fixtures.js';

async function runWith(runner) {
  const { selection, auth } = loadQueue([ALPHA, BETA, GAMMA], runner);
  const queue = new BatchQueue({ runner });
  queue.load(selection, auth);
  await queue.run();
  return queue;
}

test('cases keep distinct drafts, evidence, errors, and permissions', async () => {
  const queue = await runWith(async (job) => {
    if (job.caseId === BETA) throw fail('case_failed', { retryable: false });
    return resultFor(job.caseId);
  });

  const alpha = queue.report(ALPHA);
  const beta = queue.report(BETA);
  const gamma = queue.report(GAMMA);
  assert.equal(alpha.status, 'succeeded');
  assert.equal(beta.status, 'failed');
  assert.equal(gamma.status, 'succeeded');
  assert.equal(alpha.draft, 'draft:fixture-alpha');
  assert.equal(gamma.draft, 'draft:fixture-gamma');
  assert.equal(beta.draft, null);
  assert.deepEqual(alpha.evidence, [{ caseId: ALPHA, sourceId: 'src-fixture-alpha', locator: 'p1' }]);
  assert.deepEqual(gamma.evidence, [{ caseId: GAMMA, sourceId: 'src-fixture-gamma', locator: 'p1' }]);
  assert.equal(beta.error, 'case_failed');
  assert.equal(alpha.error, null);
  assert.equal(alpha.permissions.caseId, ALPHA);
  assert.equal(beta.permissions.caseId, BETA);
  assert.equal(JSON.stringify(queue.progress()).includes('draft:fixture-alpha'), false);
  assert.equal(JSON.stringify(alpha).includes('fixture-gamma'), false);
  assert.equal(JSON.stringify(gamma).includes('src-fixture-alpha'), false);
});

test('a returned report is a copy, and a foreign result fails only that case', async () => {
  const queue = await runWith(async (job) => {
    if (job.caseId === ALPHA) {
      return resultFor(ALPHA, { evidence: [{ sourceId: 'src-fixture-beta', locator: 'p1', caseId: BETA }] });
    }
    return resultFor(job.caseId);
  });

  assert.equal(queue.report(ALPHA).status, 'failed');
  assert.equal(queue.report(ALPHA).error, 'case_mixing');
  assert.equal(queue.report(ALPHA).draft, null);
  assert.equal(queue.report(BETA).status, 'succeeded');
  assert.equal(queue.report(BETA).draft, 'draft:fixture-beta');
  assert.deepEqual(queue.report(BETA).evidence, [{ caseId: BETA, sourceId: 'src-fixture-beta', locator: 'p1' }]);

  const report = queue.report(BETA);
  report.draft = 'rewritten';
  report.evidence.push({ caseId: ALPHA, sourceId: 'src-fixture-alpha', locator: 'p9' });
  assert.equal(queue.report(BETA).draft, 'draft:fixture-beta');
  assert.equal(queue.report(BETA).evidence.length, 1);
});

test('a runner job names only the case it is allowed to run', async () => {
  const jobs = [];
  await runWith(async (job) => {
    jobs.push(job);
    return resultFor(job.caseId);
  });
  assert.deepEqual(jobs.map((job) => Object.keys(job).sort()), [
    ['attempt', 'authId', 'caseId', 'idempotencyKey'],
    ['attempt', 'authId', 'caseId', 'idempotencyKey'],
    ['attempt', 'authId', 'caseId', 'idempotencyKey'],
  ]);
  assert.deepEqual(jobs.map((job) => job.caseId), [ALPHA, BETA, GAMMA]);
  assert.deepEqual(jobs.map((job) => job.idempotencyKey), [
    `auth-1:${ALPHA}:1`,
    `auth-1:${BETA}:1`,
    `auth-1:${GAMMA}:1`,
  ]);
});
