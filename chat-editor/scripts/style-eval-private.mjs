#!/usr/bin/env node
// G5 private style-profile eval. Runs on the user's machine over a private directory that is
// never committed. Writes prompts and aggregate scores only: no names, case text or excerpts
// leave the private directory except the per-label numbers in report.json / report.md.
//
//   node scripts/style-eval-private.mjs prompts <privateDir>
//   (run each prompts/<label>.<cond>.txt through the routed model into drafts/<label>.<cond>.txt)
//   node scripts/style-eval-private.mjs score <privateDir> <outDir>
//
// <privateDir>/cases.json     [{ label, outcome: desprovido|provido|parcial, topic, summary }]
// <privateDir>/examples.json  [{ label, topic, text }]  the user's own votos, one per case label
// <privateDir>/profiles/*.json profiles (see src/style-profile.js); 'default' uses examples.json
//                              leave-one-out, the others carry their own examples
// <privateDir>/steer.json      optional ["case-01", …] cases also drafted under the other profiles
//
// Conditions: base (no style block), default (3 of the user's other votos + the default
// profile's instructions), and one per other profile.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { looExamples, scoreDraft, styleBlock } from '../src/style-profile.js';
import { ADAPTED_INSTRUCTIONS } from '../../manual/src/prompt.js';

const [cmd, dir, outDir] = process.argv.slice(2);
if (!['prompts', 'score'].includes(cmd) || !dir || (cmd === 'score' && !outDir)) {
  console.error('usage: style-eval-private.mjs prompts <privateDir> | score <privateDir> <outDir>');
  process.exit(2);
}
const readJson = async (p, fallback) => { try { return JSON.parse(await readFile(p, 'utf8')); } catch (e) { if (fallback !== undefined) return fallback; throw e; } };
const cases = await readJson(join(dir, 'cases.json'));
const profiles = {};
for (const f of (await readdir(join(dir, 'profiles'))).filter((f) => f.endsWith('.json')).sort()) {
  const p = await readJson(join(dir, 'profiles', f));
  profiles[p.id] = p;
}
const DEFAULT = Object.values(profiles).find((p) => p.role === 'default') ?? profiles['default-jef-v1'];
const others = Object.values(profiles).filter((p) => p !== DEFAULT);
const RESULT = { desprovido: 'negar provimento ao recurso', provido: 'dar provimento ao recurso', parcial: 'dar parcial provimento ao recurso' };

function prompt(c, style) {
  const parts = [
    'Você redige a minuta de um voto de Turma Recursal (recurso inominado) a pedido do juiz relator.',
    'Regras do método:',
    ...ADAPTED_INSTRUCTIONS.map((r) => `- ${r}`),
    `Resultado fixado pelo relator: ${RESULT[c.outcome]}. Resultado fixado não cria prova.`,
  ];
  if (style) {
    parts.push('', 'BLOCO DE ESTILO (só forma, tom e estrutura; nunca tire dele fato, nome, número ou data):');
    for (const i of style.instructions) parts.push(`- ${i}`);
    style.examples.forEach((e, n) => parts.push('', `Exemplo de estilo ${n + 1}:`, e.text));
    parts.push('FIM DO BLOCO DE ESTILO.');
  }
  parts.push('', 'BLOCO DE EVIDÊNCIAS DO PROCESSO (fatos resumidos dos autos):', c.summary, 'FIM DO BLOCO DE EVIDÊNCIAS.', '', 'Escreva só o texto da minuta, em texto simples, sem comentários antes ou depois.');
  return parts.join('\n');
}

if (cmd === 'prompts') {
  const examples = await readJson(join(dir, 'examples.json'));
  const steer = new Set(await readJson(join(dir, 'steer.json'), []));
  await mkdir(join(dir, 'prompts'), { recursive: true });
  let n = 0;
  for (const c of cases) {
    const write = (cond, style) => (n++, writeFile(join(dir, 'prompts', `${c.label}.${cond}.txt`), prompt(c, style)));
    await write('base', null);
    await write('default', styleBlock(DEFAULT, { examples: looExamples(examples, c.label, c.topic) }));
    if (steer.has(c.label)) for (const p of others) await write(p.id, styleBlock(p));
  }
  console.error(`wrote ${n} prompt(s)`);
} else {
  const files = new Set(await readdir(join(dir, 'drafts')));
  const conds = ['base', 'default', ...others.map((p) => p.id)];
  const rows = [];
  for (const c of cases) for (const cond of conds) {
    const f = `${c.label}.${cond}.txt`;
    if (!files.has(f)) continue;
    const text = await readFile(join(dir, 'drafts', f), 'utf8');
    const scores = {};
    for (const p of Object.values(profiles)) {
      const r = scoreDraft(text, p, c.outcome);
      scores[p.id] = { score: r.score, failed: r.checks.filter((x) => !x.ok).map((x) => x.id) };
    }
    rows.push({ label: c.label, outcome: c.outcome, topic: c.topic, cond, scores });
  }
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const matrix = {};
  for (const cond of conds) {
    const rs = rows.filter((r) => r.cond === cond);
    if (!rs.length) continue;
    matrix[cond] = { n: rs.length };
    for (const p of Object.values(profiles)) matrix[cond][p.id] = mean(rs.map((r) => r.scores[p.id].score));
  }
  const report = { mode: 'style-profile-private', defaultProfile: DEFAULT.id, matrix, rows };
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const ids = Object.keys(profiles);
  const md = ['| condition | n | ' + ids.join(' | ') + ' |', '|---|---|' + ids.map(() => '---').join('|') + '|',
    ...Object.entries(matrix).map(([c, m]) => `| ${c} | ${m.n} | ${ids.map((i) => m[i].toFixed(3)).join(' | ')} |`)];
  await writeFile(join(outDir, 'report.md'), md.join('\n') + '\n');
  console.error(`scored ${rows.length} draft(s)`);
}
