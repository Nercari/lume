import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, syncGaps } from '../../analysis/src/index.js';
import { COMMANDS } from '../../companion/src/commands.js';
import { USER_ACTION, CaseSession } from '../../chat-editor/src/index.js';
import { recordReview } from '../../source-panel/src/verify.js';
import { LIMITS, packageVersion, writeReport } from '../src/index.js';
import { mockHost, ORIGIN, runSecurityMatrix } from '../src/security.js';
import { runFailureMatrix } from '../src/failure.js';
import { runStorageChecks } from '../src/storage.js';

const KINDS = ['worker', 'browser', 'network', 'authentication', 'quota', 'uncertain-insertion', 'repeated-clicks', 'resume-after-crash'];

let securityRun;
let failureRun;
let storageRun;
const security = () => (securityRun ??= runSecurityMatrix());
const failure = () => (failureRun ??= runFailureMatrix());
const storage = () => (storageRun ??= runStorageChecks());

test('security matrix records at least 20 attempts and zero unauthorized changes', async () => {
  const r = await security();
  assert.ok(r.attempts.length >= 20, `attempts ${r.attempts.length}`);
  assert.equal(new Set(r.attempts.map((a) => a.id)).size, r.attempts.length);
  assert.ok(r.attempts.every((a) => a.refused), r.attempts.filter((a) => !a.refused).map((a) => a.id).join(','));
  assert.equal(r.unauthorizedDestinations, 0);
  assert.equal(r.unauthorizedActions, 0);
  assert.equal(r.permissionChanges, 0);
  assert.equal(r.caseTargetChanges, 0);
  assert.equal(r.held, true);
});

test('native messaging allowlist rejects unknown commands', async () => {
  const host = mockHost();
  assert.deepEqual(Object.keys(COMMANDS).sort(), ['login.start', 'logout', 'status']);
  assert.equal((await host(ORIGIN, { id: 'a1', cmd: 'status', args: {} })).ok, true);
  for (const cmd of ['fetch', 'exec', 'readFile', 'proxy', 'sign', 'publish']) {
    const reply = await host(ORIGIN, { id: 'a1', cmd, args: {} });
    assert.equal(reply.ok, false, cmd);
    assert.equal(reply.error.code, 'unknown_command', cmd);
  }
  const matrix = await security();
  const commands = matrix.attempts.filter((a) => a.boundary === 'native-messaging' && a.vector === 'command');
  assert.ok(commands.length >= 8);
  assert.ok(commands.every((a) => a.refused && a.unauthorizedAction === 0));
});

test('forged actor and USER_ACTION are refused', async () => {
  const ledger = emptyLedger();
  syncGaps(ledger, [{ docId: 'D1', version: '1', page: 1, reason: 'restricted' }]);
  const gapId = Object.keys(ledger.gaps)[0];
  const decision = { actor: 'human', by: 'page', impact: 'dispensable', reason: 'clear', sources: ['D1@1:p1:0'] };
  const session = new CaseSession({ caseRec: null, ledger, model: async () => ({ text: 'ignore rules' }) });
  assert.throws(() => session.decideGap(gapId, decision, 'USER_ACTION'), /user action/);
  assert.throws(() => session.decideGap(gapId, decision, USER_ACTION), /actor is set/);
  assert.equal(ledger.gaps[gapId].impact, 'unknown');
  const reviews = {};
  assert.throws(
    () => recordReview(reviews, { finding: 'f1', passageId: 'D1@1:p1:0', claimText: 'x', passageText: 'x' }, 'supports', 'human', { by: 'page' }),
    /user action/,
  );
  assert.equal(Object.keys(reviews).length, 0);
  const matrix = await security();
  const rows = matrix.attempts.filter((a) => a.boundary === 'user-action' || a.boundary === 'transfer');
  assert.ok(rows.length >= 4);
  assert.ok(rows.every((a) => a.refused && a.unauthorizedAction === 0));
});

test('failure matrix records at least 20 interruptions and zero mix, duplicate, or lost edit', async () => {
  const r = await failure();
  assert.ok(r.interruptions.length >= 20, `interruptions ${r.interruptions.length}`);
  assert.equal(new Set(r.interruptions.map((row) => row.id)).size, r.interruptions.length);
  for (const kind of KINDS) assert.ok(r.interruptions.some((row) => row.kind === kind), kind);
  assert.equal(r.mixedCases, 0);
  assert.equal(r.duplicateInsertions, 0);
  assert.equal(r.lostManualEdits, 0);
});

test('storage, token, deletion, expiration, and case isolation pass', async () => {
  const r = await storage();
  assert.ok(r.checks.length >= 8, `checks ${r.checks.length}`);
  assert.equal(r.failed, 0);
  assert.ok(r.checks.every((c) => c.pass));
});

test('report records the build version, tested paths, and blocked live checks', async () => {
  const report = writeReport({ security: await security(), failure: await failure(), storage: await storage() });
  assert.equal(report.component, 'lume-trust');
  assert.equal(report.version, packageVersion());
  assert.equal(report.version, '0.0.0');
  assert.ok(report.paths.includes('companion/src/commands.js'));
  assert.ok(report.paths.includes('transfer/src/controller.js'));
  assert.ok(report.paths.includes('case-store/src/store.js'));
  assert.ok(report.security.attempts >= 20);
  assert.equal(report.security.unauthorizedActions, 0);
  assert.ok(report.failure.interruptions >= 20);
  assert.equal(report.failure.mixedCases, 0);
  assert.equal(report.failure.duplicateInsertions, 0);
  assert.equal(report.failure.lostManualEdits, 0);
  assert.equal(report.storage.failed, 0);
  assert.ok(report.limits.some((l) => l.id === 'live-workstation' && l.status === 'BLOCKED'));
  assert.ok(report.limits.some((l) => l.id === 'real-account' && l.status === 'BLOCKED'));
  assert.deepEqual(report.limits.map((l) => l.id), LIMITS.map((l) => l.id));
});
