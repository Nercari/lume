// Assertion classes and support checks (#6). Model output is untrusted input: every assertion is
// checked here before it becomes a finding, and a decisive assertion without admissible support is
// kept visible as unsupported, never presented as a documented fact.
import { canSupportDecisive } from '../../extraction/src/extract.js';
import { parseRef } from '../../extraction/src/store.js';

export const CLASSES = Object.freeze(['fact', 'allegation', 'contradiction', 'unknown', 'legal_conclusion']);
// Classes whose decisive use needs a cited passage. An allegation needs the passage that alleges it.
const NEEDS_SUPPORT = ['fact', 'allegation', 'contradiction'];

export const portionOf = (id) => {
  const r = parseRef(id);
  return `${r.docId}@${r.version}:p${r.page}`;
};

// assertion: { class, text, decisive?, support?: [passageId], subject?, value? }
// subject/value let the ledger compare facts across documents without another model call.
export function admit(L, stepId, callPortions, inputPassages, assertions) {
  const input = new Map(inputPassages.map((p) => [p.id, p]));
  assertions.forEach((a, i) => {
    const issues = [];
    let cls = a.class;
    if (!CLASSES.includes(cls)) {
      issues.push(`invalid class ${String(cls)}`);
      cls = 'unknown';
    }
    const cited = [...new Set(a.support ?? [])];
    const support = [];
    const rejected = [];
    for (const id of cited) {
      const p = input.get(id);
      if (!p) {
        rejected.push({ id, reason: 'not_in_call_input' });
        continue;
      }
      const ok = a.decisive ? canSupportDecisive(p) : { ok: true };
      if (ok.ok) support.push(id);
      else rejected.push({ id, reason: ok.reason });
    }
    const decisive = Boolean(a.decisive);
    let supported = true;
    if (decisive && NEEDS_SUPPORT.includes(cls) && support.length < (cls === 'contradiction' ? 2 : 1)) {
      supported = false;
      issues.push(cls === 'contradiction' ? 'contradiction needs two admissible sources' : 'no admissible source for a decisive assertion');
    }
    const id = `${stepId}#${i}`;
    L.findings[id] = {
      id, class: cls, text: String(a.text ?? ''), decisive, support, rejected, supported, issues,
      subject: a.subject ?? null, value: a.value ?? null,
      portions: [...new Set([...callPortions, ...support.map(portionOf)])],
      origin: stepId, stale: null,
    };
  });
}

// Rebuilds the automatic contradictions: two current facts or allegations about the same subject
// with different values. All of them are listed; nothing ranks them away.
export function detectContradictions(L) {
  for (const id of Object.keys(L.findings)) if (L.findings[id].origin === 'auto') delete L.findings[id];
  const bySubject = new Map();
  for (const f of Object.values(L.findings)) {
    // A side whose only source was rejected (for example low-confidence OCR) still surfaces; the
    // contradiction is then unsupported and opens a gap instead of disappearing.
    if (f.stale || !f.subject || !['fact', 'allegation'].includes(f.class) || !(f.support.length || f.rejected.length)) continue;
    if (!bySubject.has(f.subject)) bySubject.set(f.subject, []);
    bySubject.get(f.subject).push(f);
  }
  for (const [subject, fs] of bySubject) {
    const values = new Set(fs.map((f) => JSON.stringify(f.value)));
    if (values.size < 2) continue;
    const id = `contra:${subject}`;
    L.findings[id] = {
      id, class: 'contradiction', text: `Sources disagree on ${subject}`,
      decisive: fs.some((f) => f.decisive), supported: fs.every((f) => f.support.length > 0),
      issues: fs.every((f) => f.support.length > 0) ? [] : ['a side has no admissible source'],
      rejected: fs.flatMap((f) => f.rejected),
      support: [...new Set(fs.flatMap((f) => f.support))],
      sides: fs.map((f) => ({ finding: f.id, class: f.class, value: f.value, support: f.support, rejected: f.rejected })),
      subject, value: null, portions: [...new Set(fs.flatMap((f) => f.portions))], origin: 'auto', stale: null,
    };
  }
}

// Every finding, grouped by class, with no ranking or cut-off. Stale findings stay listed.
export function summary(L) {
  const out = Object.fromEntries(CLASSES.map((c) => [c, []]));
  for (const f of Object.values(L.findings)) out[f.class].push(f);
  return out;
}
