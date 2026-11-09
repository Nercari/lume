import { deflateSync } from "node:zlib";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WIDTH = 512;
const HEIGHT = 512;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function paint() {
  const bg = [14, 58, 74];
  const paper = [232, 220, 184];
  const ink = [14, 42, 58];
  const raw = Buffer.alloc(HEIGHT * (1 + WIDTH * 3));
  for (let y = 0; y < HEIGHT; y += 1) {
    const row = y * (1 + WIDTH * 3);
    raw[row] = 0;
    for (let x = 0; x < WIDTH; x += 1) {
      const dx = x - 256;
      const dy = y - 236;
      const inGlow = dx * dx + dy * dy <= 168 * 168;
      const inWell = dx * dx + (y - 196) * (y - 196) <= 46 * 46;
      const inBase = x >= 214 && x < 298 && y >= 318 && y < 352;
      const inStem = x >= 244 && x < 268 && y >= 240 && y < 322;
      let color = bg;
      if (inGlow) color = paper;
      if (inWell || inBase || inStem) color = ink;
      const o = row + 1 + x * 3;
      raw[o] = color[0];
      raw[o + 1] = color[1];
      raw[o + 2] = color[2];
    }
  }
  return raw;
}

export function renderLogo() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = deflateSync(paint(), { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const logoPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../lume-jef/assets/logo.png",
);

export async function writeLogo() {
  await mkdir(path.dirname(logoPath), { recursive: true });
  const bytes = renderLogo();
  await writeFile(logoPath, bytes);
  return bytes;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const bytes = await writeLogo();
  process.stdout.write(`${logoPath} ${bytes.length}\n`);
}
