import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combineScores, median, passagesFromPack, scoreCase, stateFromPack } from '../scripts/eval-score.mjs';

const pack = (blocks) => blocks.flatMap(([id, text]) => [`[ID ${id}]`, text, '']).join('\n');

test('a perfect capture matches every document and state with no OCR error', () => {
  const score = scoreCase(
    {
      id: 'C1',
      documents: [
        { id: 'D01', state: 'readable', sigilo: false },
        { id: 'D04', state: 'readable', sigilo: false, ocrText: 'LAUDO', ocrPages: 1 },
        { id: 'D08', state: 'corrupt', sigilo: false },
      ],
    },
    {
      text: pack([['D01', 'PETICAO DESPACHO'], ['D04', 'LAUDO']]),
      sidecar: { documents: [{ id: 'D01', situacao: 'lido' }, { id: 'D04', situacao: 'lido' }, { id: 'D08', situacao: 'ilegível' }], gaps: [{ id: 'D08', reason: 'binario' }] },
      sigilo: null,
    },
  );
  assert.equal(score.documentsExpected, 3);
  assert.equal(score.documentsCaptured, 3);
  assert.equal(score.stateMatches, 3);
  assert.deepEqual(score.mismatches, []);
  assert.equal(score.sigiloWarningShown, true);
  assert.deepEqual(score.ocr, { pages: 1, chars: 0, charTotal: 5, words: 0, wordTotal: 1 });
});

test('a missed document is a capture mismatch, not a state match', () => {
  const score = scoreCase(
    { id: 'C1', documents: [{ id: 'D01', state: 'readable', sigilo: false }, { id: 'D02', state: 'readable', sigilo: false }] },
    { text: pack([['D01', 'PETICAO']]), sidecar: { documents: [{ id: 'D01', situacao: 'lido' }], gaps: [] } },
  );
  assert.equal(score.documentsCaptured, 1);
  assert.equal(score.stateMatches, 1);
  assert.deepEqual(score.mismatches, [{ id: 'D02', expected: 'readable', actual: 'missing' }]);
});

test('a wrong state and an extra document both show up by id', () => {
  const score = scoreCase(
    { id: 'C1', documents: [{ id: 'D01', state: 'readable', sigilo: false }] },
    {
      text: pack([['D01', 'PETICAO']]),
      sidecar: { documents: [{ id: 'D01', situacao: 'restrito' }, { id: 'D99', situacao: 'lido' }], gaps: [{ id: 'D01', reason: 'falha_busca' }] },
    },
  );
  assert.equal(score.stateMatches, 0);
  assert.deepEqual(score.mismatches, [
    { id: 'D01', expected: 'readable', actual: 'restricted' },
    { id: 'D99', expected: '—', actual: 'readable' },
  ]);
});

test('CER and WER count one wrong character and one wrong word', () => {
  const score = scoreCase(
    { id: 'C1', documents: [{ id: 'D04', state: 'readable', sigilo: false, ocrText: 'LAUDO', ocrPages: 1 }] },
    { text: pack([['D04', 'LAUDQ']]), sidecar: { documents: [{ id: 'D04', situacao: 'lido' }], gaps: [] } },
  );
  assert.equal(score.ocr.chars, 1);
  assert.equal(score.ocr.charTotal, 5);
  assert.equal(score.ocr.words, 1);
  assert.equal(score.ocr.wordTotal, 1);
});

test('an empty OCR page counts as CER 1 and WER 1', () => {
  const score = scoreCase(
    { id: 'C1', documents: [{ id: 'D05', state: 'readable', sigilo: false, ocrText: 'LAUDO LADO', ocrPages: 2 }] },
    { text: '', sidecar: { documents: [{ id: 'D05', situacao: 'lido' }], gaps: [] } },
  );
  assert.equal(score.stateMatches, 1);
  assert.equal(score.ocr.pages, 2);
  const report = combineScores([[score]], { runs: 1, latencyMs: 150, fixtureVersion: 1, seconds: [1] });
  assert.equal(report.ocr.cer, 1);
  assert.equal(report.ocr.wer, 1);
});

test('the sigilo warning is scored only when a sigilo document exists', () => {
  const expectation = { id: 'C1', documents: [{ id: 'D06', state: 'readable', sigilo: true }] };
  const sidecar = { documents: [{ id: 'D06', situacao: 'lido' }], gaps: [] };
  const shown = scoreCase(expectation, { text: pack([['D06', 'ATA']]), sidecar, sigilo: { hidden: false, text: 'Marca de sigilo neste processo.' } });
  assert.equal(shown.sigiloWarningShown, true);
  const hidden = scoreCase(expectation, { text: pack([['D06', 'ATA']]), sidecar, sigilo: { hidden: true, text: '' } });
  assert.equal(hidden.sigiloWarningShown, false);
  assert.deepEqual(hidden.mismatches, [{ id: 'D06', expected: 'sigilo-warning', actual: 'none' }]);
});

test('pack passages split on the ID tag and keep nothing else', () => {
  const blocks = passagesFromPack('lume-caso/1\nÍndice\nD01 | outros | 2020-01-01 | — | lido\n\n[ID D01, pág. PDF 1]\nPETICAO\nDESPACHO\n\n[ID D05, pág. PDF 2]\nLAUDO\n');
  assert.deepEqual([...blocks.keys()], ['D01', 'D05']);
  assert.equal(blocks.get('D01'), 'PETICAO\nDESPACHO');
  assert.equal(blocks.get('D05'), 'LAUDO');
});

test('the pack state maps read, restricted and corrupt', () => {
  assert.equal(stateFromPack('D01', { documents: [{ id: 'D01', situacao: 'lido' }], gaps: [] }), 'readable');
  assert.equal(stateFromPack('D07', { documents: [{ id: 'D07', situacao: 'restrito' }], gaps: [{ id: 'D07', reason: 'falha_busca' }] }), 'restricted');
  assert.equal(stateFromPack('D08', { documents: [{ id: 'D08', situacao: 'ilegível' }], gaps: [{ id: 'D08', reason: 'binario' }] }), 'corrupt');
  assert.equal(stateFromPack('D09', { documents: [], gaps: [] }), 'missing');
});

test('the median is the middle of an odd count and the mean of an even count', () => {
  assert.equal(median([4.42, 4.43, 4.45]), 4.43);
  assert.equal(median([1, 3]), 2);
  assert.equal(median([]), 0);
});
