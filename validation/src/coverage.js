// Inventory reconciliation against a private-manifest-shaped set (#3 + #2 + #4).
// Pending slices stay untested. A stand-in result for a pending slice is ignored.
import { SLICES, validateManifest } from '../../intake/src/manifest.mjs';
import { STATES } from '../../extension/src/core.js';
import { reconcile } from '../../extraction/src/reconcile.js';
import { DENOMINATORS } from './denominators.js';

const on = (v) => v === true;

function statusOf(d) {
  return {
    doc: d.doc,
    pages: d.pages,
    kind: d.kind,
    readable: d.readable === true,
    restricted: on(d.restricted),
    added_late: on(d.added_late),
  };
}

export function scoreCoverage(manifest, observedByCase, { standIns = {} } = {}) {
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`manifest: ${errors.join('; ')}`);

  let documentMisses = 0;
  let pageMismatch = 0;
  let statusMismatch = 0;
  let unexpected = 0;
  let silentOmissions = 0;
  let reconcileFailures = 0;
  let reconcileChecked = 0;
  const cases = [];

  for (const c of manifest.cases) {
    const expected = c.annotation.inventory.map(statusOf);
    const gotList = (observedByCase[c.id]?.documents ?? []).map(statusOf);
    const got = new Map(gotList.map((d) => [d.doc, d]));
    let caseMisses = 0;
    for (const e of expected) {
      const g = got.get(e.doc);
      if (!g) {
        caseMisses++;
        documentMisses++;
        silentOmissions++;
        continue;
      }
      if (g.pages !== e.pages) pageMismatch++;
      const same = g.kind === e.kind && g.readable === e.readable && g.restricted === e.restricted && g.added_late === e.added_late;
      if (!same) statusMismatch++;
    }
    const counts = new Map();
    for (const g of gotList) counts.set(g.doc, (counts.get(g.doc) ?? 0) + 1);
    for (const [doc, n] of counts) {
      const known = expected.some((e) => e.doc === doc);
      if (!known) unexpected++;
      else if (n !== 1) unexpected += n - 1;
    }

    let reconcileOk = null;
    const sample = observedByCase[c.id]?.reconcile;
    if (sample) {
      reconcileChecked++;
      for (const item of sample.inventory.items) {
        if (!STATES.includes(item.state)) throw new TypeError(`inventory state ${item.state} is not a #4 state`);
      }
      const rec = reconcile(sample.inventory, sample.results);
      reconcileOk = rec.ok;
      if (!rec.ok) {
        reconcileFailures++;
        silentOmissions += rec.silentOmissions.length;
      }
    }
    cases.push({ id: c.id, pageCount: c.page_count, slices: [...c.slices], documentMisses: caseMisses, reconcileOk });
  }

  const slices = SLICES.map((slice) => {
    const pending = manifest.pending_slices.find((p) => p.slice === slice);
    if (pending) {
      return {
        slice,
        status: 'untested',
        passed: false,
        reason: pending.reason,
        standInIgnored: Boolean(standIns[slice]),
      };
    }
    const covered = manifest.cases.some((c) => c.slices.includes(slice));
    return { slice, status: covered ? 'present-in-set' : 'untested', passed: false, reason: null, standInIgnored: false };
  });

  const hasLongRecord = manifest.cases.some((c) => c.slices.includes('long-record') && c.page_count >= DENOMINATORS.longRecordPages);
  const exerciseOk = documentMisses === 0 && pageMismatch === 0 && statusMismatch === 0 && unexpected === 0
    && silentOmissions === 0 && reconcileFailures === 0
    && manifest.cases.length >= DENOMINATORS.minCases && hasLongRecord;

  return {
    denominator: DENOMINATORS.inventory,
    exerciseOk,
    acceptancePassed: false,
    documentMisses,
    pageMismatch,
    statusMismatch,
    unexpected,
    silentOmissions,
    reconcileChecked,
    reconcileFailures,
    cases,
    slices,
  };
}
