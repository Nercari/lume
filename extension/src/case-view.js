// Full-case text for the PJe tab the ChatGPT side panel is reading.
// Document page and PDF page stay distinct. A missing document page is not filled in.

import { PART_MAX_CHARS } from './pack-bridge.js';

const HOSTS = new Set(['pje1g.trf1.jus.br', 'pje2g.trf1.jus.br']);

export function caseViewUrl(pageUrl, part = 1) {
  let url;
  try { url = new URL(pageUrl); } catch { return null; }
  if (url.protocol !== 'https:' || !HOSTS.has(url.hostname)) return null;
  url.hash = part > 1 ? `lume-autos/${part}` : 'lume-autos';
  return url.href;
}

export function passageTag(page) {
  const id = page?.docId ?? '';
  const docPage = page?.pageInDoc;
  const pdfPage = page?.pdfPage;
  const hasDoc = docPage != null && docPage !== '';
  const hasPdf = pdfPage != null && pdfPage !== '';
  if (hasDoc && hasPdf && Number(docPage) !== Number(pdfPage)) {
    return `[ID ${id}, pág. documento ${docPage}, pág. PDF ${pdfPage}]`;
  }
  if (hasDoc) return `[ID ${id}, pág. ${docPage}]`;
  if (hasPdf) return `[ID ${id}, pág. PDF ${pdfPage}]`;
  return `[ID ${id}]`;
}

function situation(docId, pages, items) {
  const item = (items ?? []).find((row) => String(row?.id) === String(docId));
  if (item?.state === 'restricted') return 'restrito';
  if (item?.state === 'missing') return 'ausente';
  if (!pages.length) {
    if (item?.state === 'failed' || item?.state === 'unsupported') return 'falhou';
    return 'ausente';
  }
  const readable = pages.filter((page) => page.hasText && String(page.text ?? '').trim());
  if (!readable.length) return 'ilegível';
  if (readable.length < pages.length) return 'parcial';
  return 'lido';
}

function indexLines(caseResult, items) {
  const lines = ['ID | Tipo | Data | Págs. | Situação'];
  const dates = new Map((items ?? []).filter((row) => row?.id != null).map((row) => [String(row.id), row.date || '—']));
  for (const doc of caseResult?.documents ?? []) {
    const id = String(doc.docId);
    const pages = (caseResult.pages ?? []).filter((page) => String(page.docId) === id);
    const pags = pages.length ? String(pages.length) : '—';
    lines.push([id, doc.piece || 'outros', dates.get(id) || '—', pags, situation(id, pages, items)].join(' | '));
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

function renderPart(n, total, index, gaps, passages) {
  const lines = [`Parte ${n} de ${total}`];
  if (n === 1) {
    lines.push('', 'Índice', ...index, '', 'Lacunas', ...(gaps.length ? gaps : ['- nenhuma']));
  }
  lines.push('');
  if (!passages.length && n === 1) lines.push('Nenhum trecho com texto.');
  for (const passage of passages) lines.push(passage.tag, passage.text, '');
  return lines.join('\n').trim() + '\n';
}

export function renderCaseParts(caseResult, items = [], maxChars = PART_MAX_CHARS) {
  const index = indexLines(caseResult, items);
  const gaps = gapLines(caseResult);
  const chunks = chunkPassages(passagesOf(caseResult), maxChars);
  const total = chunks.length;
  const parts = chunks.map((passages, i) => ({
    n: i + 1,
    total,
    text: renderPart(i + 1, total, index, gaps, passages),
  }));
  const allText = renderPart(1, 1, index, gaps, passagesOf(caseResult)).replace(/^Parte 1 de 1\n/, 'Caso completo\n');
  return { parts, allText };
}
