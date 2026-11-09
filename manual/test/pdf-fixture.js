// Tiny PDF writer for synthetic fixtures. ASCII text and optional outlines.
// No real case content. Non-ASCII bytes are not emitted.

function pdfLiteral(value) {
  let out = '';
  for (const char of String(value)) {
    const code = char.codePointAt(0);
    if (char === '(' || char === ')' || char === '\\') out += `\\${char}`;
    else if (code >= 32 && code < 127) out += char;
    else throw new Error('fixture text must be ASCII');
  }
  return `(${out})`;
}

function contentStream(lines) {
  const ops = lines.map((line, index) => {
    const text = typeof line === 'string' ? line : line.text;
    const y = typeof line === 'string' ? 740 - index * 16 : line.y;
    return `BT /F1 11 Tf 72 ${y} Td ${pdfLiteral(text)} Tj ET`;
  }).join('\n');
  return `<< /Length ${Buffer.byteLength(ops, 'latin1')} >>\nstream\n${ops}\nendstream`;
}

function serialize(objects) {
  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

// pages: array of line arrays. A line is a string (stacked from the top) or { text, y }.
// outlines: { title, page } with page as a 0-based index.
export function makePdf({ pages, outlines = [] }) {
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = add(null);
  const treeId = add(null);
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const outlinesId = outlines.length ? add(null) : null;
  const outlineIds = outlines.map(() => add(null));
  const contentIds = pages.map((lines) => add(contentStream(lines)));
  const pageIds = pages.map(() => add(null));

  pages.forEach((_, index) => {
    objects[pageIds[index] - 1] = `<< /Type /Page /Parent ${treeId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`;
  });
  objects[treeId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  if (outlinesId) {
    objects[outlinesId - 1] = `<< /Type /Outlines /First ${outlineIds[0]} 0 R /Last ${outlineIds[outlineIds.length - 1]} 0 R /Count ${outlineIds.length} >>`;
    outlines.forEach((item, index) => {
      const prev = index > 0 ? `/Prev ${outlineIds[index - 1]} 0 R` : '';
      const next = index < outlineIds.length - 1 ? `/Next ${outlineIds[index + 1]} 0 R` : '';
      const pageRef = pageIds[item.page];
      objects[outlineIds[index] - 1] = `<< /Title ${pdfLiteral(item.title)} /Parent ${outlinesId} 0 R ${prev} ${next} /Dest [${pageRef} 0 R /Fit] >>`;
    });
  }
  const outlineRef = outlinesId ? `/Outlines ${outlinesId} 0 R` : '';
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${treeId} 0 R ${outlineRef} >>`;
  return serialize(objects);
}

export const at = (text, y) => ({ text, y });
