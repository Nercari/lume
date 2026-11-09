// Synthetic, non-legal technical fixtures only. No real case content, names or numbers.

// Builds a valid one-font PDF. pages: array of pages, each an array of text lines.
// An empty page has no text layer, like a scanned page.
export function makePdf(pages) {
  const objs = [];
  const add = (body) => objs.push(body) && objs.length;
  const catalog = add(null);
  const tree = add(null);
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids = [];
  for (const lines of pages) {
    const ops = lines.map((l, i) => `BT /F1 12 Tf 72 ${720 - i * 20} Td (${l.replace(/[()\\]/g, '\\$&')}) Tj ET`).join('\n');
    const content = add(`<< /Length ${Buffer.byteLength(ops)} >>\nstream\n${ops}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${tree} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${tree} 0 R >>`;
  objs[tree - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = objs.map((body, i) => {
    const at = Buffer.byteLength(out);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

// A synthetic "scan": the fake OCR engine reads these bytes back as lines with confidences.
export const makeScan = (lines) => new TextEncoder().encode(`FAKESCAN${JSON.stringify(lines)}`);

// Deterministic fake OCR engine. It implements the same interface as a real adapter.
export const fakeOcr = {
  id: 'fake-ocr-1',
  async recognize({ bytes }) {
    const s = new TextDecoder().decode(bytes);
    if (!s.startsWith('FAKESCAN')) throw new Error('image not recognized');
    return { lines: JSON.parse(s.slice(8)).map(([text, confidence], i) => ({ text, confidence, bbox: [0, i * 20, 400, 18] })) };
  },
};

// Fake page renderer for PDF pages without a text layer: returns a synthetic scan per page.
export const fakeRenderer = (scansByPage) => async (_pdfPage, page) => ({ bytes: scansByPage[page] ?? makeScan([]), mime: 'image/x-fake' });

export const TEXT = {
  p1: ['Pump model TX-200 rated flow 40 litres per minute.', 'Inlet pressure must stay below 6 bar.'],
  p2: ['Replace the seal kit every 2000 operating hours.'],
};
