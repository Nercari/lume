// Source panel verification (#10). A citation is checked on four separate axes. Only a human
// inspection can confirm semantic support; a literal string match proves at most quote accuracy.
import { openSource, canSupportDecisive, parseRef } from '../../extraction/src/index.js';
import { buildContext, sourcePanel, USER_ACTION } from '../../chat-editor/src/index.js';
import { GateError } from '../../analysis/src/index.js';

export const VERDICTS = Object.freeze(['supports', 'partial', 'does_not_support']);
// Labels for a decisive assertion without inspectable support, by #6 class.
export const UNSUPPORTED_LABEL = Object.freeze({
  fact: 'unsupported_allegation', allegation: 'unsupported_allegation',
  legal_conclusion: 'inference', unknown: 'uncertainty', contradiction: 'uncertainty',
});
const UNSUPPORTED = new Set(Object.values(UNSUPPORTED_LABEL));

const norm = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
// Quoted text in a draft section: "..." or “...”.
export const quotesIn = (text) => [...String(text).matchAll(/"([^"]+)"|“([^”]+)”/g)].map((m) => norm(m[1] ?? m[2]));
const reviewKey = (findingId, passageId) => `${findingId}|${passageId}`;

// A passage method #2 can trust. Blank or missing is not OCR-safe and must not throw.
const methodOf = (passage) => {
  const method = passage?.method;
  return typeof method === 'string' && method.trim() ? method : null;
};

// #2 openSource reads passage.method before it returns. A passage with no method throws there,
// so read the stored record first and skip that call when the method is missing.
async function openPassage(caseRec, passageId) {
  const ref = parseRef(passageId);
  const rec = await caseRec.get('extraction', `${ref.docId}@${ref.version}`);
  const page = rec?.pages?.find((p) => p.page === ref.page);
  const passage = page?.passages?.find((p) => p.id === passageId);
  if (passage && methodOf(passage) == null) {
    return {
      found: true, ...ref, passage, pageText: page.text ?? '',
      link: rec.href ? `${rec.href}#page=${ref.page}` : null,
      image: null, imageStatus: 'not_applicable',
    };
  }
  return openSource(caseRec, passageId);
}

// Quote axis among the passages one section cites.
// exact: this page contains a quote, and every quote sits on some cited page.
// none: this page contains none of them, and every quote sits on another cited page.
// mismatch: some quote sits on no cited page. That citation cannot be verified.
function quoteAxis(quotes, pageText, otherPageTexts) {
  if (!quotes.length) return 'none';
  const has = (text, q) => norm(text).includes(q);
  const inThis = (q) => has(pageText, q);
  const placed = (q) => inThis(q) || otherPageTexts.some((t) => has(t, q));
  if (quotes.some((q) => !placed(q))) return 'mismatch';
  return quotes.some(inThis) ? 'exact' : 'none';
}

function statusOf(out) {
  if (out.existence !== 'found') return out.existence;
  if (out.quote === 'mismatch') return 'quote_mismatch';
  if (!['reliable', 'not_applicable'].includes(out.ocr)) return 'ocr_unreliable';
  if (out.semantic === 'review_stale') return 'stale';
  if (out.semantic === 'uninspected') return 'unverified';
  if (out.semantic === 'supports') return 'verified';
  return 'not_supported';
}

function applyQuotes(citations, quotes) {
  const texts = citations.map((c) => c.pageText);
  for (let i = 0; i < citations.length; i++) {
    citations[i].quote = quoteAxis(quotes, texts[i], texts.filter((_, j) => j !== i));
    citations[i].status = statusOf(citations[i]);
  }
}

// Records a human inspection of one citation. Only the UI user-action handler holds USER_ACTION
// (#8), so model output or page content cannot mark a citation as supporting. The review keeps the
// claim and passage text it saw; a later change to either makes the review stale.
export function recordReview(reviews, { finding, passageId, claimText, passageText }, verdict, origin, { by, now = Date.now() } = {}) {
  if (origin !== USER_ACTION) throw new GateError('a citation review needs a user action');
  if (!VERDICTS.includes(verdict)) throw new TypeError(`invalid verdict ${String(verdict)}`);
  if (!by) throw new TypeError('a review needs a reviewer');
  reviews[reviewKey(finding, passageId)] = { verdict, by, at: now, claimText, passageText };
  return reviews;
}

