// Panel-level tests: real trackers (one per simulated page load) feed createPanelSync + panelView,
// the same two functions panel.js uses to decide what to show.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPanelSync, createTracker, panelView } from '../src/core.js';
import { loginPage, page1, page2, PAGE1, PAGE2, transport } from './fixtures.js';

const TAB = 7;

// One content-script instance on one page load. setPage simulates in-page (AJAX) changes.
function load(initial, fetchPage = transport().fetchPage) {
  let page = initial;
  let url = PAGE1;
  const sent = [];
  const tracker = createTracker({ getDoc: () => page, getUrl: () => url, fetchPage, publish: (s) => sent.push(s) });
  return { tracker, sent, setPage: (p, u = url) => { page = p; url = u; return tracker.refresh(); } };
}

// Mirrors panel.js show(): accepted states render, the rest are dropped.
function panel() {
  const sync = createPanelSync();
  sync.bind(TAB);
  let shown = panelView(null);
  return {
    sync,
    show: (state) => { if (!state || sync.accept(TAB, state)) shown = panelView(state); return shown; },
    get shown() { return shown; },
  };
}

test('panel: a full reload to case B shows B even though the new epoch restarts at 0', async () => {
  const p = panel();
  const a = load(page1());
  p.show(a.tracker.status());
  a.setPage(page2(), PAGE2); // in-page list change: epoch 1
  a.setPage(page1(), PAGE1); // epoch 2
  p.show(a.sent.at(-1));
  assert.equal(a.tracker.status().epoch, 2);
  assert.equal(p.shown.caseNumber, 'TEST-CASE-A');

  // Full navigation in the same tab, without an onUpdated event reaching the panel first.
  const tB = transport({
    [PAGE1]: () => ({ status: 200, contentType: 'text/html', doc: page1({ caseNumber: 'TEST-CASE-B' }) }),
    [PAGE2]: () => ({ status: 200, contentType: 'text/html', doc: page2({ caseNumber: 'TEST-CASE-B' }) }),
  });
  const b = load(page1({ caseNumber: 'TEST-CASE-B' }), tB.fetchPage);
  assert.equal(b.tracker.status().epoch, 0);
  assert.notEqual(b.tracker.status().load, a.tracker.status().load);
  p.show(b.tracker.status());
  assert.equal(p.shown.caseNumber, 'TEST-CASE-B');
  assert.equal(p.shown.statusKey, 'case');
  assert.equal(p.shown.canStart, true);

  // The Start reply and the progress of case B are shown.
  const run = b.tracker.start();
  p.show(b.tracker.status());
  await run;
  for (const s of b.sent) p.show(s);
  assert.equal(p.shown.caseNumber, 'TEST-CASE-B');
  assert.equal(p.shown.statusKey, 'complete');
  assert.equal(p.shown.counts.identified, 8);

  // A state from an older epoch of the current load is still dropped.
  p.show({ ...b.tracker.status(), epoch: -1 });
  assert.equal(p.shown.caseNumber, 'TEST-CASE-B', 'an older epoch of the current load is dropped');
});

test('panel: re-login after session_expired shows the case again and allows Start', async () => {
  const p = panel();
  const a = load(page1());
  p.show(a.tracker.status());
  a.setPage(loginPage()); // the session expires in place: epoch 1, view session_expired
  p.show(a.sent.at(-1));
  assert.equal(p.shown.statusKey, 'session_expired');
  assert.equal(p.shown.stop, true);
  assert.equal(p.shown.canStart, false);

  const relogged = load(page1()); // login posts and the case page loads again: new load, epoch 0
  p.show(relogged.tracker.status());
  assert.equal(p.shown.caseNumber, 'TEST-CASE-A');
  assert.equal(p.shown.statusKey, 'case');
  assert.equal(p.shown.stop, false);
  assert.equal(p.shown.canStart, true);
});

test('panel: navigation away from PJe clears the case and its inventory', async () => {
  const p = panel();
  const a = load(page1());
  await a.tracker.start();
  p.show(a.sent.at(-1));
  assert.equal(p.shown.counts.identified, 8);

  assert.equal(p.sync.navigated(TAB), true); // onUpdated status 'loading'
  p.show(null); // onUpdated status 'complete': no content script answers outside PJe
  assert.deepEqual(
    { c: p.shown.caseNumber, k: p.shown.statusKey, n: p.shown.counts.identified, i: p.shown.items.length, s: p.shown.canStart },
    { c: null, k: 'not_pje', n: 0, i: 0, s: false },
  );
  assert.equal(p.sync.navigated(TAB + 1), false, 'another tab does not unbind this one');
});

test('panel: states from another tab and inventories of another case are never shown', () => {
  const p = panel();
  const a = load(page1());
  assert.equal(p.sync.accept(TAB + 1, a.tracker.status()), false);
  const view = panelView({ load: 'x', epoch: 0, view: { status: 'case', caseNumber: 'TEST-CASE-B' }, inventory: { caseNumber: 'TEST-CASE-A', status: 'complete', items: [{ id: 'D1', state: 'processed' }] } });
  assert.equal(view.counts.identified, 0);
  assert.deepEqual(view.items, []);
});
