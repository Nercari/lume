// Citation check for a pasted ChatGPT answer. Existence only: the id and the sheet
// have to be in the case. This does not judge whether the sentence is true.
// Accepts [Id X], [Id X, fl. Y] and the older [Id X, p. Y]. A decisive sentence
// with none of those nearby is flagged. There is no network call here.
import { sheetMap } from './sheets.js';
import { fold } from './rules.js';

export const CITATION_RULE = Object.freeze({
  id: 'citation_id_page',
  re: /\[\s*Id\s+([^,\]]+?)(?:\s*,\s*(?:fl|p)\.?\s*(\d{1,6}))?\s*\]/giu,
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
  // "fl. 2" and "p. 2" are citations, not the end of a sentence.
  return String(text).split(/\n+/).flatMap((line) => line.split(/(?<!(?:[Pp]\.|[Ff][Ll]\.))(?<=[.!?])\s+/)).map((part) => part.trim()).filter(Boolean);
}

function gapIdsOf(caseResult) {
  const ids = new Set();
  for (const gap of caseResult?.gaps ?? []) {
    if (gap?.docId == null) continue;
    ids.add(String(gap.docId));
  }
  return ids;
}

function citationStatus(docId, pageInDoc, known, gapIds) {
  const pages = known.get(docId);
  if (pageInDoc == null) {
    if (pages) return [...pages.values()].some(Boolean) ? 'exists' : 'unreadable';
    return gapIds.has(docId) ? 'unreadable' : 'missing_document';
  }
  if (!pages) return gapIds.has(docId) ? 'missing_page' : 'missing_document';
  if (!pages.has(pageInDoc)) return 'missing_page';
  return pages.get(pageInDoc) ? 'exists' : 'unreadable';
}

export function checkAnswer(answerText, caseResult) {
  const text = String(answerText ?? '');
  const known = sheetMap(caseResult);
  const gapIds = gapIdsOf(caseResult);
  const citations = [];
  const re = citationPattern();
  let match;
  while ((match = re.exec(text))) {
    const docId = match[1].trim();
    const pageInDoc = match[2] == null ? null : Number(match[2]);
    const status = citationStatus(docId, pageInDoc, known, gapIds);
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
