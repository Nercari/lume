import { test } from 'node:test';
import assert from 'node:assert/strict';
import { research, assessRelevance, minimizeQuery, leaks, caseTermsOf, QueryLeakError } from '../src/index.js';

// Stub research client: records every outgoing query; no network.
function stubClient(results) {
  const queries = [];
  return { queries, async search(q) { queries.push(q); return results; } };
}
const NOW = Date.parse('2026-11-09T12:00:00Z');
const RESULTS = [
  { title: 'Synthetic Statute 8.112/1990, art. 5', url: 'https://law.example.test/s8112#a5', official: true, text: 'Article 5. Synthetic rule text.', status: 'in_force', asOf: '2026-11-01' },
  { title: 'Old commentary', url: 'https://blog.example.test/x', official: false, text: 'Opinion.', status: 'in_force', asOf: '2025-01-01' },
];
// Synthetic identifiers only: shaped like real ones, belonging to nobody.
const CASE_NO = '0001234-56.2026.4.01.3400';
const PARTY = 'Zeta Fictícia Ltda';
const DOC_ID = '98765432';
const QUESTION = `Prazo de prescrição do art. 5 da Lei 8.112/1990 no processo ${CASE_NO} de ${PARTY} (zeta ficticia ltda), doc ${DOC_ID}, CPF 123.456.789-09, ref D1@1:p1:0-44, contato a@b.example.test`;

test('query sanitizer strips case ids, party names and identifiers; the legal formulation stays', async () => {
  const L = { passages: { 'D1@1:p1:0-44': { docId: 'D1' }, x: { docId: DOC_ID } } };
  const caseTerms = caseTermsOf(L, [CASE_NO, PARTY]);
  const client = stubClient(RESULTS);
  const log = [];
  await research(client, { question: QUESTION, issue: 'limitation period', caseTerms }, { now: NOW, log });
  assert.equal(client.queries.length, 1);
  const q = client.queries[0];
  for (const bad of [CASE_NO, '0001234', 'zeta', 'ficticia', 'fictícia', DOC_ID, '123.456.789-09', 'd1@', '@b.example']) assert.ok(!q.toLowerCase().includes(bad), `query leaks ${bad}: ${q}`);
  assert.deepEqual(leaks(q, caseTerms), []);
  assert.match(q, /prescricao/);
  assert.match(q, /lei 8\.112\/1990/);
  assert.deepEqual(log[0].query, q);
  assert.ok(!JSON.stringify(log).includes(DOC_ID), 'diagnostics keep kinds, not removed values');
  assert.deepEqual(new Set(log[0].removed), new Set(['case_number', 'cpf', 'email', 'passage_ref', 'long_number', 'case_term']));
});

test('research refuses without case terms, and refuses a query that minimization empties', async () => {
  const client = stubClient(RESULTS);
  await assert.rejects(research(client, { question: 'x' }), TypeError);
  await assert.rejects(research(client, { question: PARTY, caseTerms: [PARTY] }), QueryLeakError);
  assert.equal(client.queries.length, 0, 'nothing was sent');
  assert.deepEqual(minimizeQuery(`Sr. ${PARTY}`, [PARTY]).query, 'sr.');
});

test('research records source, checked text, currency and relevance; verified only after a human relevance check on an official current source', async () => {
  const [official, blog] = await research(stubClient(RESULTS), { question: 'prazo prescricional lei 8.112/1990 art. 5', issue: 'limitation period', caseTerms: [] }, { now: NOW });
  for (const r of [official, blog]) {
    assert.ok(r.source.url && 'official' in r.source && r.checkedText && r.currency.status && r.currency.checkedAt && r.relevance.issue);
    assert.equal(r.verification, 'unverified');
    assert.equal(r.relevance.assessment, 'unassessed');
  }
  assert.equal(official.currency.status, 'current');
  assert.equal(blog.currency.status, 'stale');
  assert.throws(() => assessRelevance(official, { relevant: true }), TypeError);
  assert.equal(assessRelevance(official, { relevant: true, by: 'reviewer-1' }).verification, 'verified');
  assert.equal(assessRelevance(official, { relevant: false, by: 'reviewer-1' }).verification, 'not_relevant');
  assert.equal(assessRelevance(blog, { relevant: true, by: 'reviewer-1' }).verification, 'unofficial_source');
  const [stale] = await research(stubClient([{ ...RESULTS[0], asOf: '2026-01-01' }]), { question: 'lei 8.112/1990', caseTerms: [] }, { now: NOW });
  assert.equal(assessRelevance(stale, { relevant: true, by: 'r' }).verification, 'currency_stale');
  const [unknown] = await research(stubClient([{ ...RESULTS[0], status: undefined }]), { question: 'lei 8.112/1990', caseTerms: [] }, { now: NOW });
  assert.equal(unknown.currency.status, 'unknown');
});
