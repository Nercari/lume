import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { checkAnswer } from '../src/check.js';
import { buildCasePack } from '../src/pack.js';
import { assess, assessResult, formatScore } from '../scripts/accept-private.mjs';
import {
  BINARY_THRESHOLDS,
  TEXT_RULES,
  binaryScores,
  classifyDocumentoFields,
  isBinaryBody,
  segmentText,
} from '../src/segment-text.js';
import {
  SYNTHETIC_CNJ,
  controlBlob,
  makeForty,
  makeLarge,
  makePjeExport,
  symbolBlob,
} from './fixtures-pjer/make-fixture.js';

const root = fileURLToPath(new URL('..', import.meta.url));

function keptText(result) {
  return result.passages.map((passage) => passage.text).filter(Boolean).join('\n');
}

function wantedText(fixture) {
  return fixture.expected.flatMap((piece) => piece.pages.map((page) => page.text)).filter(Boolean).join('\n');
}

function cite(passage) {
  if (passage.pageInDoc == null) return `[ID ${passage.docId}]`;
  return `[ID ${passage.docId}, pág. ${passage.pageInDoc}]`;
}

function assertCitations(result) {
  const lines = result.passages.map(cite);
  const checked = checkAnswer(lines.join('\n'), result);
  assert.equal(checked.citations.length, result.passages.length);
  for (let index = 0; index < result.passages.length; index += 1) {
    const passage = result.passages[index];
    const status = passage.hasText ? 'exists' : 'unreadable';
    assert.equal(checked.citations[index].status, status, passage.docId);
    assert.equal(passage.pdfPage, null);
    assert.equal(passage.text.includes('\u0000'), false);
    if (!passage.hasText) assert.equal(passage.text, '');
    if (passage.pageInDoc == null) {
      const guessed = checkAnswer(`[ID ${passage.docId}, pág. 1]`, result);
      assert.equal(guessed.citations[0].status, 'missing_page');
    }
  }
}

test('documento fields: recognized type, else the first non-numeric field; party is last', () => {
  const petition = classifyDocumentoFields(['Petição Inicial', 'Parte Autora Fictícia']);
  assert.equal(petition.piece, 'petição inicial');
  assert.equal(petition.typeField, 'Petição Inicial');
  assert.equal(petition.party, 'Parte Autora Fictícia');

  const numbered = classifyDocumentoFields(['10', 'Contestação', 'Réu Fictício']);
  assert.equal(numbered.piece, 'contestação');
  assert.equal(numbered.typeField, 'Contestação');
  assert.equal(numbered.party, 'Réu Fictício');

  const other = classifyDocumentoFields(['Anexo', 'Terceiro Fictício']);
  assert.equal(other.piece, 'outros');
  assert.equal(other.typeField, 'Anexo');
  assert.equal(other.party, 'Terceiro Fictício');

  const only = classifyDocumentoFields(['Sentença']);
  assert.equal(only.piece, 'sentença');
  assert.equal(only.party, 'Sentença');
});

test('binary thresholds keep prose and flag control-heavy or non-letter bodies', () => {
  const prose = 'Texto sintetico desta peca, longo o bastante para nao ser lacuna. '.repeat(4);
  assert.equal(isBinaryBody(prose), false);
  const proseScores = binaryScores(prose);
  assert.ok(proseScores.controlRatio < BINARY_THRESHOLDS.controlRatio);
  assert.ok(proseScores.nonLetterRatio < BINARY_THRESHOLDS.nonLetterRatio);

  const oneControl = `\u0001${'A'.repeat(99)}`;
  assert.equal(oneControl.length, 100);
  assert.ok(binaryScores(oneControl).controlRatio < BINARY_THRESHOLDS.controlRatio);
  assert.equal(isBinaryBody(oneControl), false);

  const atLine = `\u0001${'A'.repeat(BINARY_THRESHOLDS.minChars - 1)}`;
  assert.ok(binaryScores(atLine).controlRatio >= BINARY_THRESHOLDS.controlRatio);
  assert.equal(isBinaryBody(atLine), true);

  const symbols = '$'.repeat(BINARY_THRESHOLDS.minChars);
  assert.ok(binaryScores(symbols).nonLetterRatio >= BINARY_THRESHOLDS.nonLetterRatio);
  assert.equal(isBinaryBody(symbols), true);
  assert.equal(isBinaryBody('$'.repeat(BINARY_THRESHOLDS.minChars - 1)), false);
});

