// Validates a lume-caso/1 part-file set. The JSON report carries counts and
// error codes only: no passage text, ids, or header values.

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const FORMAT = "lume-caso/1";
export const PART_MAX_CHARS = 350_000;
export const GAP_REASONS = Object.freeze([
  "imagem_sem_texto",
  "ilegivel",
  "binario",
  "falha_busca",
]);
export const OCR_VALUES = Object.freeze(["local", "nenhum", "visao"]);
export const ORIGINS = Object.freeze(["botao", "work"]);
export const SITUACOES = Object.freeze([
  "lido",
  "parcial",
  "ilegível",
  "ausente",
  "falhou",
  "restrito",
]);
export const TIPOS = Object.freeze([
  "petição inicial",
  "contestação",
  "réplica",
  "decisão",
  "despacho",
  "sentença",
  "ato ordinatório",
  "certidão",
  "procuração",
  "documento de identificação",
  "laudo",
  "ofício",
  "manifestação",
  "recurso/apelação",
  "embargos",
  "intimação/citação",
  "outros",
]);

const FRONT_KEYS = ["formato", "processo", "parte", "total", "ids", "origem"];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const PAGE = "[1-9]\\d*";
const TAG_BOTH = new RegExp(`^\\[ID ([A-Za-z0-9][A-Za-z0-9._:-]*), pág\\. (${PAGE}), pág\\. PDF (${PAGE})\\]$`);
const TAG_DOC = new RegExp(`^\\[ID ([A-Za-z0-9][A-Za-z0-9._:-]*), pág\\. (${PAGE})\\]$`);
const TAG_PDF = new RegExp(`^\\[ID ([A-Za-z0-9][A-Za-z0-9._:-]*), pág\\. PDF (${PAGE})\\]$`);
const TAG_ID = /^\[ID ([A-Za-z0-9][A-Za-z0-9._:-]*)\]$/;
const GAP_LINE = new RegExp(`^- ID ([A-Za-z0-9][A-Za-z0-9._:-]*)(?:, pág\\. (${PAGE}))?(?:, pág\\. PDF (${PAGE}))?: (imagem_sem_texto|ilegivel|binario|falha_busca)$`);
const INDEX_HEADER = "ID | Tipo | Data | Págs. do documento | Situação";
const COUNTS_RE = /^Contagens: (\d+) documentos, (\d+) trechos, (\d+) lacunas$/;
const PART_RE = /^lume-caso-parte-(\d+)-de-(\d+)\.md$/;
const ESTIMATE_RE = /~|aprox/i;

function emptyCounts() {
  return { parts: 0, ids: 0, tags: 0, gaps: 0, errors: 0 };
}

function finish(codes, counts) {
  const map = new Map();
  for (const code of codes) map.set(code, (map.get(code) ?? 0) + 1);
  const errors = [...map.entries()].map(([code, count]) => ({ code, count }));
  return {
    ok: errors.length === 0,
    counts: { ...counts, errors: codes.length },
    errors,
  };
}

function usageReport() {
  return finish(["usage"], emptyCounts());
}

function padWidth(total) {
  return Math.max(2, String(total).length);
}

function partName(parte, total) {
  const width = padWidth(total);
  const left = String(parte).padStart(width, "0");
  const right = String(total).padStart(width, "0");
  return `lume-caso-parte-${left}-de-${right}.md`;
}

function parseFront(text) {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, "\n"));
  if (!match) return { error: true, fields: null, body: "" };
  const fields = {};
  const seen = [];
  for (const line of match[1].split("\n")) {
    const cut = line.indexOf(":");
    if (cut === -1) return { error: true, fields: null, body: match[2] };
    const key = line.slice(0, cut).trim();
    const value = line.slice(cut + 1).trim();
    if (fields[key] !== undefined) return { error: true, fields: null, body: match[2] };
    fields[key] = value;
    seen.push(key);
  }
  if (seen.length !== FRONT_KEYS.length || FRONT_KEYS.some((key) => fields[key] === undefined)) {
    return { error: true, fields: null, body: match[2] };
  }
  return { error: false, fields, body: match[2] };
}

