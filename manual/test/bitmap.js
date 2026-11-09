// Synthetic gray bitmap of the word LAUDO. Block letters, no real case text.
import { deflateSync } from 'node:zlib';

const FONT = {
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
};

export function renderWord(word, scale = 12, pad = 48) {
  const glyphWidth = 5;
  const glyphHeight = 7;
  const textWidth = word.length * (glyphWidth + 1) * scale;
  const width = textWidth + pad * 2;
  const height = glyphHeight * scale + pad * 2;
  const pixels = Buffer.alloc(width * height, 255);
  for (let index = 0; index < word.length; index += 1) {
    const glyph = FONT[word[index]];
    const originX = pad + index * (glyphWidth + 1) * scale;
    for (let y = 0; y < glyphHeight; y += 1) {
      for (let x = 0; x < glyphWidth; x += 1) {
        if (glyph[y][x] !== '#') continue;
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            const px = originX + x * scale + dx;
            const py = pad + y * scale + dy;
            pixels[py * width + px] = 0;
          }
        }
      }
    }
  }
  return { pixels, width, height };
}

function crc(buf) {
  let value = ~0;
  for (const byte of buf) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
  }
  return (~value) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, sum]);
}

export function pngFromGray({ pixels, width, height }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y += 1) {
    pixels.copy(raw, y * (width + 1) + 1, y * width, (y + 1) * width);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function pdfObject(body) {
  return Buffer.concat([Buffer.from(`${body}`)]);
}

export function makeImagePdf(image) {
  const compressed = deflateSync(image.pixels);
  const content = Buffer.from(`q\n${image.width} 0 0 ${image.height} 36 36 cm\n/Im1 Do\nQ\n`, 'latin1');
  const objects = [];
  const add = (body) => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = add(null);
  const treeId = add(null);
  const contentId = add(Buffer.concat([
    Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'latin1'),
    content,
    Buffer.from('\nendstream', 'latin1'),
  ]));
  const imageId = add(Buffer.concat([
    Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${compressed.length} >>\nstream\n`, 'latin1'),
    compressed,
    Buffer.from('\nendstream', 'latin1'),
  ]));
  const pageId = add(null);
  const mediaWidth = image.width + 72;
  const mediaHeight = image.height + 72;
  objects[pageId - 1] = Buffer.from(
    `<< /Type /Page /Parent ${treeId} 0 R /MediaBox [0 0 ${mediaWidth} ${mediaHeight}] /Resources << /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    'latin1',
  );
  objects[treeId - 1] = Buffer.from(`<< /Type /Pages /Kids [${pageId} 0 R] /Count 1 >>`, 'latin1');
  objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${treeId} 0 R >>`, 'latin1');

  let out = Buffer.from('%PDF-1.4\n', 'latin1');
  const offsets = [];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(out.length);
    const body = Buffer.isBuffer(objects[index]) ? objects[index] : pdfObject(objects[index]);
    out = Buffer.concat([
      out,
      Buffer.from(`${index + 1} 0 obj\n`, 'latin1'),
      body,
      Buffer.from('\nendobj\n', 'latin1'),
    ]);
  }
  const xref = out.length;
  let trailer = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  trailer += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  trailer += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.concat([out, Buffer.from(trailer, 'latin1')]);
}
