// Offline smoke check of the #7 acceptance scenario with the AES-GCM codec. Synthetic data only.
// Prints one JSON line and exits 1 if any check fails.
import { CaseStore, MemoryBackend, createAesGcmCodec } from './src/index.js';

const backend = new MemoryBackend();
let t = 1_000_000;
const make = (open = true) =>
  new CaseStore({ backend, codec: createAesGcmCodec({ backend }), now: () => t, sleep: async () => {}, browserSession: () => open });

const store = make();
const a = await store.openCase('smoke-alpha');
const b = await store.openCase('smoke-beta');
await b.saveUserEdit('d1', 'beta edit');
await a.putTemp('dl', 'bytes', 1000);
let calls = 0;
await a.runStep('analysis', async () => (++calls, 'gen 1'));
await a.addGeneratedRevision('d1', 'gen 1', { stepId: 'analysis' });
await a.saveUserEdit('d1', 'alpha edit');

// Worker and browser restart: a new store on the same backend replays the step.
const a2 = await make().openCase('smoke-alpha');
await a2.runStep('analysis', async () => (++calls, 'gen 1'));
const late = await a2.addGeneratedRevision('d1', 'gen 2');
const draft = await a2.getDraft('d1');

// Auth expiry pauses once and stays paused until the user resumes.
let authCalls = 0;
const expired = async () => (++authCalls, Promise.reject(Object.assign(new Error('Bearer FAKEtokenFAKEtoken0123'), { status: 401 })));
const paused = await a2.runStep('read', expired).catch((e) => e.pause?.reason);
await a2.runStep('read', expired).catch(() => {});

const diag = JSON.stringify(await store.diagnostics());
await store.deleteCase('smoke-alpha');
const left = (await backend.keys('')).filter((k) => k.includes('smoke-alpha')).length;
const checks = {
  stepRunsOnce: calls === 1,
  editKept: draft.current === 'alpha edit' && draft.source === 'user',
  conflictShown: late.conflict?.generatedRev === 2,
  authPausedOnce: paused === 'auth_expired' && authCalls === 1,
  noTokenInDiagnostics: !/FAKEtoken/.test(diag),
  deleteScoped: left === 0 && (await (await store.openCase('smoke-beta')).getDraft('d1')).current === 'beta edit',
};
console.log(JSON.stringify({ case_store_smoke: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL', ...checks }));
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
