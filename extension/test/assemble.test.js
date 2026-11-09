import { test } from 'node:test';
import assert from 'node:assert/strict';
import { htmlToText, ingestOne } from '../src/assemble.js';
import { packParts } from '../src/pack-bridge.js';
import { processCollected } from '../src/study-run.js';

test('html becomes text and the pack uses the PJe id and sheet', async () => {
  const raw = {
    id: 'DOC1',
    version: '3',
    contentType: 'text/html',
    bytes: new TextEncoder().encode('<p>TOKENHTML <b>linha</b></p><script>segredo</script>'),
  };
  const html = await ingestOne(raw, {});
  assert.equal(html.pages[0].text.includes('TOKENHTML'), true);
  assert.equal(html.pages[0].text.includes('segredo'), false);
  assert.equal(htmlToText('<p>A&amp;B</p>'), 'A&B');
  const { caseResult, parts } = await processCollected({
    mode: 'documents',
    documents: [raw],
    misses: [{ id: 'DOC9', reason: 'unsupported', detail: 'video/mp4' }],
    items: [],
  }, {});
  assert.equal(caseResult.documents[0].docId, 'DOC1');
  assert.equal(caseResult.pages[0].pageInDoc, 1);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].name, 'lume-caso-parte-01-de-01.md');
  assert.match(parts[0].text, /\[Id DOC1, fl\. 1\]/);
  assert.match(parts[0].text, /TOKENHTML/);
  assert.match(parts[0].text, /DOC9/);
  assert.match(parts[0].text, /video\/mp4/);
});

test('an image-only PDF page is OCR and the text is kept under the list id', async () => {
  const { parts } = await processCollected({
    mode: 'documents',
    documents: [
      { id: 'DOC2', version: '1', contentType: 'application/pdf', bytes: new Uint8Array([1]) },
      { id: 'DOC3', version: '1', contentType: 'image/png', bytes: new Uint8Array([2]) },
    ],
    misses: [],
    items: [],
  }, {
    async segmentAutos(_bytes, options) {
      const text = (await options.ocr({ pageNumber: 2, pageCount: 2, pdfPage: {} })).text;
      return {
        pages: [
          { n: 1, text: 'TOKENPDF', hasText: true, method: 'text', pageInDoc: 1 },
          { n: 2, text, hasText: true, method: 'ocr', pageInDoc: null },
        ],
        documents: [],
        gaps: [],
      };
    },
    async ocrPdfPage() { return 'LAUDO'; },
    async ocrImage() { return 'LAUDO'; },
  });
  assert.match(parts[0].text, /\[Id DOC2, fl\. 1\]/);
  assert.match(parts[0].text, /TOKENPDF/);
  assert.match(parts[0].text, /\[Id DOC2, fl\. 2\]/);
  assert.match(parts[0].text, /LAUDO/);
  assert.match(parts[0].text, /\[Id DOC3, fl\. 1\]/);
  const again = await packParts({ origin: 'pje', pages: [], documents: [], gaps: [] });
  assert.equal(again[0].name, 'lume-caso-parte-01-de-01.md');
});
