// One case context for chat and drafting (#8). It is built only from the #6 ledger: current
// findings, open gaps and the permitted #2 passages. Style material never enters it.
import { openGaps } from '../../analysis/src/index.js';

export function buildContext(L) {
  const findings = Object.values(L.findings).filter((f) => !f.stale).map((f) => ({
    id: f.id, class: f.class, text: f.text, decisive: f.decisive, supported: f.supported,
    subject: f.subject, value: f.value, support: [...f.support],
  }));
  const gaps = openGaps(L).map((g) => ({ id: g.id, reason: g.reason, impact: g.impact, docId: g.docId, page: g.page }));
  const passages = Object.values(L.passages).map((p) => ({ id: p.id, text: p.text }));
  return Object.freeze({ rev: L.rev, findings, gaps, passages });
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// outcome: { text, premises: [{ subject, value }] }. A premise is what the outcome needs to be
// true. A current fact or allegation on that subject with another value is contrary evidence, and
// a contradiction on that subject is too. Nothing here ranks or drops them.
export function incompatibilities(ctx, outcome) {
  if (!outcome) return [];
  const out = [];
  for (const p of outcome.premises ?? []) for (const f of ctx.findings) {
    if (f.subject !== p.subject) continue;
    if (f.class === 'contradiction') out.push({ finding: f.id, premise: p, kind: 'contradiction' });
    else if (['fact', 'allegation'].includes(f.class) && !same(f.value, p.value)) out.push({ finding: f.id, premise: p, kind: 'contrary', found: f.value });
  }
  return out;
}

// Findings the draft must address: every current contradiction, plus the contrary evidence.
export const mustAddress = (ctx, outcome) => [...new Set([
  ...ctx.findings.filter((f) => f.class === 'contradiction').map((f) => f.id),
  ...incompatibilities(ctx, outcome).map((i) => i.finding),
])];

// Source-panel interface. The draft text stays clean; references and verification live here.
// shortcut: verification is always 'unverified'; #10 fills it with the citation checks.
export function sourcePanel(ctx, draft, moved = []) {
  const byId = new Map(ctx.findings.map((f) => [f.id, f]));
  const entries = [];
  const add = (ref, ids) => {
    for (const id of ids) {
      const f = byId.get(id);
      entries.push({ ref, finding: id, class: f?.class ?? null, text: f?.text ?? null, passages: f?.support ?? [], verification: f ? 'unverified' : 'not_in_case' });
    }
  };
  for (const s of draft.sections) add(s.id, s.uses);
  if (draft.conclusion) add('conclusion', draft.conclusion.uses ?? []);
  return { entries, movedCitations: moved };
}