test('documentoHeader wins: every header is a document, processo is not a piece', () => {
  const fixture = makePjeExport({
    pieces: [
      {
        id: '100000001',
        fields: ['Petição Inicial', 'Parte Autora Fictícia'],
        raw: [
          'Texto da inicial, longo o bastante para nao ser lacuna.',
          'Num. 9999 - Pág. 1 permanece no corpo.',
          'ID do documento: 888888888 tambem permanece.',
        ],
      },
      {
        id: '100000002',
        fields: ['10', 'Contestação', 'Réu Fictício'],
        bodyId: '100000099',
        raw: ['Texto da contestacao, longo o bastante para nao ser lacuna.'],
      },
      {
        id: '100000003',
        fields: [],
        raw: [],
        gap: 'image',
      },
    ],
  });
  const result = segmentText(fixture.text);
  assert.deepEqual(result.documents.map((doc) => doc.docId), ['100000001', '100000002', '100000003']);
  assert.equal(result.processNumber, SYNTHETIC_CNJ);
  assert.equal(result.documents.some((doc) => doc.docId === SYNTHETIC_CNJ), false);
  assert.equal(result.documents[0].piece, 'petição inicial');
  assert.equal(result.documents[0].party, 'Parte Autora Fictícia');
  assert.equal(result.documents[1].piece, 'contestação');
  assert.equal(result.documents[1].title, 'Contestação');
  assert.equal(result.documents[1].party, 'Réu Fictício');
  assert.equal(result.documents[0].juntadaAt, '01/02/2024 10:00:00');
  assert.equal(result.documents[0].signedBy, 'Fulano Fictício');
  assert.match(result.passages.find((passage) => passage.docId === '100000001').text, /Num\. 9999/);
  assert.match(result.passages.find((passage) => passage.docId === '100000001').text, /888888888/);
  assert.equal(result.passages.some((passage) => passage.text.includes('juntado aos autos')), false);
  assert.equal(result.passages.some((passage) => passage.text.includes('example.invalid')), false);
  assert.equal(result.gaps.some((gap) => gap.reason === 'id_mismatch' && gap.docId === '100000002'), true);
  assert.equal(result.gaps.some((gap) => gap.docId === '100000003' && gap.detail === 'imagem/sem texto'), true);
  for (const rule of [
    TEXT_RULES.documentoHeader,
    TEXT_RULES.processoHeader,
    TEXT_RULES.juntadaLine,
    TEXT_RULES.separatorDashes,
  ]) {
    assert.ok(result.rules.includes(rule.id), rule.id);
  }
});

test('Documento headers stay in source order even when ids decrease', () => {
  const fixture = makePjeExport({
    pieces: [
      { id: '100000030', fields: ['Despacho', 'Parte Fictícia'], raw: ['Texto da peca trinta, longo o bastante.'] },
      { id: '100000010', fields: ['Sentença', 'Juízo Fictício'], raw: ['Texto da peca dez, longo o bastante.'] },
      { id: '100000020', fields: ['Laudo', 'Perito Fictício'], paginated: true, raw: ['folha um', 'folha dois'] },
    ],
  });
  const result = segmentText(fixture.text);
  assert.deepEqual(result.documents.map((doc) => doc.docId), ['100000030', '100000010', '100000020']);
  assert.deepEqual(result.passages.map((passage) => [passage.docId, passage.pageInDoc, passage.pdfPage]), [
    ['100000030', null, null],
    ['100000010', null, null],
    ['100000020', 1, null],
    ['100000020', 2, null],
  ]);
});

test('Página N de M sets fl. N and keeps the same-line text', () => {
  const fixture = makePjeExport({
    pieces: [{
      id: '100000001',
      fields: ['Laudo', 'Perito Fictício'],
      paginated: true,
      raw: ['texto da pagina um', '', 'texto da pagina tres'],
    }],
  });
  const result = segmentText(fixture.text);
  assert.ok(result.rules.includes(TEXT_RULES.paginaMarker.id));
  const pages = result.pages.filter((page) => page.docId === '100000001');
  assert.deepEqual(pages.map((page) => page.pageInDoc), [1, 2, 3]);
  assert.equal(pages[0].text, 'texto da pagina um');
  assert.equal(pages[1].hasText, false);
  assert.equal(pages[1].text, '');
  assert.equal(pages[2].text, 'texto da pagina tres');
  const pack = buildCasePack(result);
  assert.match(pack, /\[Id 100000001, fl\. 1\]/);
  assert.match(pack, /\[Id 100000001, fl\. 3\]/);
  assert.doesNotMatch(pack, /\[Id 100000001, fl\. 2\]/);
});

