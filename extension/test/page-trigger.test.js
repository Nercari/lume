import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  DOCUMENT_PAUSE_MS,
  STUDY_BUTTON_ID,
  STUDY_BUTTON_LABEL,
  createViewStore,
  failedTitle,
  holdCaseView,
  readyTitle,
  samePage,
  studyingTitle,
} from '../src/page-trigger.js';

test('the page button status titles and the case guard', () => {
  assert.equal(DOCUMENT_PAUSE_MS, 300);
  assert.equal(STUDY_BUTTON_ID, 'lume-estudar');
  assert.equal(STUDY_BUTTON_LABEL, 'Lume: Estudar processo');
  assert.equal(studyingTitle(3, 50), 'Lume: estudando · 3/50');
  assert.equal(readyTitle({ documents: 50, gaps: 2, part: 1, total: 3 }), 'Lume: pronto · 50 docs · 2 lacunas · parte 1 de 3');
  assert.equal(failedTitle('outra página'), 'Lume: falhou · outra página');
  assert.equal(samePage('https://pje1g.trf1.jus.br/a?id=1', 'https://pje1g.trf1.jus.br/a?id=1#lume-autos'), true);
  assert.equal(samePage('https://pje1g.trf1.jus.br/a?id=2', 'https://pje1g.trf1.jus.br/a?id=1#lume-autos'), false);

  const store = createViewStore();
  store.put({ pageUrl: 'https://court/a', parts: [{ n: 1, text: 'A' }], allText: 'A', documents: 1, gaps: 0 });
  store.put({ pageUrl: 'https://court/b#later', parts: [{ n: 1, text: 'B' }], allText: 'B', documents: 2, gaps: 1 });
  assert.equal(store.take('https://court/a#lume-autos').allText, 'A');
  assert.equal(store.take('https://court/b').documents, 2);

  const mismatch = holdCaseView(store.take('https://court/b'), 'https://court/a');
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.retry, false);
  assert.equal(mismatch.reason, 'outra página');
  const match = holdCaseView(store.take('https://court/a'), 'https://court/a#lume-autos');
  assert.equal(match.ok, true);
  assert.equal(match.held.parts[0].text, 'A');
  assert.equal(match.held.pageUrl, 'https://court/a');
  const waiting = holdCaseView({ pageUrl: null, parts: [] }, 'https://court/a');
  assert.equal(waiting.ok, false);
  assert.equal(waiting.retry, true);
});

test('the content script injects the fixed button and study does not attach', () => {
  const content = readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
  assert.match(content, /lume:study-here/);
  assert.match(content, /position = 'fixed'/);
  assert.match(content, /STUDY_BUTTON_ID/);
  const study = readFileSync(new URL('../src/study.js', import.meta.url), 'utf8');
  assert.equal(study.includes('data-lume-composer'), false);
  assert.equal(study.includes('chatgpt.com'), false);
  assert.match(study, /dataset\.attach = attach === '0' \|\| attach == null \? '0' : '0'/);
  const worker = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
  assert.match(worker, /lume:study-here/);
  assert.match(worker, /study\.html\?id=\$\{studyId\}&attach=0/);
  const ci = readFileSync(new URL('../../scripts/ci-test-package.sh', import.meta.url), 'utf8');
  assert.match(ci, /npx playwright-core install --with-deps chromium/);
});