function parseIds(value) {
  if (value === "") return [];
  const ids = value.split(",").map((item) => item.trim());
  if (ids.some((id) => !ID_RE.test(id))) return null;
  return ids;
}

function parseDocPages(cell) {
  if (cell === "—") return [];
  const pages = [];
  for (const raw of cell.split(",")) {
    const token = raw.trim();
    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start < 1 || end < start || end - start > 10000) return null;
      for (let page = start; page <= end; page += 1) pages.push(page);
      continue;
    }
    if (!/^\d+$/.test(token) || Number(token) < 1) return null;
    pages.push(Number(token));
  }
  if (new Set(pages).size !== pages.length) return null;
  return pages;
}

function parseTag(line) {
  const both = TAG_BOTH.exec(line);
  if (both) return { id: both[1], docPage: Number(both[2]), pdfPage: Number(both[3]) };
  const doc = TAG_DOC.exec(line);
  if (doc) return { id: doc[1], docPage: Number(doc[2]), pdfPage: null };
  const pdf = TAG_PDF.exec(line);
  if (pdf) return { id: pdf[1], docPage: null, pdfPage: Number(pdf[2]) };
  const bare = TAG_ID.exec(line);
  if (bare) return { id: bare[1], docPage: null, pdfPage: null };
  return null;
}

function parseGap(line) {
  const match = GAP_LINE.exec(line);
  if (!match) return null;
  return {
    id: match[1],
    paginaDocumento: match[2] ? Number(match[2]) : null,
    paginaPdf: match[3] ? Number(match[3]) : null,
    reason: match[4],
  };
}

function sameGap(left, right) {
  return left.id === right.id
    && left.reason === right.reason
    && left.paginaDocumento === right.paginaDocumento
    && left.paginaPdf === right.paginaPdf;
}

function linesOf(body) {
  return body.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
}

function readHeader(lines, codes) {
  const header = {};
  if (lines[0] !== FORMAT) codes.push("version");
  const expected = [
    ["processo", /^Processo: (.+)$/],
    ["orgao", /^Órgão: (.+)$/],
    ["geradoEm", /^Gerado em: (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)$/],
    ["origem", /^Origem: (botao|work)$/],
    ["contagens", COUNTS_RE],
  ];
  for (let index = 0; index < expected.length; index += 1) {
    const [key, re] = expected[index];
    const match = re.exec(lines[index + 1] ?? "");
    if (!match) {
      codes.push("header");
      return null;
    }
    header[key] = key === "contagens"
      ? { documentos: Number(match[1]), trechos: Number(match[2]), lacunas: Number(match[3]) }
      : match[1];
  }
  return header;
}

function readIndex(lines, start, codes) {
  if (lines[start] !== "Índice" || lines[start + 1] !== INDEX_HEADER) {
    codes.push("index");
    return null;
  }
  const rows = [];
  let cursor = start + 2;
  while (cursor < lines.length && lines[cursor] !== "") {
    const cells = lines[cursor].split(" | ");
    if (cells.length !== 5) {
      codes.push("index");
      return null;
    }
    const [id, tipo, data, paginas, situacao] = cells;
    const pages = parseDocPages(paginas);
    const dataOk = data === "—" || /^\d{4}-\d{2}-\d{2}$/.test(data);
    if (!ID_RE.test(id) || !TIPOS.includes(tipo) || !dataOk || !pages || !SITUACOES.includes(situacao)) {
      codes.push("index");
      return null;
    }
    rows.push({ id, tipo, data, pages, situacao });
    cursor += 1;
  }
  return { rows, next: cursor };
}

