// Deterministic synthetic PJe cases for npm run eval:synthetic.
// Invented words only: no names, no CPF/CNPJ, no real case number, no real document.
// A fixed seed picks the filler words, so two runs build the same bytes.
// Each case has nine documents and covers html, a text PDF, a scanned PNG, a
// two-page scanned PDF, a sigilo row, a 403 row and a corrupt file.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { pngFromGray, renderWord } from '../../manual/test/bitmap.js';
import { makePdf } from '../../manual/test/pdf-fixture.js';

export const FIXTURE_VERSION = 1;
export const FEED = 'application/octet-stream';

const WORDS = [
  'PETICAO', 'DESPACHO', 'CERTIDAO', 'DECISAO', 'ANEXO', 'CONTRATO', 'ATA',
  'PARECER', 'OFICIO', 'PROTOCOLO', 'MANIFESTACAO', 'RELACAO', 'TERMO', 'VISTA',
];

// mulberry32: small seeded generator, enough for fixture word order.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function words(rand, count) {
  const out = [];
  let last = -1;
  while (out.length < count) {
    const index = Math.floor(rand() * WORDS.length);
    if (index === last) continue;
    out.push(WORDS[index]);
    last = index;
  }
  return out.join(' ');
}

export function sentence(rand, count = 8) {
  return `${words(rand, count)}.`;
}

// One PDF page per image, no text layer, so each page must go through OCR.
// Same object and xref layout as manual/test/pdf-fixture.js.
function imagePdf(images) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = add(null);
  const treeId = add(null);
  const pageIds = images.map(() => add(null));
  const contentIds = images.map((image) => {
    const content = Buffer.from(`q\n${image.width} 0 0 ${image.height} 36 36 cm\n/Im1 Do\nQ\n`, 'latin1');
    return add(Buffer.concat([
      Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'),
      content,
      Buffer.from('\nendstream', 'latin1'),
    ]));
  });
  const imageIds = images.map((image) => {
    const compressed = deflateSync(image.pixels);
    return add(Buffer.concat([
      Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`, 'latin1'),
      compressed,
      Buffer.from('\nendstream', 'latin1'),
    ]));
  });
  images.forEach((image, index) => {
    objects[pageIds[index] - 1] = Buffer.from(
      `<< /Type /Page /Parent ${treeId} 0 R /MediaBox [0 0 ${image.width + 72} ${image.height + 72}] /Resources << /XObject << /Im1 ${imageIds[index]} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`,
      'latin1',
    );
  });
  objects[treeId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`, 'latin1');
  objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${treeId} 0 R >>`, 'latin1');
  let out = Buffer.from('%PDF-1.4\n', 'latin1');
  const offsets = [];
  objects.forEach((body, index) => {
    offsets.push(out.length);
    out = Buffer.concat([
      out,
      Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
      body,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
  });
  const xref = out.length;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  trailer += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.concat([out, Buffer.from(trailer, 'latin1')]);
}

function html(text) {
  return Buffer.from(`<!doctype html><html><body><p>${text}</p></body></html>`, 'utf8');
}

function specFor(index) {
  const rand = seeded(0x5eed + index);
  const processo = `SINTETICO-${String(index + 1).padStart(2, '0')}`;
  const id = (n) => `D${String(index * 9 + n).padStart(2, '0')}`;
  // Page 2 repeats the same block word: scale 16 keeps every glyph legible, and
  // a stable zero-error baseline makes any later OCR regression visible.
  const scanWords = ['LAUDO', 'LAUDO'];
  const docs = [
    { id: id(1), kind: 'html', type: 'text/html', bytes: html(sentence(rand, 9)), state: 'readable', sigilo: false },
    { id: id(2), kind: 'html', type: 'text/html', bytes: html(sentence(rand, 6)), state: 'readable', sigilo: false },
    { id: id(3), kind: 'pdf-text', type: 'application/pdf', bytes: Buffer.from(makePdf({ pages: [[sentence(rand, 7), sentence(rand, 5)]] })), state: 'readable', sigilo: false },
    { id: id(4), kind: 'png-scan', type: 'image/png', bytes: pngFromGray(renderWord(scanWords[0], 12)), state: 'readable', sigilo: false, ocrText: scanWords[0], ocrPages: 1 },
    { id: id(5), kind: 'pdf-scan', type: 'application/pdf', bytes: imagePdf(scanWords.map((word) => renderWord(word, 16))), state: 'readable', sigilo: false, ocrText: scanWords.join(' '), ocrPages: scanWords.length },
    { id: id(6), kind: 'html-sigilo', type: 'text/html', bytes: html(sentence(rand, 5)), state: 'readable', sigilo: true },
    { id: id(7), kind: 'restricted', type: 'text/html', bytes: Buffer.alloc(0), status: 403, state: 'restricted', sigilo: false },
    { id: id(8), kind: 'corrupt', type: FEED, bytes: Buffer.from('ARQUIVO CORROMPIDO SEM FORMATO LEGIVEL\n', 'utf8'), state: 'corrupt', sigilo: false },
    { id: id(9), kind: 'html', type: 'text/html', bytes: html(sentence(rand, 4)), state: 'readable', sigilo: false },
  ];
  return { id: `C${index + 1}`, processo, docs };
}

export function caseSpecs() {
  return [0, 1, 2].map(specFor);
}

export function expectationOf(spec) {
  return {
    fixtureVersion: FIXTURE_VERSION,
    id: spec.id,
    processo: spec.processo,
    documents: spec.docs.map((doc) => ({
      id: doc.id,
      state: doc.state,
      sigilo: doc.sigilo,
      ...(doc.ocrText ? { ocrText: doc.ocrText, ocrPages: doc.ocrPages ?? 1 } : {}),
    })),
  };
}

// Writes the case bytes and expected.json under dir. The eval serves the same
// bytes from memory, so the folder is for reading a failing case, not for input.
export async function writeCase(dir, spec) {
  await mkdir(dir, { recursive: true });
  const ext = { 'text/html': 'html', 'application/pdf': 'pdf', 'image/png': 'png', [FEED]: 'bin' };
  for (const doc of spec.docs) {
    if (!doc.bytes?.length) continue;
    await writeFile(join(dir, `${doc.id}.${ext[doc.type] ?? 'bin'}`), doc.bytes);
  }
  await writeFile(join(dir, 'expected.json'), `${JSON.stringify(expectationOf(spec), null, 2)}\n`);
  return dir;
}

export function fixtureDocs(spec) {
  return spec.docs.map((doc) => ({ id: doc.id, type: doc.type, bytes: doc.bytes, status: doc.status, sigilo: doc.sigilo }));
}
