// The default drafting method (#8) as publishable abstractions. Two parts stay apart:
// `instructions` go to the model; `CHECKS` run here, deterministically, on the model output.
// The maintainer's private reference package is NOT in this file. Its verified rules become new
// generic instructions and checks here only after the #3 review; private examples never do.
import { DIMENSIONS } from '../../intake/src/rubric.mjs';

// Section structure from the public procedural rule for judicial acts (relatório, fundamentação,
// dispositivo). A despacho only orders a step, so it has one section.
const S = (id, title) => Object.freeze({ id, title });
export const DOC_TYPES = Object.freeze({
  sentenca: { label: 'Sentença', sections: [S('relatorio', 'Relatório'), S('fundamentacao', 'Fundamentação'), S('dispositivo', 'Dispositivo')] },
  decisao: { label: 'Decisão interlocutória', sections: [S('relatorio', 'Relatório'), S('fundamentacao', 'Fundamentação'), S('dispositivo', 'Dispositivo')] },
  despacho: { label: 'Despacho', sections: [S('determinacao', 'Determinação')] },
});

const INSTRUCTIONS = Object.freeze([
  'Use only the facts in the case evidence block. The style block shows tone and structure only: never take a fact, name, number or date from it.',
  'State a decisive fact only when a current finding supports it, and list that finding id in `uses` of the section.',
  'Follow the section order of the document type. Do not leave a section empty.',
  'Address every contradiction listed in `mustAddress`, and list its id in `addressed`.',
  'Without a requested outcome, propose the conclusion the evidence supports, with its reasoning and the findings it rests on.',
  'With a requested outcome, keep the contrary evidence in the reasoning and say where it is incompatible with the outcome. Do not omit or soften it.',
  'Write clean text: no passage ids, no bracket citations. The source panel carries the references.',
]);

// Passage ids (#2) and bracket markers that must not stay in the draft text.
export const CITATION = /\s*\[?\b[\w.-]+@[\w.-]+:p\d+(?::\d+-\d+)?\]?|\s*\[\d+\]/g;

// Fact-like tokens of style material: numbers with two or more digits, and capitalized words in
// mid-sentence (names). shortcut: lexical only, so a paraphrased fact passes; upgrade with the
// #10 source verifier when it exists.
const factTokens = (s) => new Set([...String(s).matchAll(/\d[\d.,/-]*\d|(?<=[\p{Ll}\d,;:] )\p{Lu}[\p{L}-]+/gu)].map((m) => m[0]));

// Each check: { id, dimension (a #3 rubric dimension), run(draft, env) => issue strings }.
// draft: { sections: [{id, text, uses}], conclusion, addressed }. env: { ctx, docType, outcome, mustAddress, style }.
export const CHECKS = Object.freeze([
  {
    id: 'sections_complete', dimension: 'method_fidelity',
    run: (d, { docType }) => {
      const want = DOC_TYPES[docType].sections.map((s) => s.id);
      const got = d.sections.map((s) => s.id);
      const out = [];
      if (want.join() !== got.join()) out.push(`sections ${got.join(',') || 'none'} do not match ${docType}: ${want.join(',')}`);
      for (const s of d.sections) if (!s.text.trim()) out.push(`section ${s.id} is empty`);
      return out;
    },
  },
  {
    id: 'facts_from_case_only', dimension: 'factual_support',
    run: (d, { ctx }) => {
      const byId = new Map(ctx.findings.map((f) => [f.id, f]));
      const out = [];
      for (const s of d.sections) for (const id of s.uses) {
        const f = byId.get(id);
        if (!f) out.push(`section ${s.id} uses ${id}, which is not a current finding of this case`);
        else if (f.decisive && !f.supported) out.push(`section ${s.id} uses unsupported decisive finding ${id}`);
      }
      return out;
    },
  },
  {
    id: 'no_style_facts', dimension: 'factual_support',
    run: (d, { ctx, style }) => {
      const caseText = ctx.passages.map((p) => p.text).join('\n') + '\n' + ctx.findings.map((f) => f.text).join('\n');
      const leaks = new Set();
      for (const t of factTokens([...style.instructions, ...style.examples.map((e) => e.text)].join('\n'))) {
        if (caseText.includes(t)) continue;
        for (const s of d.sections) if (s.text.includes(t)) leaks.add(t);
      }
      return [...leaks].map((t) => `"${t}" comes from style material, not from the case`);
    },
  },
  {
    id: 'conclusion_reasoned', dimension: 'method_fidelity',
    run: (d, { outcome }) => (outcome ? [] : !d.conclusion?.reasoning?.trim() || !d.conclusion?.uses?.length
      ? ['no requested outcome: the draft must propose a conclusion with reasoning and the findings it rests on'] : []),
  },
  {
    id: 'contrary_addressed', dimension: 'contradictions',
    run: (d, { mustAddress }) => mustAddress.filter((id) => !d.addressed.includes(id)).map((id) => `contrary or contradictory finding ${id} is not addressed`),
  },
]);
for (const c of CHECKS) if (!DIMENSIONS.includes(c.dimension)) throw new Error(`check ${c.id}: ${c.dimension} is not a #3 rubric dimension`);

export const DEFAULT_METHOD = Object.freeze({ id: 'lume-default-0', docTypes: DOC_TYPES, instructions: INSTRUCTIONS, checks: CHECKS });

// Visible, editable guess. basis 'inferred' until the user sets it (basis 'user').
const HINTS = [
  ['despacho', /despacho|intim|cite-se|d[eê]-se vista|\border\b/i],
  ['decisao', /decis[aã]o|liminar|tutela|interlocut|injunction/i],
  ['sentenca', /senten[cç]a|m[eé]rito|julg|judgment/i],
];
export function inferDocType(request = '', method = DEFAULT_METHOD) {
  for (const [value, re] of HINTS) {
    const m = re.exec(request);
    if (m && method.docTypes[value]) return { value, basis: 'inferred', reason: `request mentions "${m[0]}"` };
  }
  return { value: 'decisao', basis: 'inferred', reason: 'no document type in the request; default' };
}