function readGaps(lines, start, codes) {
  if (lines[start] !== "Lacunas") {
    codes.push("gaps");
    return null;
  }
  const gaps = [];
  let cursor = start + 1;
  if (lines[cursor] === "- nenhuma") {
    cursor += 1;
    return { gaps, next: cursor };
  }
  while (cursor < lines.length && lines[cursor] !== "") {
    const gap = parseGap(lines[cursor]);
    if (!gap) {
      codes.push("gaps");
      return null;
    }
    gaps.push(gap);
    cursor += 1;
  }
  if (!gaps.length) {
    codes.push("gaps");
    return null;
  }
  return { gaps, next: cursor };
}

function readPassages(lines, start, codes) {
  const tags = [];
  let cursor = start;
  if (cursor < lines.length && lines[cursor] === "") cursor += 1;
  while (cursor < lines.length) {
    if (lines[cursor] === "") {
      cursor += 1;
      continue;
    }
    const tag = parseTag(lines[cursor]);
    if (!tag) {
      codes.push("tag");
      return tags;
    }
    cursor += 1;
    const text = [];
    while (cursor < lines.length && lines[cursor] !== "" && !parseTag(lines[cursor])) {
      text.push(lines[cursor]);
      cursor += 1;
    }
    if (!text.length) codes.push("tag");
    tags.push(tag);
  }
  return tags;
}

function parsePart(name, text, codes) {
  if (ESTIMATE_RE.test(text)) codes.push("estimated_page");
  const front = parseFront(text);
  if (front.error) {
    codes.push("front_matter");
    return null;
  }
  const { fields, body } = front;
  if (fields.formato !== FORMAT) codes.push("version");
  if (!fields.processo) codes.push("header");
  if (!/^\d+$/.test(fields.parte) || String(Number(fields.parte)) !== fields.parte) codes.push("front_matter");
  if (!/^\d+$/.test(fields.total) || String(Number(fields.total)) !== fields.total) codes.push("front_matter");
  const parte = Number(fields.parte);
  const total = Number(fields.total);
  const ids = parseIds(fields.ids);
  if (!ids) codes.push("front_matter");
  if (!ORIGINS.includes(fields.origem)) codes.push("header");
  const fileMatch = PART_RE.exec(name);
  if (!fileMatch || Number(fileMatch[1]) !== parte || Number(fileMatch[2]) !== total || name !== partName(parte, total)) {
    codes.push("parts_contiguous");
  }
  const lines = linesOf(body);
  const header = readHeader(lines, codes);
  if (!header) return null;
  if (header.processo !== fields.processo || header.origem !== fields.origem) codes.push("header");
  if (lines[6] !== "") codes.push("header");
  const parteLine = lines[7] ?? "";
  const parteMatch = /^Parte (\d+) de (\d+)$/.exec(parteLine);
  if (!parteMatch || Number(parteMatch[1]) !== parte || Number(parteMatch[2]) !== total) {
    codes.push("parts_contiguous");
  }
  const idsLine = lines[8] ?? "";
  const idsBody = /^Ids: (.*)$/.exec(idsLine);
  const bodyIds = idsBody ? parseIds(idsBody[1]) : null;
  if (!idsBody || !bodyIds || !ids || bodyIds.join(",") !== ids.join(",")) codes.push("front_matter");
  if (lines[9] !== "") codes.push("header");

  let cursor = 10;
  let rows = null;
  let gaps = [];
  if (parte === 1) {
    const index = readIndex(lines, cursor, codes);
    if (!index) return null;
    rows = index.rows;
    if (lines[index.next] !== "") codes.push("index");
    const gapBlock = readGaps(lines, index.next + 1, codes);
    if (!gapBlock) return null;
    gaps = gapBlock.gaps;
    cursor = gapBlock.next;
  } else if (lines.slice(cursor).includes("Índice") || lines.slice(cursor).includes("Lacunas")) {
    codes.push("index");
  }
  const tags = readPassages(lines, cursor, codes);
  return {
    name,
    parte,
    total,
    ids: ids ?? [],
    origem: fields.origem,
    processo: fields.processo,
    orgao: header.orgao,
    geradoEm: header.geradoEm,
    contagens: header.contagens,
    rows,
    gaps,
    tags,
    chars: text.length,
  };
}

