// Style profiles (G5): one user's voto form, kept private by that user, never in this repo.
// A profile is form only. `instructions` and `examples` go to the model as the style block;
// `form` is the checkable part, scored here deterministically on the model's draft. The same
// scorer serves every profile, so "the draft follows ITS profile" is measurable: score a draft
// against its own profile and against the others.
//
// profile: {
//   id, label,
//   instructions: [string], examples: [{ text }],
//   form: {
//     ementa: 'caps-line' | 'labeled' | 'none',   // first block in capitals, a "Ementa:" line, or no ementa
//     ementaLabel?: string,                        // for 'labeled', e.g. 'Ementa:'
//     ementaEndsWithResult?: boolean,              // the ementa's last clause states the result
//     body: 'numbered' | 'prose',                  // 1., 2., 3. … or unnumbered paragraphs
//     headings?: [string],                         // standalone heading lines, in this order
//     opening?: string,                            // regex for the first body paragraph
//     args?: string,                               // regex for the appellant's arguments (first 3 body paragraphs)
//     closing: { desprovido, provido, parcial },   // regex per outcome
//     fees?: { desprovido, provido, parcial },     // regex per outcome, or '!<regex>' = must not appear
//     endFormula?: string,                         // regex for the last block
//     forbid?: [string],                           // regexes that must not appear
//   }
// }

