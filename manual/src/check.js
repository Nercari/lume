// Citation check for a pasted ChatGPT answer. Existence only: the id and the page
// have to be in the segmented PDF. This does not judge whether the sentence is true.
// A decisive sentence with no [Id …, p. …] nearby is flagged, same idea as the source
// panel refusing an unsupported decisive claim. There is no network call here.
import { fold } from './rules.js';

export const CITATION_RULE = Object.freeze({
  id: 'citation_id_page',
  re: /\[\s*Id\s+([^,\]]+?)\s*,\s*p\.?\s*(\d{1,6})\s*\]/giu,
});

const decisive = (id, re) => Object.freeze({ id, re });

export const DECISIVE_RULES = Object.freeze([
  decisive('julgamento', /\bjulgo\b|\bjulgou\b/u),
  decisive('procedencia', /\bprocedente\b|\bimprocedente\b/u),
  decisive('deferimento', /\bdefiro\b|\bindefiro\b/u),
  decisive('condenacao', /\bcondeno\b|\babsolvo\b/u),
  decisive('extincao', /\bextingo\b|\bhomologo\b/u),
  decisive('determinacao', /\bdetermino\b|\bdeclaro\b/u),
]);

export function decisiveRule(sentence) {
  const folded = fold(sentence);
  return DECISIVE_RULES.find((rule) => rule.re.test(folded)) ?? null;
}

function citationPattern() {
  return new RegExp(CITATION_RULE.re.source, CITATION_RULE.re.flags);
}

function sentencesOf(text) {
  // "p. 2" is a citation, not the end of a sentence.
  return String(text).split(/\n+/).flatMap((line) => line.split(/(?<![Pp]\.)(?<=[.!?])\s+/)).map((part) => part.trim()).filter(Boolean);
}

function knownPages(caseResult) {
  const byDoc = new Map();
  const add = (docId, pageInDoc, hasText) => {
    if (docId == null || pageInDoc == null) return;
    const key = String(docId);
    if (!byDoc.has(key)) byDoc.set(key, new Map());
    const pages = byDoc.get(key);
    const n = Number(pageInDoc);
    const prev = pages.get(n);
    pages.set(n, Boolean(hasText) || prev === true);
  };
  for (const page of caseResult?.pages ?? []) add(page.docId, page.pageInDoc, page.hasText);
  for (const passage of caseResult?.passages ?? []) add(passage.docId, passage.pageInDoc, passage.hasText);
  return byDoc;
}

export function checkAnswer(answerText, caseResult) {
  const text = String(answerText ?? '');
  const known = knownPages(caseResult);
  const citations = [];
  const re = citationPattern();
  let match;
  while ((match = re.exec(text))) {
    const docId = match[1].trim();
    const pageInDoc = Number(match[2]);
    const pages = known.get(docId);
    let status = 'missing_document';
    if (pages) status = pages.has(pageInDoc) ? (pages.get(pageInDoc) ? 'exists' : 'unreadable') : 'missing_page';
    citations.push({ raw: match[0], docId, pageInDoc, status });
  }

  const sentences = sentencesOf(text);
  const uncitedDecisive = [];
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const rule = decisiveRule(sentence);
    if (!rule) continue;
    const citedHere = citationPattern().test(sentence);
    const citedNext = i + 1 < sentences.length && citationPattern().test(sentences[i + 1]);
    if (!citedHere && !citedNext) uncitedDecisive.push({ text: sentence, ruleId: rule.id });
  }

  const unknown = citations.filter((item) => item.status !== 'exists');
  return {
    ok: unknown.length === 0 && uncitedDecisive.length === 0,
    citations,
    unknown,
    uncitedDecisive,
  };
}