function pdfPagesFor(id, tags, gaps) {
  const pages = [];
  for (const tag of tags) {
    if (tag.id === id && tag.pdfPage != null) pages.push(tag.pdfPage);
  }
  for (const gap of gaps) {
    if (gap.id === id && gap.paginaPdf != null) pages.push(gap.paginaPdf);
  }
  return [...new Set(pages)].sort((a, b) => a - b);
}

function checkSidecar(sidecarText, parts, rows, gaps, tags, codes) {
  if (ESTIMATE_RE.test(sidecarText)) codes.push("estimated_page");
  let sidecar;
  try {
    sidecar = JSON.parse(sidecarText);
  } catch {
    codes.push("sidecar");
    return;
  }
  if (!sidecar || typeof sidecar !== "object" || Array.isArray(sidecar)) {
    codes.push("sidecar");
    return;
  }
  const part1 = parts.find((part) => part.parte === 1);
  if (sidecar.formato !== FORMAT) codes.push("version");
  if (!part1 || sidecar.origem !== part1.origem || sidecar.processo !== part1.processo) codes.push("sidecar");
  if (!part1 || sidecar.orgao !== part1.orgao || sidecar.geradoEm !== part1.geradoEm) codes.push("sidecar");
  if (!OCR_VALUES.includes(sidecar.ocr)) codes.push("sidecar");
  if (!Array.isArray(sidecar.documents) || !Array.isArray(sidecar.parts) || !Array.isArray(sidecar.gaps)) {
    codes.push("sidecar");
    return;
  }
  if (sidecar.documents.length !== rows.length) codes.push("sidecar");
  sidecar.documents.forEach((doc, index) => {
    const row = rows[index];
    if (!doc || typeof doc !== "object" || !row || doc.id !== row.id || doc.tipo !== row.tipo || doc.situacao !== row.situacao) {
      codes.push("sidecar");
      return;
    }
    const data = row.data === "—" ? null : row.data;
    if (doc.data !== data) codes.push("sidecar");
    if (!Array.isArray(doc.paginasDocumento) || doc.paginasDocumento.join(",") !== row.pages.join(",")) {
      codes.push("sidecar");
    }
    if (doc.paginasPdf !== undefined) {
      const expect = pdfPagesFor(row.id, tags, gaps);
      if (!Array.isArray(doc.paginasPdf) || [...doc.paginasPdf].sort((a, b) => a - b).join(",") !== expect.join(",")) {
        codes.push("sidecar");
      }
    }
  });
  const ordered = [...parts].sort((a, b) => a.parte - b.parte);
  if (sidecar.parts.length !== ordered.length) codes.push("sidecar");
  sidecar.parts.forEach((entry, index) => {
    const part = ordered[index];
    if (!part || entry.parte !== part.parte || entry.total !== part.total || entry.arquivo !== part.name) {
      codes.push("sidecar");
      return;
    }
    if (!Array.isArray(entry.ids) || entry.ids.join(",") !== part.ids.join(",")) codes.push("sidecar");
  });
  if (sidecar.gaps.length !== gaps.length || sidecar.gaps.some((gap, index) => !sameGap(gap, gaps[index]))) {
    codes.push("sidecar");
  }
}

