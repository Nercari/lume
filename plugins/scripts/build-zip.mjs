import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeLogo } from "./render-logo.mjs";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
export const pluginRoot = path.resolve(scriptsDir, "../lume-jef");
export const zipPath = path.resolve(scriptsDir, "../dist/lume-jef-0.1.0.zip");

const DOS_TIME = 0;
const DOS_DATE = ((2026 - 1980) << 9) | (11 << 5) | 9;

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

async function walk(dir, root, acc) {
  const entries = await readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    if (entry.name === ".DS_Store") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(abs, root, acc);
    } else if (entry.isFile()) {
      acc.push(path.relative(root, abs).split(path.sep).join("/"));
    }
  }
}

export async function listPluginFiles() {
  const names = [];
  await walk(pluginRoot, pluginRoot, names);
  names.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  return names;
}

function u16(n) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

export function zipStored(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = file.data;
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
      data,
    ]);
    const central = Buffer.concat([
      u32(0x02014b50),
      u16(0x0314),
      u16(20),
      u16(0),
      u16(0),
      u16(DOS_TIME),
      u16(DOS_DATE),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0o100644 << 16),
      u32(offset),
      name,
    ]);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralBuf.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralBuf, eocd]);
}

export function zipNames(bytes) {
  const names = [];
  let pos = 0;
  while (pos + 4 <= bytes.length && bytes.readUInt32LE(pos) === 0x04034b50) {
    const nameLen = bytes.readUInt16LE(pos + 26);
    const extraLen = bytes.readUInt16LE(pos + 28);
    const comp = bytes.readUInt32LE(pos + 18);
    const name = bytes.subarray(pos + 30, pos + 30 + nameLen).toString("utf8");
    names.push(name);
    pos += 30 + nameLen + extraLen + comp;
  }
  return names;
}

export async function buildZip() {
  await writeLogo();
  const names = await listPluginFiles();
  const files = [];
  for (const name of names) {
    const data = await readFile(path.join(pluginRoot, name));
    files.push({ name, data });
  }
  const bytes = zipStored(files);
  await mkdir(path.dirname(zipPath), { recursive: true });
  await writeFile(zipPath, bytes);
  return { bytes, names, zipPath };
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const built = await buildZip();
  process.stdout.write(
    `${built.zipPath} ${built.bytes.length} files ${built.names.length}\n`,
  );
}