// Checks one citation: finding -> passage. Returns the four axes and one honest status.
export async function checkCitation(caseRec, L, finding, passageId, { quotes = [], reviews = {} } = {}) {
  const src = await openPassage(caseRec, passageId);
  const current = Boolean(L.passages[passageId]) && !finding.stale;
  const out = {
    passageId, docId: src.docId, version: src.version, page: src.page,
    excerpt: src.passage?.text ?? null, link: src.link ?? null,
    image: src.image ?? null, imageStatus: src.imageStatus ?? null,
    pageText: src.found ? (src.pageText ?? '') : null,
    existence: !src.found ? 'not_found' : current ? 'found' : 'stale',
    quote: 'none', ocr: 'not_applicable', semantic: 'uninspected', review: null,
  };
  if (src.found) {
    // Single-citation check: every quote has to be on this page. buildPanel attributes a
    // section's quotes across the pages it cites, so a quote is not charged to the wrong one.
    if (quotes.length) out.quote = quotes.every((q) => norm(src.pageText).includes(q)) ? 'exact' : 'mismatch';
    const method = methodOf(src.passage);
    if (method == null) out.ocr = 'missing_method';
    else if (method.startsWith('ocr:')) {
      const ok = canSupportDecisive(src.passage);
      out.ocr = ok.ok ? 'reliable' : ok.reason;
    }
    const r = reviews[reviewKey(finding.id, passageId)];
    if (r) {
      out.review = { verdict: r.verdict, by: r.by, at: r.at };
      out.semantic = r.claimText === finding.text && r.passageText === src.passage?.text ? r.verdict : 'review_stale';
    }
  }
  out.status = statusOf(out);
  return out;
}

// Opens one finding's sources: every cited passage, and every passage #6 rejected (for example
// low-confidence OCR), with document ID, version, page, excerpt, link and OCR page image.
export async function openClaim(caseRec, L, findingId, opts = {}) {
  const f = L.findings[findingId];
  if (!f) return { found: false, finding: findingId };
  const citations = [];
  for (const id of f.support) citations.push(await checkCitation(caseRec, L, f, id, { reviews: opts.reviews ?? {} }));
  applyQuotes(citations, opts.quotes ?? []);
  const rejected = [];
  for (const r of f.rejected ?? []) {
    const src = await openSource(caseRec, r.id).catch(() => ({ found: false }));
    rejected.push({ passageId: r.id, reason: r.reason, found: src.found, excerpt: src.passage?.text ?? null, image: src.image ?? null, imageStatus: src.imageStatus ?? null });
  }
  return { found: true, finding: f.id, class: f.class, text: f.text, decisive: f.decisive, stale: f.stale, citations, rejected };
}

// The entry status: verified only when every citation is verified.
function entryStatus(f, e, citations) {
  if (!f) return 'not_in_case';
  if (f.stale) return 'stale';
  if (e.verification === 'unsupported') return UNSUPPORTED_LABEL[f.class] ?? 'uncertainty';
  if (!citations.length) return 'unverified';
  const order = ['not_found', 'stale', 'quote_mismatch', 'ocr_unreliable', 'not_supported', 'unverified'];
  return order.find((s) => citations.some((c) => c.status === s)) ?? 'verified';
}

// Builds the panel for a #8 draft ({ sections: [{ id, text, uses }], conclusion }). It replaces the
// #8 'unverified' stub with the checks above. The draft text is not changed.
export async function buildPanel(caseRec, L, draft, { reviews = {} } = {}) {
  const base = sourcePanel(buildContext(L), draft);
  const textOf = new Map(draft.sections.map((s) => [s.id, s.text]));
  if (draft.conclusion) textOf.set('conclusion', `${draft.conclusion.text ?? ''} ${draft.conclusion.reasoning ?? ''}`);
  // Open every citation first. A section quote is then matched to the cited page that contains
  // it, not required on every passage the section cites. An unmatched quote is a mismatch on
  // each citation in the section, so none of them can become verified.
  const rows = [];
  for (const e of base.entries) {
    const f = L.findings[e.finding];
    const opened = f ? await openClaim(caseRec, L, f.id, { reviews }) : null;
    rows.push({
      f, base: e,
      entry: {
        ref: e.ref, finding: e.finding, class: e.class, text: e.text, decisive: f?.decisive ?? false,
        citations: opened?.citations ?? [], rejected: opened?.rejected ?? [], status: null,
      },
    });
  }
  for (const ref of new Set(rows.map((r) => r.entry.ref))) {
    const group = rows.filter((r) => r.entry.ref === ref);
    applyQuotes(group.flatMap((r) => r.entry.citations), quotesIn(textOf.get(ref) ?? ''));
    for (const r of group) r.entry.status = entryStatus(r.f, r.base, r.entry.citations);
  }
  const entries = rows.map((r) => r.entry);
  for (const e of entries) for (const c of e.citations) delete c.pageText;
  // A decisive entry must have an inspectable source (one found, current citation) or an
  // unsupported label. Anything else is listed here, never hidden.
  const unaccounted = entries.filter((e) => e.decisive && !UNSUPPORTED.has(e.status) && !e.citations.some((c) => c.existence === 'found')).map((e) => e.finding);
  const counts = {};
  for (const e of entries) counts[e.status] = (counts[e.status] ?? 0) + 1;
  return { entries, counts, unaccounted };
}
