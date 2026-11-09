// Interruption matrix. Each row drives the case store, the extension reader, or the
// transfer controller and measures mixed cases, duplicate insertions, and lost edits.
import assert from 'node:assert/strict';
import { CaseStore, MemoryBackend, PausedError, StepFailedError } from '../../case-store/src/index.js';
import { USER_ACTION } from '../../chat-editor/src/index.js';
import { createTracker, readCase } from '../../extension/src/core.js';
import { setup } from '../../transfer/test/fixtures.js';
import { LIST_URL, fileResponse, htmlResponse, listDoc } from './page.js';

const MANUAL = 'Manual section marker.';
const MARK_A = 'mark-a';
const MARK_B = 'mark-b';

function memoryStore(backend = new MemoryBackend()) {
  let browser = true;
  const store = new CaseStore({
    backend,
    now: () => 1_000,
    sleep: async () => {},
    browserSession: () => browser,
  });
  return { backend, store, setBrowser: (v) => { browser = v; } };
}

function row(id, kind, measured) {
  return { id, kind, ...measured };
}

function lost(current, expected) {
  return current === expected ? 0 : 1;
}

export async function runFailureMatrix() {
  const interruptions = [];

  {
    const { store } = memoryStore();
    const c = await store.openCase('fixture-alpha');
    await c.saveUserEdit('d1', MANUAL);
    let fail = 1;
    let applied = 0;
    await c.runStep('worker', async () => {
      if (fail) { fail -= 1; throw new Error('worker stopped'); }
      applied += 1;
      return 'ok';
    }, { backoffMs: 0 });
    interruptions.push(row('worker-crash-retry', 'worker', {
      mixed: 0,
      duplicateInsertions: applied === 1 ? 0 : applied,
      lostManualEdits: lost((await c.getDraft('d1')).current, MANUAL),
    }));
  }

  {
    const { backend, store } = memoryStore();
    const c = await store.openCase('fixture-alpha');
    await c.saveUserEdit('d1', MANUAL);
    let applied = 0;
    await c.runStep('once', async () => { applied += 1; return 'kept'; });
    const restarted = await new CaseStore({ backend, now: () => 1_000, sleep: async () => {}, browserSession: () => true }).openCase('fixture-alpha');
    const again = await restarted.runStep('once', async () => { applied += 1; return 'second'; });
    interruptions.push(row('worker-restart-replay', 'resume-after-crash', {
      mixed: again === 'kept' ? 0 : 1,
      duplicateInsertions: applied === 1 ? 0 : applied,
      lostManualEdits: lost((await restarted.getDraft('d1')).current, MANUAL),
    }));
  }

  {
    const env = memoryStore();
    env.setBrowser(false);
    const c = await env.store.openCase('fixture-alpha');
    await c.saveUserEdit('d1', MANUAL);
    let applied = 0;
    await assert.rejects(
      c.runStep('browser', async () => { applied += 1; return 'x'; }, { needsBrowserSession: true }),
      (e) => e instanceof PausedError && e.pause.reason === 'pje_session_unavailable',
    );
    env.setBrowser(true);
    await c.resume();
    await c.runStep('browser', async () => { applied += 1; return 'x'; }, { needsBrowserSession: true });
    interruptions.push(row('browser-session-missing', 'browser', {
      mixed: 0,
      duplicateInsertions: applied === 1 ? 0 : applied,
      lostManualEdits: lost((await c.getDraft('d1')).current, MANUAL),
    }));
  }

  {
    const { store } = memoryStore();
    const c = await store.openCase('fixture-alpha');
    await c.saveUserEdit('d1', MANUAL);
    let fail = 2;
    let applied = 0;
    const result = await c.runStep('net', async () => {
      if (fail) { fail -= 1; throw new Error('network'); }
      applied += 1;
      return applied;
    }, { backoffMs: 0 });
    interruptions.push(row('network-blip', 'network', {
      mixed: 0,
      duplicateInsertions: result === 1 && applied === 1 ? 0 : applied,
      lostManualEdits: lost((await c.getDraft('d1')).current, MANUAL),
    }));
  }

  for (const [id, kind, err] of [
    ['auth-pause-resume', 'authentication', Object.assign(new Error('expired'), { code: 'auth_expired' })],
    ['quota-pause-resume', 'quota', Object.assign(new Error('limited'), { status: 429 })],
  ]) {
    const { store } = memoryStore();
    const c = await store.openCase('fixture-alpha');
    await c.saveUserEdit('d1', MANUAL);
    let armed = true;
    let applied = 0;
    const reason = id.startsWith('auth') ? 'auth_expired' : 'quota_exhausted';
    await assert.rejects(c.runStep(id, async () => {
      if (armed) throw err;
      applied += 1;
      return 'ok';
    }), (e) => e instanceof PausedError && e.pause.reason === reason);
    armed = false;
    await c.resume();
    await c.runStep(id, async () => { applied += 1; return 'ok'; });
    interruptions.push(row(id, kind, {
      mixed: 0,
      duplicateInsertions: applied === 1 ? 0 : applied,
      lostManualEdits: lost((await c.getDraft('d1')).current, MANUAL),
    }));
  }

  {
    const { store } = memoryStore();
    const c = await store.openCase('fixture-alpha');
    await c.saveUserEdit('d1', MANUAL);
    let applied = 0;
    await c.runStep('repeat', async () => { applied += 1; return 'ok'; });
    for (let i = 0; i < 5; i++) await c.runStep('repeat', async () => { applied += 1; return 'again'; });
    interruptions.push(row('repeated-run-step', 'repeated-clicks', {
      mixed: 0,
      duplicateInsertions: applied === 1 ? 0 : applied - 1,
      lostManualEdits: lost((await c.getDraft('d1')).current, MANUAL),
    }));
  }

  {
    const { store } = memoryStore();
    const c = await store.openCase('fixture-alpha');
    await c.saveUserEdit('d1', MANUAL);
    let applied = 0;
    await assert.rejects(
      c.runStep('budget', async () => { throw new Error('network'); }, { backoffMs: 0 }),
      (e) => e instanceof StepFailedError,
    );
    await c.resetStep('budget');
    await c.runStep('budget', async () => { applied += 1; return 'ok'; });
    interruptions.push(row('step-budget-reset', 'worker', {
      mixed: 0,
      duplicateInsertions: applied === 1 ? 0 : applied,
      lostManualEdits: lost((await c.getDraft('d1')).current, MANUAL),
    }));
  }

  {
    const { store } = memoryStore();
    const a = await store.openCase('fixture-alpha');
    const b = await store.openCase('fixture-beta');
    await a.saveUserEdit('d1', MARK_A);
    await b.saveUserEdit('d1', MARK_B);
    await a.runStep('only-a', async () => 'A');
    await b.runStep('only-b', async () => 'B');
    const diag = await store.diagnostics();
    const da = diag.cases.find((x) => x.caseId === 'fixture-alpha');
    const db = diag.cases.find((x) => x.caseId === 'fixture-beta');
    const mixed = (await a.getDraft('d1')).current !== MARK_A
      || (await b.getDraft('d1')).current !== MARK_B
      || da.steps.some((s) => s.step === 'only-b')
      || db.steps.some((s) => s.step === 'only-a') ? 1 : 0;
    interruptions.push(row('two-case-steps', 'worker', { mixed, duplicateInsertions: 0, lostManualEdits: mixed }));
  }

  {
    const { store } = memoryStore();
    const c = await store.openCase('fixture-alpha');
    await c.saveUserEdit('d1', MANUAL);
    await c.addGeneratedRevision('d1', 'generated one', { stepId: 'draft.d1.1' });
    await c.addGeneratedRevision('d1', 'generated two', { stepId: 'draft.d1.1' });
    const d = await c.getDraft('d1');
    interruptions.push(row('revision-replay', 'resume-after-crash', {
      mixed: 0,
      duplicateInsertions: Math.max(0, d.generated.length - 1),
      lostManualEdits: lost(d.current, MANUAL),
    }));
  }

  {
    let crash = true;
    const x = await setup({
      text: MANUAL,
      editorWrap: (e) => ({ ...e, write: (v) => { e.write(v); if (crash) { crash = false; throw new Error('worker stopped'); } } }),
    });
    const r = await x.ctl.review('d1', USER_ACTION);
    await assert.rejects(x.ctl.transfer(r.token, 'append', USER_ACTION), /worker stopped/);
    const out = await x.mk().transfer(r.token, 'append', USER_ACTION);
    const ticket = await x.c.get('checkpoint', `transfer.${r.token}`);
    interruptions.push(row('transfer-crash-after-write', 'resume-after-crash', {
      mixed: 0,
      duplicateInsertions: out.status === 'verified_after_interruption' && x.writes.length === 1 ? 0 : x.writes.length,
      lostManualEdits: ticket.before === MANUAL && x.pg.editor.textContent.startsWith(MANUAL) ? 0 : 1,
    }));
  }

  {
    let fail = true;
    const x = await setup({
      text: MANUAL,
      editorWrap: (e) => ({ ...e, write: (v) => { if (fail) { fail = false; throw new Error('page busy'); } e.write(v); } }),
    });
    const r = await x.ctl.review('d1', USER_ACTION);
    await assert.rejects(x.ctl.transfer(r.token, 'append', USER_ACTION), /page busy/);
    const out = await x.ctl.transfer(r.token, 'append', USER_ACTION);
    interruptions.push(row('transfer-crash-before-write', 'worker', {
      mixed: 0,
      duplicateInsertions: out.status === 'inserted' && x.writes.length === 1 ? 0 : x.writes.length,
      lostManualEdits: x.pg.editor.textContent.startsWith(MANUAL) ? 0 : 1,
    }));
  }

  {
    let partial = true;
    const x = await setup({
      text: MANUAL,
      editorWrap: (e, base) => ({
        ...e,
        write: (v) => {
          if (partial) { partial = false; base.write(v.slice(0, 12)); throw new Error('cut'); }
          e.write(v);
        },
      }),
    });
    const r = await x.ctl.review('d1', USER_ACTION);
    await assert.rejects(x.ctl.transfer(r.token, 'replace', USER_ACTION), /cut/);
    await assert.rejects(x.ctl.transfer(r.token, 'replace', USER_ACTION), (e) => e.reason === 'uncertain_editor_state');
    const ticket = await x.c.get('checkpoint', `transfer.${r.token}`);
    interruptions.push(row('uncertain-partial-write', 'uncertain-insertion', {
      mixed: 0,
      duplicateInsertions: x.writes.length === 0 ? 0 : x.writes.length,
      lostManualEdits: ticket.before === MANUAL && ticket.state === 'uncertain' ? 0 : 1,
    }));
  }

  {
    const x = await setup({ text: MANUAL });
    const r = await x.ctl.review('d1', USER_ACTION);
    const [first, second] = await Promise.allSettled([
      x.ctl.transfer(r.token, 'append', USER_ACTION),
      x.ctl.transfer(r.token, 'append', USER_ACTION),
    ]);
    interruptions.push(row('parallel-click', 'repeated-clicks', {
      mixed: 0,
      duplicateInsertions: first.value?.status === 'inserted' && second.reason?.reason === 'transfer_in_progress' && x.writes.length === 1 ? 0 : x.writes.length,
      lostManualEdits: x.pg.editor.textContent.startsWith(MANUAL) ? 0 : 1,
    }));
    const again = await x.ctl.transfer(r.token, 'append', USER_ACTION);
    interruptions.push(row('repeated-click-after-done', 'repeated-clicks', {
      mixed: 0,
      duplicateInsertions: again.status === 'already_done' && x.writes.length === 1 ? 0 : x.writes.length,
      lostManualEdits: x.pg.editor.textContent.startsWith(MANUAL) ? 0 : 1,
    }));
    let modeRefused = false;
    try { await x.ctl.transfer(r.token, 'replace', USER_ACTION); } catch (e) { modeRefused = e.reason === 'mode_changed'; }
    interruptions.push(row('second-click-other-mode', 'repeated-clicks', {
      mixed: 0,
      duplicateInsertions: modeRefused && x.writes.length === 1 ? 0 : x.writes.length,
      lostManualEdits: x.pg.editor.textContent.startsWith(MANUAL) ? 0 : 1,
    }));
  }

  {
    const x = await setup({ text: MANUAL });
    const r = await x.ctl.review('d1', USER_ACTION);
    x.pg.caseEl.textContent = 'SYNTH-0002';
    let stopped = false;
    try { await x.ctl.transfer(r.token, 'append', USER_ACTION); } catch (e) { stopped = e.reason === 'case_changed'; }
    interruptions.push(row('stale-case-keeps-manual', 'browser', {
      mixed: stopped && x.writes.length === 0 ? 0 : 1,
      duplicateInsertions: x.writes.length,
      lostManualEdits: x.pg.editor.textContent === MANUAL ? 0 : 1,
    }));
  }

  {
    const x = await setup({ text: MANUAL });
    const r = await x.ctl.review('d1', USER_ACTION);
    const newer = `${MANUAL} extra line.`;
    x.pg.editor.textContent = newer;
    let stopped = false;
    try { await x.ctl.transfer(r.token, 'append', USER_ACTION); } catch (e) { stopped = e.reason === 'editor_changed'; }
    interruptions.push(row('stale-editor-keeps-manual', 'browser', {
      mixed: 0,
      duplicateInsertions: stopped ? x.writes.length : x.writes.length + 1,
      lostManualEdits: x.pg.editor.textContent === newer ? 0 : 1,
    }));
  }

  {
    const x = await setup();
    const v1 = await x.s.view('d1');
    const edited = v1.text.replace(/## Relatório\n[^\n]*/, `## Relatório\n${MANUAL}`);
    await x.s.saveEdit('d1', edited);
    const v2 = await x.s.regenerate('d1');
    interruptions.push(row('regen-keeps-manual-section', 'worker', {
      mixed: 0,
      duplicateInsertions: 0,
      lostManualEdits: v2.text.includes(MANUAL) ? 0 : 1,
    }));
  }

  {
    let caseNo = 'SYNTH-A';
    const tracker = createTracker({
      getDoc: () => listDoc(caseNo),
      getUrl: () => LIST_URL,
      fetchPage: async (url) => (url.includes('/doc/') ? fileResponse() : htmlResponse(listDoc(caseNo))),
      publish() {},
    });
    await tracker.start();
    const first = tracker.status().inventory;
    caseNo = 'SYNTH-B';
    tracker.refresh();
    const status = tracker.status();
    interruptions.push(row('tracker-case-change', 'browser', {
      mixed: first.caseNumber === 'SYNTH-A' && status.inventory === null && status.view.caseNumber === 'SYNTH-B' ? 0 : 1,
      duplicateInsertions: 0,
      lostManualEdits: 0,
    }));
  }

  {
    const inv = await readCase({
      startDoc: listDoc('SYNTH-A'),
      startUrl: LIST_URL,
      fetchPage: async (url) => {
        if (url.includes('/doc/')) throw new Error('network down');
        return htmlResponse(listDoc('SYNTH-A'));
      },
    });
    interruptions.push(row('read-network-same-case', 'network', {
      mixed: inv.caseNumber === 'SYNTH-A' && inv.items.length === 1 && inv.items[0].state === 'failed' ? 0 : 1,
      duplicateInsertions: 0,
      lostManualEdits: 0,
    }));
  }

  const sum = (key) => interruptions.reduce((n, r) => n + r[key], 0);
  return {
    interruptions,
    mixedCases: sum('mixed'),
    duplicateInsertions: sum('duplicateInsertions'),
    lostManualEdits: sum('lostManualEdits'),
  };
}