function crossCheck(parts, codes) {
  const totals = new Set(parts.map((part) => part.total));
  const numbers = parts.map((part) => part.parte).sort((a, b) => a - b);
  const total = parts[0]?.total ?? 0;
  const contiguous = totals.size === 1
    && total === parts.length
    && numbers.every((parte, index) => parte === index + 1);
  if (!contiguous) codes.push("parts_contiguous");

  const part1 = parts.find((part) => part.parte === 1);
  if (!part1?.rows) {
    codes.push("index");
    return { rows: [], gaps: [], tags: [] };
  }
  const rows = part1.rows;
  const ids = rows.map((row) => row.id);
  if (new Set(ids).size !== ids.length) codes.push("index_id_once");

  const assigned = [];
  for (const part of [...parts].sort((a, b) => a.parte - b.parte)) {
    if (new Set(part.ids).size !== part.ids.length) codes.push("index_id_once");
    assigned.push(...part.ids);
  }
  if (assigned.join(",") !== ids.join(",")) codes.push("index_id_once");
  if (new Set(assigned).size !== assigned.length) codes.push("index_id_once");

  const tags = parts.flatMap((part) => part.tags);
  const gaps = part1.gaps;
  const gapIds = new Set(gaps.map((gap) => gap.id));
  for (const gap of gaps) {
    if (!ids.includes(gap.id)) codes.push("gaps");
  }
  for (const row of rows) {
    const ownTags = tags.filter((tag) => tag.id === row.id);
    const ownGaps = gaps.filter((gap) => gap.id === row.id);
    if (row.situacao === "lido" && (ownTags.length === 0 || ownGaps.length > 0)) codes.push("gaps");
    if (row.situacao === "parcial" && (ownTags.length === 0 || ownGaps.length === 0)) codes.push("gaps");
    if (row.situacao !== "lido" && row.situacao !== "parcial" && (ownTags.length > 0 || ownGaps.length === 0)) {
      codes.push("gaps");
    }
    if (!gapIds.has(row.id) && row.situacao !== "lido") codes.push("gaps");
  }

  for (const part of parts) {
    for (const tag of part.tags) {
      if (!ids.includes(tag.id)) codes.push("tag_unknown_id");
      else if (!part.ids.includes(tag.id)) codes.push("tag_wrong_part");
    }
    if (part.chars > PART_MAX_CHARS && part.tags.length !== 1) codes.push("split");
    const counts = part.contagens;
    if (!counts
      || counts.documentos !== rows.length
      || counts.trechos !== tags.length
      || counts.lacunas !== gaps.length) {
      codes.push("header");
    }
    if (part.origem !== part1.origem || part.processo !== part1.processo) codes.push("header");
    if (part.orgao !== part1.orgao || part.geradoEm !== part1.geradoEm) codes.push("header");
  }
  return { rows, gaps, tags };
}

export function validateSet(entries, sidecarText = null) {
  const codes = [];
  const parts = [];
  for (const entry of entries) {
    const parsed = parsePart(entry.name, entry.text, codes);
    if (parsed) parts.push(parsed);
  }
  if (!parts.length) {
    codes.push("parts_contiguous");
    return finish(codes, emptyCounts());
  }
  const summary = crossCheck(parts, codes);
  if (sidecarText != null) {
    checkSidecar(sidecarText, parts, summary.rows, summary.gaps, summary.tags, codes);
  }
  return finish(codes, {
    parts: entries.length,
    ids: summary.rows.length,
    tags: summary.tags.length,
    gaps: summary.gaps.length,
    errors: 0,
  });
}

export async function validateDir(dir) {
  let info;
  try {
    info = await stat(dir);
  } catch {
    return usageReport();
  }
  if (!info.isDirectory()) return usageReport();
  const names = (await readdir(dir)).filter((name) => PART_RE.test(name)).sort();
  const entries = [];
  for (const name of names) {
    entries.push({ name, text: await readFile(path.join(dir, name), "utf8") });
  }
  let sidecar = null;
  try {
    sidecar = await readFile(path.join(dir, "lume-caso.json"), "utf8");
  } catch {
    sidecar = null;
  }
  return validateSet(entries, sidecar);
}

function isDirectRun() {
  const arg = process.argv[1];
  if (!arg) return false;
  return import.meta.url === pathToFileURL(arg).href;
}

if (isDirectRun()) {
  const dir = process.argv[2];
  if (!dir) {
    process.stdout.write(`${JSON.stringify(usageReport())}\n`);
    process.exit(2);
  }
  const report = await validateDir(path.resolve(dir));
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(report.ok ? 0 : report.errors.some((error) => error.code === "usage") ? 2 : 1);
}
