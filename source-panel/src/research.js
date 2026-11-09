// Legal research (#10). The research client is injected (the approved data route from #3); this
// module makes no network call. Only a minimized legal formulation leaves the case: identifiers
// and caller-named sensitive terms are removed, and a query that still contains one is not sent.

export class QueryLeakError extends Error {}

// Identifier shapes removed from every query. CNJ case number, CPF, CNPJ, e-mail, #2 passage
// references, and any other run of 6+ digits (document or account numbers). Statute numbers
// such as 8.112/1990 stay: they are the legal formulation.
const PATTERNS = [
  ['case_number', /\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\b/g],
  ['cnpj', /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g],
  ['cpf', /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g],
  ['email', /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g],
  ['passage_ref', /\b[\w.-]+@[\w.-]+:p\d+(?::\d+-\d+)?/g],
  ['long_number', /\b\d{6,}\b/g],
];

const fold = (s) => String(s).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Case terms: document IDs from the #6 ledger plus what the caller names (case number, party
// names, places). The ledger has no party names, so the caller must pass them.
export function caseTermsOf(L, extra = []) {
  const ids = Object.values(L.passages ?? {}).map((p) => p.docId);
  return [...new Set([...ids, ...extra].map(String).filter((t) => t.trim().length > 1))];
}

// Accent- and case-insensitive term match on word edges.
const termRe = (t) => new RegExp(`(?<![\\p{L}\\d])${escape(fold(t).trim()).replace(/\s+/g, '\\s+')}(?![\\p{L}\\d])`, 'gu');

export function leaks(query, caseTerms) {
  const q = fold(query);
  const found = caseTerms.filter((t) => termRe(t).test(q));
  for (const [kind, re] of PATTERNS) if (new RegExp(re.source, 'g').test(query)) found.push(kind);
  return found;
}

// Returns the minimized query and the kinds removed (never the removed values).
export function minimizeQuery(text, caseTerms) {
  if (!Array.isArray(caseTerms)) throw new TypeError('caseTerms is required');
  let q = fold(text);
  const removed = [];
  for (const [kind, re] of PATTERNS) if (q.replace(re, ' ') !== q) {
    removed.push(kind);
    q = q.replace(re, ' ');
  }
  // Longest terms first, so a full name goes before its parts.
  for (const t of [...caseTerms].sort((a, b) => b.length - a.length)) {
    const n = q.replace(termRe(t), ' ');
    if (n !== q) removed.push('case_term');
    q = n;
  }
  q = q.replace(/\s+/g, ' ').trim();
  return { query: q, removed: [...new Set(removed)] };
}

// Currency of a legal source: 'current' only when the source states it is in force and it was
// checked within maxAgeDays. Anything else is labeled, not assumed.
export function currencyOf(r, now, maxAgeDays) {
  if (!r.status || r.status === 'unknown' || !r.asOf) return 'unknown';
  if (r.status !== 'in_force') return r.status; // revoked, amended, suspended ...
  return now - Date.parse(r.asOf) > maxAgeDays * 86_400_000 ? 'stale' : 'current';
}

// Runs one research request. client.search(query) -> [{ title, url, official, text, status, asOf }].
// Each result becomes a record with source, checked text, currency and relevance. A record is
// 'unverified' until a person confirms relevance; the client's ranking is not relevance.
export async function research(client, { question, issue, caseTerms }, { now = Date.now(), maxAgeDays = 30, log = [] } = {}) {
  const { query, removed } = minimizeQuery(question, caseTerms);
  const left = leaks(query, caseTerms);
  if (left.length) throw new QueryLeakError(`query still contains: ${[...new Set(left)].join(', ')}`);
  if (!query) throw new QueryLeakError('nothing left to search after minimization');
  log.push({ query, removed, at: now }); // diagnostics: what left the case, never the removed values
  const results = await client.search(query);
  return results.map((r) => ({
    query,
    source: { title: r.title ?? null, url: r.url ?? null, official: r.official === true },
    checkedText: r.text ?? null,
    currency: { status: currencyOf(r, now, maxAgeDays), asOf: r.asOf ?? null, checkedAt: new Date(now).toISOString() },
    relevance: { issue: issue ?? null, assessment: 'unassessed', by: null },
    verification: 'unverified',
  }));
}

// A person confirms (or rejects) relevance after reading the checked text. A record becomes
// 'verified' only from an official source with current status and a relevant assessment.
export function assessRelevance(record, { relevant, note, by }) {
  if (!by) throw new TypeError('a relevance assessment needs a reviewer');
  const relevance = { ...record.relevance, assessment: relevant ? 'relevant' : 'not_relevant', note: note ?? null, by };
  const verification = !relevant ? 'not_relevant'
    : !record.source.official ? 'unofficial_source'
      : record.currency.status !== 'current' ? `currency_${record.currency.status}`
        : !record.checkedText ? 'no_checked_text' : 'verified';
  return { ...record, relevance, verification };
}
