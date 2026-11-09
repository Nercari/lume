// Full-case text for the PJe tab the ChatGPT side panel is reading.
// A document page number is printed only when the file says it. It is never estimated.

export const PART_MAX_CHARS = 350000;
export const CASE_FORMAT = 'lume-caso/1';
export const CASE_ORIGIN = 'botao';

const HOSTS = new Set(['pje1g.trf1.jus.br', 'pje2g.trf1.jus.br']);
const SITUATIONS = ['legível', 'OCR', 'ilegível', 'imagem sem texto', 'binário'];

export function caseViewUrl(pageUrl, part = 1) {
  let url;
  try { url = new URL(pageUrl); } catch { return null; }
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)) return null;
  url.hash = part > 1 ? `lume-autos/${part}` : 'lume-autos';
  return url.href;
}

export function partFileName(n, total) {
  const width = Math.max(2, String(total).length);
  return `lume-caso-parte-${String(n).padStart(width, '0')}-de-${String(total).padStart(width, '0')}.md`;
}

export function passageTag(page) {
  const id = page?.docId ?? '';
  const docPage = page?.pageInDoc;
  if (docPage != null && docPage !== '') return `[ID ${id}, pág. ${docPage}]`;
  return `[ID ${id}]`;
}

export function situation(doc, pages, items) {
  const item = (items ?? []).find((row) => String(row?.id) === String(doc?.docId));
  const kind = doc?.kind || '';
  if (item?.state === 'unsupported' || kind === 'binary') return 'binário';
  const readable = (pages ?? []).filter((page) => page.hasText && String(page.text ?? '').trim());
  if (!readable.length) return kind === 'image' ? 'imagem sem texto' : 'ilegível';
  if (readable.some((page) => page.method === 'ocr')) return 'OCR';
  return 'legível';
}

function documentPageCount(pages) {
  const known = (pages ?? []).filter((page) => page.pageInDoc != null && page.pageInDoc !== '');
  return known.length ? String(known.length) : '—';
}

function headerLines(caseResult, items) {
  const counts = Object.fromEntries(SITUATIONS.map((label) => [label, 0]));
  for (const doc of caseResult?.documents ?? []) {
    const pages = (caseResult.pages ?? []).filter((page) => String(page.docId) === String(doc.docId));
    const label = situation(doc, pages, items);
    if (counts[label] != null) counts[label] += 1;
  }
  return [
    `Documentos: ${(caseResult?.documents ?? []).length}`,
    `Páginas: ${(caseResult?.pages ?? []).length}`,
    `Legível: ${counts['legível']}`,
    `OCR: ${counts.OCR}`,
    `Ilegível: ${counts['ilegível']}`,
    `Imagem sem texto: ${counts['imagem sem texto']}`,
    `Binário: ${counts['binário']}`,
    `Lacunas: ${(caseResult?.gaps ?? []).length}`,
  ];
}

function indexLines(caseResult, items) {
  const lines = ['ID | Tipo | Data | Págs. do documento | Situação'];
  const dates = new Map((items ?? []).filter((row) => row?.id != null).map((row) => [String(row.id), row.date || null]));
  for (const doc of caseResult?.documents ?? []) {
    const id = String(doc.docId);
    const pages = (caseResult.pages ?? []).filter((page) => String(page.docId) === id);
    const date = doc.date || dates.get(id) || '—';
    lines.push([id, doc.piece || 'outros', date, documentPageCount(pages), situation(doc, pages, items)].join(' | '));
  }
  return lines;
}

function gapLines(caseResult) {
  const lines = [];
  for (const gap of caseResult?.gaps ?? []) {
    const bits = [];
    if (gap.docId != null) bits.push(`Id ${gap.docId}`);
    if (gap.pageInDoc != null) bits.push(`pág. ${gap.pageInDoc}`);
    else if (gap.pdfPage != null) bits.push(`pág. PDF ${gap.pdfPage}`);
    else if (gap.page != null) bits.push(`pág. PDF ${gap.page}`);
    bits.push(gap.detail || 'ilegível');
    lines.push(`- ${bits.join(', ')}`);
  }
  return lines;
}

function passagesOf(caseResult) {
  return (caseResult?.pages ?? []).filter((page) => page.hasText && String(page.text ?? '').trim()).map((page) => ({
    tag: passageTag(page),
    text: String(page.text).trim(),
  }));
}

function chunkPassages(passages, maxChars) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const passage of passages) {
    const len = passage.tag.length + passage.text.length + 2;
    if (current.length && size + len > maxChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(passage);
    size += len;
  }
  if (current.length || !chunks.length) chunks.push(current);
  return chunks;
}

function yamlScalar(value) {
  const text = String(value ?? '');
  if (/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(text)) return text;
  return JSON.stringify(text);
}

function frontMatter(processo, parte, total) {
  return [
    '---',
    `formato: ${CASE_FORMAT}`,
    `processo: ${yamlScalar(processo)}`,
    `parte: ${parte}`,
    `total: ${total}`,
    `origem: ${CASE_ORIGIN}`,
    '---',
  ];
}

function renderPart(n, total, header, index, gaps, passages, processo, title) {
  const lines = [...frontMatter(processo, n, total), '', title];
  if (n === 1) {
    lines.push('', ...header, '', 'Índice', ...index, '', 'Lacunas', ...(gaps.length ? gaps : ['- nenhuma']));
  }
  lines.push('');
  if (!passages.length && n === 1) lines.push('Nenhum trecho com texto.');
  for (const passage of passages) lines.push(passage.tag, passage.text, '');
  return lines.join('\n').trim() + '\n';
}

export function renderCaseParts(caseResult, items = [], maxChars = PART_MAX_CHARS, meta = {}) {
  const processo = meta?.processo ?? '';
  const header = headerLines(caseResult, items);
  const index = indexLines(caseResult, items);
  const gaps = gapLines(caseResult);
  const chunks = chunkPassages(passagesOf(caseResult), maxChars);
  const total = chunks.length;
  const parts = chunks.map((passages, i) => ({
    n: i + 1,
    total,
    name: partFileName(i + 1, total),
    text: renderPart(i + 1, total, header, index, gaps, passages, processo, `Parte ${i + 1} de ${total}`),
  }));
  const allText = renderPart(1, 1, header, index, gaps, passagesOf(caseResult), processo, 'Caso completo');
  return { parts, allText };
}