const OUTCOMES = Object.freeze(['desprovido', 'provido', 'parcial']);
const HEADING_WORDS = /^(RELAT[ÓO]RIO|VOTO|FUNDAMENTA[ÇC][ÃA]O|DISPOSITIVO|EMENTA|AC[ÓO]RD[ÃA]O|M[ÉE]RITO|PRELIMINAR(ES)?)\s*:?\s*$/i;
const RESULT_IN_EMENTA = {
  desprovido: /RECURSO[A-ZÀ-Ú ]{0,30} (DES)PROVIDO|PROVIMENTO NEGADO|RECURSO N[ÃA]O PROVIDO/,
  provido: /RECURSO[A-ZÀ-Ú ]{0,30}(?<!DES)PROVIDO(?! PARCIALMENTE)|PROVIMENTO DADO/,
  parcial: /PARCIALMENTE PROVIDO|PROVIDO PARCIALMENTE|PARCIAL PROVIMENTO/,
};
const EVIDENCE = [/\b\d{2}\/\d{2}\/\d{4}\b/, /R\$\s?\d/, /\bCID\b/, /[“"][^”"]{20,}[”"]/, /\b[Ii][Dd]\.?\s*\d{4,}/];

const rx = (s, flags = 'u') => new RegExp(s, flags);
const strip = (s) => s.replace(/\*\*/g, '').replace(/^#+\s*/, '').trim();
const letters = (s) => [...s].filter((c) => /\p{L}/u.test(c));
const isCaps = (s) => { const l = letters(s); return l.length >= 20 && l.filter((c) => c === c.toUpperCase() && c !== c.toLowerCase()).length / l.length >= 0.9; };
const numbered = (s) => /^\d+\s*[.)]\s*\S/.test(s);

// Split a draft into blocks: non-empty lines, markdown bold and heading marks removed.
export function parseDraft(text) {
  const raw = String(text ?? '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const blocks = raw.map(strip).filter(Boolean);
  return { raw, blocks };
}

function ementaBlock(blocks, form) {
  const first = blocks[0] ?? '';
  if (form.ementa === 'caps-line') return isCaps(first) && first.split('.').filter((p) => p.trim()).length >= 3 ? first : null;
  if (form.ementa === 'labeled') return first.toLowerCase().startsWith(String(form.ementaLabel ?? 'Ementa:').toLowerCase()) && !isCaps(first) ? first : null;
  return null;
}

function bodyOf(blocks, form) {
  let b = blocks;
  if (form.ementa !== 'none' && b.length && (isCaps(b[0]) || /^ementa\b/i.test(b[0]))) b = b.slice(1);
  return b.filter((x) => !HEADING_WORDS.test(x) && !(form.headings ?? []).some((h) => x.toUpperCase() === h.toUpperCase()));
}

// Returns { score in [0,1], passed, total, checks: [{ id, ok }] }. No text is returned.
export function scoreDraft(text, profile, outcome) {
  if (!OUTCOMES.includes(outcome)) throw new TypeError(`outcome must be one of ${OUTCOMES.join(', ')}`);
  const form = profile.form;
  const { raw, blocks } = parseDraft(text);
  const all = blocks.join('\n');
  const body = bodyOf(blocks, form);
  const paras = body.filter((p) => p.length >= 40);
  const checks = [];
  const add = (id, ok) => checks.push({ id, ok: Boolean(ok) });

  const firstIsCaps = isCaps(blocks[0] ?? '');
  const em = ementaBlock(blocks, form);
  if (form.ementa === 'none') add('ementa_format', !firstIsCaps && !/^ementa\b/i.test(blocks[0] ?? ''));
  else add('ementa_format', em);
  if (form.ementa !== 'none' && form.ementaEndsWithResult) {
    const tail = em ? em.split('.').filter((p) => p.trim()).slice(-3).join('.').toUpperCase() : '';
    add('ementa_result', em && RESULT_IN_EMENTA[outcome].test(tail) && (outcome === 'parcial' || !RESULT_IN_EMENTA.parcial.test(tail)));
  }

  const nums = paras.map((p) => (p.match(/^(\d+)\s*[.)]/) ?? [])[1]).filter(Boolean).map(Number);
  if (form.body === 'numbered') add('body_layout', paras.length >= 3 && nums.length / paras.length >= 0.8 && nums.every((n, i) => n === i + 1));
  else add('body_layout', paras.length >= 3 && nums.length === 0 && !raw.some((l) => /^[-*•]\s/.test(l)));

  const heads = form.headings ?? [];
  const headLines = blocks.filter((b) => HEADING_WORDS.test(b) || heads.some((h) => b.toUpperCase() === h.toUpperCase())).map((b) => b.toUpperCase().replace(/:$/, ''));
  if (heads.length) add('headings', heads.every((h, i) => headLines.indexOf(h.toUpperCase()) >= 0 && (i === 0 || headLines.indexOf(h.toUpperCase()) > headLines.indexOf(heads[i - 1].toUpperCase()))));
  else add('headings', headLines.length === 0);

  const unnum = (p) => p.replace(/^\d+\s*[.)]\s*/, '');
  if (form.opening) add('opening', paras[0] && rx(form.opening).test(unnum(paras[0])));
  if (form.args) add('args', rx(form.args, 'iu').test(paras.slice(0, 3).map(unnum).join(' ')));
  add('evidence', EVIDENCE.some((r) => r.test(all)));

  const tail = [...paras.slice(-3), ...blocks.slice(-5)].map(unnum).join('\n');
  add('closing', rx(form.closing[outcome], 'iu').test(tail));
  const fee = form.fees?.[outcome];
  if (fee) add('fees', fee.startsWith('!') ? !rx(fee.slice(1), 'iu').test(all) : rx(fee, 'iu').test(tail));
  if (form.endFormula) add('end_formula', rx(form.endFormula, 'iu').test(blocks.at(-1) ?? ''));
  add('forbid', !(form.forbid ?? []).some((f) => rx(f, 'mu').test(all)) && !/\*\*[^*\d][^*]{5,}\*\*/.test(raw.slice(1).join('\n')));

  const passed = checks.filter((c) => c.ok).length;
  return { score: passed / checks.length, passed, total: checks.length, checks };
}

// The style block a drafting call gets. Style and structure only; never case evidence.
export function styleBlock(profile, { examples = profile.examples } = {}) {
  return { use: 'style and structure only; not case evidence', instructions: [...profile.instructions], examples: examples.map((e) => ({ text: e.text })) };
}

export const STYLE_OUTCOMES = OUTCOMES;

// Leave-one-out: up to k of the user's other votos, same topic first, never the case's own.
export function looExamples(examples, label, topic, k = 3) {
  const pool = examples.filter((e) => e.label !== label);
  return [...pool.filter((e) => e.topic === topic), ...pool.filter((e) => e.topic !== topic)].slice(0, k);
}
