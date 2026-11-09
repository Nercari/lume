// Factual support against human annotation ids. Counts are not a 0–4 rubric score:
// intake `score` stays pending so an unfinished sheet cannot aggregate into a pass.
// Annotated gaps are the material-gap denominator; the #3 manifest has no separate material flag.
// Other facts are passed beside the manifest because the schema rejects extra fields.
import { score } from '../../intake/src/rubric.mjs';
import { validateManifest } from '../../intake/src/manifest.mjs';
import { DENOMINATORS } from './denominators.js';

const RUN = 'run-synthetic';

const pendingSheet = (caseId, invented) => ({
  case_id: caseId,
  run_id: RUN,
  scores: {
    factual_support: { status: 'pending', invented_decisive_facts: invented },
    contradictions: { status: 'pending' },
    gaps: { status: 'pending' },
    method_fidelity: { status: 'pending' },
    ocr_quality: { status: 'pending' },
    draft_usefulness: { status: 'pending' },
  },
});

function tally(expectedIds, observed) {
  const want = new Set(expectedIds);
  const seen = new Set(observed.map((f) => f.annotationId));
  let found = 0;
  for (const id of want) if (seen.has(id)) found++;
  return { found, expected: want.size };
}

function falseVerified(citation) {
  if (citation?.label !== 'verified') return false;
  return !(citation.status === 'verified' && citation.humanReview === true);
}

export function scoreFactual(manifest, observedByCase, otherByCase = {}) {
  const errors = validateManifest(manifest);
  if (errors.length) throw new Error(`manifest: ${errors.join('; ')}`);

  const decisive = { found: 0, expected: 0 };
  const contradictions = { found: 0, expected: 0 };
  const gaps = { found: 0, expected: 0 };
  const other = { found: 0, expected: 0 };
  let inventedDecisiveFacts = 0;
  let unverifiedLabeledVerified = 0;

  for (const c of manifest.cases) {
    const ann = c.annotation;
    const obs = observedByCase[c.id]?.findings ?? { decisive: [], contradictions: [], gaps: [], other: [] };
    const d = tally(ann.decisive_facts.map((f) => f.id), obs.decisive ?? []);
    const k = tally(ann.contradictions.map((f) => f.id), obs.contradictions ?? []);
    const g = tally(ann.gaps.map((f) => f.id), obs.gaps ?? []);
    const o = tally((otherByCase[c.id] ?? []).map((f) => f.id), obs.other ?? []);
    decisive.found += d.found;
    decisive.expected += d.expected;
    contradictions.found += k.found;
    contradictions.expected += k.expected;
    gaps.found += g.found;
    gaps.expected += g.expected;
    other.found += o.found;
    other.expected += o.expected;

    const annotated = new Set(ann.decisive_facts.map((f) => f.id));
    const caseInvented = (obs.decisive ?? []).filter((f) => !annotated.has(f.annotationId)).length;
    inventedDecisiveFacts += caseInvented;
    unverifiedLabeledVerified += (obs.decisive ?? []).filter((f) => falseVerified(f.citation)).length;

    const sheet = pendingSheet(c.id, caseInvented);
    const scored = score(sheet);
    if (scored.dimensions.factual_support !== 'pending') throw new Error('factual sheet must stay pending');
    let aggregated = false;
    try {
      score(sheet, { aggregate: true });
      aggregated = true;
    } catch (e) {
      if (!/pending/.test(e.message)) throw e;
    }
    if (aggregated) throw new Error('rubric aggregate must refuse a pending sheet');
  }

  if (decisive.expected === 0) throw new Error('no decisive facts in the set');
  const ratio = (part) => (part.expected === 0 ? 1 : part.found / part.expected);
  const otherRate = ratio(other);
  const exerciseMeets = ratio(decisive) === DENOMINATORS.decisiveFacts
    && ratio(contradictions) === DENOMINATORS.contradictions
    && ratio(gaps) === DENOMINATORS.materialGaps
    && otherRate >= DENOMINATORS.otherFacts
    && inventedDecisiveFacts === DENOMINATORS.inventedDecisiveFacts
    && unverifiedLabeledVerified === DENOMINATORS.unverifiedCitationsLabeledVerified;

  return {
    decisive: { ...decisive, rate: ratio(decisive) },
    contradictions: { ...contradictions, rate: ratio(contradictions) },
    gaps: { ...gaps, rate: ratio(gaps) },
    other: { ...other, rate: otherRate, minimum: DENOMINATORS.otherFacts },
    inventedDecisiveFacts,
    unverifiedLabeledVerified,
    exerciseMeets,
    acceptancePassed: false,
    rubricAggregated: false,
  };
}