test('NUL stripping, UTF-16LE and CRLF still index the header', () => {
  const fixture = makePjeExport({
    pieces: [{
      id: '100000001',
      fields: ['Despacho', 'Parte Fictícia'],
      raw: ['Texto sintetico com quebra Windows.'],
    }],
  });
  const crlf = segmentText(fixture.text.replaceAll('\n', '\r\n'));
  assert.ok(crlf.rules.includes(TEXT_RULES.crlf.id));
  assert.equal(crlf.documents.length, 1);
  assert.match(crlf.passages[0].text, /Windows/);

  const nulled = segmentText(fixture.text.replaceAll('sintetico', 'sin\u0000te\u0000tico'));
  assert.ok(nulled.rules.includes(TEXT_RULES.nulStrip.id));
  assert.match(nulled.passages[0].text, /sintetico/);
  assert.equal(nulled.passages[0].text.includes('\u0000'), false);

  const encoded = Buffer.from(fixture.text, 'utf16le');
  const fromBom = segmentText(Buffer.concat([Buffer.from([0xff, 0xfe]), encoded]));
  const fromPairs = segmentText(encoded);
  const fromBinaryString = segmentText(encoded.toString('latin1'));
  for (const result of [fromBom, fromPairs, fromBinaryString]) {
    assert.ok(result.rules.includes(TEXT_RULES.utf16le.id));
    assert.equal(result.documents[0].docId, '100000001');
    assert.match(result.passages[0].text, /Windows/);
  }
});

test('a binary body is a gap and its bytes are never emitted', () => {
  const token = 'BINLEAK9';
  const fixture = makePjeExport({
    pieces: [
      {
        id: '100000001',
        fields: ['Anexo', 'Parte Fictícia'],
        raw: [controlBlob(token)],
        gap: 'binary',
      },
      {
        id: '100000002',
        fields: ['Anexo', 'Parte Fictícia'],
        raw: [symbolBlob(token)],
        gap: 'binary',
      },
    ],
  });
  const result = segmentText(fixture.text);
  assert.equal(result.documents.length, 2);
  assert.ok(result.rules.includes(TEXT_RULES.binaryUnreadable.id));
  assert.equal(result.gaps.filter((gap) => gap.detail === TEXT_RULES.binaryUnreadable.detail).length, 2);
  assert.equal(result.passages.every((passage) => passage.text === '' && passage.hasText === false), true);
  const pack = buildCasePack(result);
  const dumped = `${JSON.stringify(result.passages)}\n${JSON.stringify(result.pages)}\n${pack}`;
  assert.equal(dumped.includes(token), false);
  assert.equal(dumped.includes('\u0001'), false);
  assert.match(pack, /binário\/ilegível/);
});

test('scattered C0 controls are stripped and the piece is kept', () => {
  const prose = 'Texto sintetico da peca com controles esparsos no meio da frase longa.';
  let dirty = '';
  for (let index = 0; index < prose.length; index += 1) {
    dirty += prose[index];
    if (index % 7 === 6) dirty += '\u0003';
  }
  const fixture = makePjeExport({
    pieces: [{ id: '100000001', fields: ['Despacho', 'Parte Fictícia'], raw: [dirty] }],
  });
  const result = segmentText(fixture.text);
  assert.equal(result.documents.length, 1);
  assert.equal(result.passages[0].hasText, true);
  assert.equal(result.passages[0].text, prose);
  assert.equal(/[\u0000-\u0008\u000B-\u001F]/.test(result.passages[0].text), false);
  assert.equal(result.gaps.some((gap) => gap.detail === 'trecho binário omitido'), false);
});

test('binary lines inside a readable piece are omitted and counted', () => {
  const prose = 'Texto sintetico da peca, longo o bastante para permanecer.';
  const fixture = makePjeExport({
    pieces: [{
      id: '100000001',
      fields: ['Despacho', 'Parte Fictícia'],
      raw: [prose, '\u0003'.repeat(30), '$'.repeat(30), `${prose} fim`],
    }],
  });
  const result = segmentText(fixture.text);
  assert.equal(result.documents.length, 1);
  const passage = result.passages[0];
  assert.equal(passage.hasText, true);
  assert.match(passage.text, /permanecer/);
  assert.match(passage.text, /fim/);
  assert.equal(passage.text.includes('\u0003'), false);
  assert.equal(passage.text.includes('$'), false);
  const note = result.gaps.find((gap) => gap.detail === 'trecho binário omitido');
  assert.ok(note);
  assert.equal(note.count, 2);
  assert.equal(note.docId, '100000001');
});

