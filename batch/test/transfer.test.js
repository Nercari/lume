import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GateError } from '../../analysis/src/gate.js';
import { USER_ACTION } from '../../chat-editor/src/session.js';
import { BatchQueue, BatchStop, TransferGate } from '../src/index.js';
import { ALPHA, BETA, editorFor, fail, loadQueue, resultFor } from './fixtures.js';

async function ready() {
  const { selection, auth } = loadQueue([ALPHA, BETA], null);
  const queue = new BatchQueue({ runner: async (job) => resultFor(job.caseId) });
  queue.load(selection, auth);
  await queue.run();
  return { queue, gate: new TransferGate(queue) };
}

test('only the user-action symbol can review or hand off one case', async () => {
  const { gate } = await ready();
  const editor = editorFor(ALPHA);
  const forged = Symbol('chat-editor.user-action');
  for (const origin of [undefined, 'USER_ACTION', 'human', forged, { actor: 'human' }, ['sign']]) {
    assert.throws(() => gate.review(ALPHA, origin, editor), GateError);
    assert.throws(() => gate.handoff(ALPHA, origin, editor), GateError);
  }
  assert.throws(() => gate.review([ALPHA, BETA], USER_ACTION, editor), GateError);
  assert.throws(() => gate.handoff([ALPHA, BETA], USER_ACTION, editor), GateError);
  assert.equal(editor.state.writes, 0);
});

test('the batch does not sign, file, publish, insert, or transfer many cases', async () => {
  const { gate } = await ready();
  const editor = editorFor(ALPHA);
  gate.review(ALPHA, USER_ACTION, editor);
  for (const command of ['sign', 'file', 'publish', 'insert', 'empty', 'replace', 'append']) {
    assert.throws(() => gate.handoff(ALPHA, USER_ACTION, editor, command), (err) => err instanceof GateError && /does not sign, file, publish, or insert/.test(err.message));
  }
  assert.throws(() => gate.sign(USER_ACTION), (err) => err instanceof GateError && err.message === 'batch does not sign');
  assert.throws(() => gate.file(USER_ACTION), (err) => err instanceof GateError && err.message === 'batch does not file');
  assert.throws(() => gate.publish(USER_ACTION), (err) => err instanceof GateError && err.message === 'batch does not publish');
  assert.throws(() => gate.insert(USER_ACTION), (err) => err instanceof GateError && err.message === 'batch does not insert');
  assert.throws(() => gate.transferMany(USER_ACTION), (err) => err instanceof GateError && err.message === 'transfer is individual');
  assert.equal(editor.state.writes, 0);
  assert.equal(gate.handed.has(ALPHA), false);
});

test('each case needs its own user action and a matching case and editor', async () => {
  const { queue, gate } = await ready();
  const alpha = editorFor(ALPHA, 'editor-alpha');
  const beta = editorFor(BETA, 'editor-beta');

  assert.throws(() => gate.review(ALPHA, USER_ACTION, beta), (err) => err instanceof BatchStop && err.code === 'case_changed');
  const reviewed = gate.review(ALPHA, USER_ACTION, alpha);
  assert.equal(reviewed.effect, 'none');
  assert.equal(reviewed.caseId, ALPHA);
  assert.equal(reviewed.draftId, queue.report(ALPHA).draftId);

  alpha.state.editorId = 'editor-other';
  assert.throws(() => gate.handoff(ALPHA, USER_ACTION, alpha), (err) => err instanceof BatchStop && err.code === 'editor_changed');
  alpha.state.editorId = 'editor-alpha';
  alpha.state.caseId = BETA;
  assert.throws(() => gate.handoff(ALPHA, USER_ACTION, alpha), (err) => err instanceof BatchStop && err.code === 'case_changed');
  alpha.state.caseId = ALPHA;

  const first = gate.handoff(ALPHA, USER_ACTION, alpha);
  assert.deepEqual(first, {
    status: 'individual_handoff',
    effect: 'none',
    caseId: ALPHA,
    draftId: 'draft-fixture-alpha',
    editorId: 'editor-alpha',
  });
  const again = gate.handoff(ALPHA, USER_ACTION, alpha);
  assert.equal(again.status, 'already_handed_off');
  assert.equal(again.effect, 'none');
  assert.throws(() => gate.handoff(BETA, USER_ACTION, beta), (err) => err instanceof BatchStop && err.code === 'not_reviewed');
  gate.review(BETA, USER_ACTION, beta);
  const handed = gate.handoff(BETA, USER_ACTION, beta);
  assert.equal(handed.status, 'individual_handoff');
  assert.equal(handed.caseId, BETA);
  assert.equal(handed.draftId, 'draft-fixture-beta');
  assert.notEqual(handed.draftId, first.draftId);
  assert.equal(alpha.state.writes, 0);
  assert.equal(beta.state.writes, 0);
  assert.equal(queue.report(ALPHA).draft, 'draft:fixture-alpha');
  assert.equal(queue.report(BETA).draft, 'draft:fixture-beta');
});

test('a case without its own result is not transferable', async () => {
  const { selection, auth } = loadQueue([ALPHA], null);
  const queue = new BatchQueue({
    runner: async () => { throw fail('case_failed', { retryable: false }); },
  });
  queue.load(selection, auth);
  await queue.run();
  const gate = new TransferGate(queue);
  const editor = editorFor(ALPHA);
  assert.throws(() => gate.review(ALPHA, USER_ACTION, editor), (err) => err instanceof BatchStop && err.code === 'not_ready');
  assert.equal(editor.state.writes, 0);
});
