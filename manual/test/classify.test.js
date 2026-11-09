import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIECE_RULES, PIECES, classifyPiece } from '../src/classify.js';

const CASES = [
  ['Petição inicial', 'petição inicial'],
  ['EXORDIAL', 'petição inicial'],
  ['Contestação', 'contestação'],
  ['Resposta do réu', 'contestação'],
  ['Defesa', 'contestação'],
  ['Réplica', 'réplica'],
  ['Embargos de declaração', 'embargos'],
  ['Apelação', 'recurso/apelação'],
  ['Recurso inominado', 'recurso/apelação'],
  ['Agravo de instrumento', 'recurso/apelação'],
  ['Sentença', 'sentença'],
  ['Ato ordinatório', 'ato ordinatório'],
  ['Decisão', 'decisão'],
  ['Despacho', 'despacho'],
  ['Certidão de intimação', 'certidão'],
  ['Intimação', 'intimação/citação'],
  ['Mandado de citação', 'intimação/citação'],
  ['Procuração', 'procuração'],
  ['Substabelecimento', 'procuração'],
  ['Documento de identificação', 'documento de identificação'],
  ['Carteira de identidade', 'documento de identificação'],
  ['RG', 'documento de identificação'],
  ['CNH', 'documento de identificação'],
  ['Laudo pericial', 'laudo'],
  ['Perícia', 'laudo'],
  ['Ofício', 'ofício'],
  ['Manifestação', 'manifestação'],
  ['Contrarrazões', 'manifestação'],
  ['Petição', 'outros'],
  ['Pedido de tutela', 'outros'],
  ['', 'outros'],
];

test('each Portuguese label is accent-insensitive and first-match', () => {
  for (const [input, piece] of CASES) assert.equal(classifyPiece(input), piece, input);
});

test('every taxonomy label is reachable or is the fallback', () => {
  const reached = new Set(CASES.map(([, piece]) => piece));
  for (const piece of PIECES) assert.ok(reached.has(piece), piece);
  for (const rule of PIECE_RULES) assert.ok(PIECES.includes(rule.piece));
});