test('a form feed still splits a page and is not emitted', () => {
  const result = segmentText('Texto sintetico um.\fTexto sintetico dois.\u000c');
  assert.equal(result.pages.length, 2);
  assert.match(result.passages[0].text, /um/);
  assert.match(result.passages[1].text, /dois/);
  assert.equal(result.passages.some((passage) => passage.text.includes('\f')), false);
});

test('forty synthetic pieces keep every header, every citation and the cleaned text', () => {
  const fixture = makeForty();
  const result = segmentText(fixture.text);
  assert.equal(fixture.headers, 40);
  assert.equal(result.documents.length, 40);
  assert.deepEqual(result.documents.map((doc) => doc.docId), fixture.expected.map((piece) => piece.id));
  assert.equal(keptText(result), wantedText(fixture));
  assertCitations(result);
  assert.equal(result.passages.some((passage) => passage.text.includes('CTL')), false);
  assert.equal(result.passages.some((passage) => passage.text.includes('SYM')), false);
  assert.ok(result.gaps.some((gap) => gap.detail === 'imagem/sem texto'));
  assert.ok(result.gaps.some((gap) => gap.detail === 'binário/ilegível'));
  assert.ok(result.rules.includes(TEXT_RULES.nulStrip.id));
  assert.ok(result.rules.includes(TEXT_RULES.paginaMarker.id));
});

test('three megabytes and 300 pieces segment in under two seconds', () => {
  const fixture = makeLarge();
  assert.ok(fixture.text.length >= 3 * 1024 * 1024, fixture.text.length);
  assert.equal(fixture.headers, 300);
  const started = performance.now();
  const result = segmentText(fixture.text);
  const elapsed = performance.now() - started;
  assert.equal(result.documents.length, 300);
  assert.equal(keptText(result), wantedText(fixture));
  assertCitations(result);
  assert.ok(elapsed < 2000, `elapsed ${elapsed.toFixed(0)} ms`);
  const dumped = result.passages.map((passage) => passage.text).join('\n');
  assert.equal(dumped.includes('\u0001'), false);
});

test('an eight-digit Documento line does not take the PJe path', () => {
  const text = 'Documento: 12345678 - Petição Inicial\nTexto sintetico desta peca, longo o bastante.';
  const result = segmentText(text);
  assert.equal(result.rules.includes(TEXT_RULES.documentoHeader.id), false);
});

test('the private acceptance runner prints counts only and fails closed', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lume-pjer-'));
  const token = 'PLANTAEXCLUSIVA';
  const signer = 'NOMEPLANTAUNICO';
  const fixture = makePjeExport({
    pieces: [{
      id: '100000001',
      fields: ['Despacho', signer],
      signer,
      raw: [`Texto ${token} da peca ficticia, longo o bastante.`],
    }],
  });
  const fileName = `segredo-${token}.txt`;
  await writeFile(join(dir, fileName), fixture.text);

  const score = assess(fixture.text);
  assert.equal(score.headers, 1);
  assert.equal(score.documents, 1);
  assert.equal(score.failures, 0);
  assert.equal(score.citationsChecked, score.citationsResolved);
  const broken = assessResult(4, { documents: [{ docId: '1' }], passages: [], gaps: [] });
  assert.ok(broken.failures > 0);

  const child = await new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [join(root, 'scripts/accept-private.mjs'), dir], { cwd: root });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  assert.equal(child.code, 0, child.stderr);
  assert.match(child.stdout, /^case-01 headers=1 documents=1 /);
  assert.match(child.stdout, /citations_checked=1 citations_resolved=1/);
  assert.match(child.stdout, /failures=0/);
  const combined = `${child.stdout}\n${child.stderr}`;
  for (const secret of [token, signer, fileName, SYNTHETIC_CNJ, 'Fulano', 'juntado']) {
    assert.equal(combined.includes(secret), false, secret);
  }
  assert.equal(formatScore({ label: 'case-01', ...score }).includes(token), false);

  const usage = await new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [join(root, 'scripts/accept-private.mjs')], { cwd: root });
    proc.on('error', reject);
    proc.on('close', (code) => resolve(code));
  });
  assert.equal(usage, 2);
  const missing = await new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [join(root, 'scripts/accept-private.mjs'), join(dir, 'nao-existe')], { cwd: root });
    let stderr = '';
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('error', reject);
    proc.on('close', (code) => resolve({ code, stderr }));
  });
  assert.equal(missing.code, 2);
  assert.equal(missing.stderr.includes(token), false);
});
