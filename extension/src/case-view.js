// Full-case text for the PJe tab and the part files. Document page, PDF page,
// and id stay distinct. A missing page is omitted. It is never estimated.

import { PIECES } from '../../manual/src/classify.js';

export const PART_MAX_CHARS = 350000;
export const CASE_FORMAT = 'lume-caso/1';
export const CASE_ORIGIN = 'botao';

const HOSTS = new Set(['pje1g.trf1.jus.br', 'pje2g.trf1.jus.br']);
const PIECE_SET = new Set(PIECES);

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

function knownPage(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function passageTag(page) {
  const id = page?.docId ?? '';
  const docPage = knownPage(page?.pageInDoc);
  const pdfPage = knownPage(page?.pdfPage);
  if (docPage != null && pdfPage != null) return `[ID ${id}, pág. ${docPage}, pág. PDF ${pdfPage}]`;
  if (docPage != null) return `[ID ${id}, pág. ${docPage}]`;
  if (pdfPage != null) return `[ID ${id}, pág. PDF ${pdfPage}]`;
  return `[ID ${id}]`;
}

function isoDate(value) {
  const text = String(value ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) return '—';
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function stamp(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value)) return value;
  const date = value ? new Date(value) : new Date();
  const when = Number.isNaN(date.getTime()) ? new Date() : date;
  return when.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function tipoOf(piece) {
  return PIECE_SET.has(piece) ? piece : 'outros';
}

function pageList(pages) {
  const nums = [...new Set((pages ?? []).map((page) => knownPage(page.pageInDoc)).filter((n) => n != null))].sort((a, b) => a - b);
  if (!nums.length) return '—';
  const bits = [];
  let start = nums[0];
  let prev = nums[0];
  for (let i = 1; i <= nums.length; i += 1) {
    const n = nums[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    bits.push(start === prev ? String(start) : `${start}-${prev}`);
    start = n;
    prev = n;
  }
  return bits.join(', ');
}

function expandPages(cell) {
  if (cell === '—') return [];
  const pages = [];
  for (const token of cell.split(',').map((item) => item.trim())) {
    const range = /^(\d+)-(\d+)$/.exec(token);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n += 1) pages.push(n);
    } else pages.push(Number(token));
  }
  return pages;
}

function reasonOf(gap, items) {
  const detail = String(gap?.detail || '');
  if (detail === 'imagem sem texto') return 'imagem_sem_texto';
  const item = (items ?? []).find((row) => String(row?.id) === String(gap?.docId));
  const reason = String(gap?.reason || '');
  const paged = knownPage(gap?.pageInDoc) != null || knownPage(gap?.pdfPage) != null;
  if (!paged && (item?.state === 'unsupported' || reason === 'corrupt_file' || reason === 'unsupported')) return 'binario';
  if (!paged && item && item.state !== 'processed') return 'falha_busca';
  if (reason === 'corrupt_file' || reason === 'unsupported') return 'binario';
  if (['restricted', 'missing', 'failed', 'network', 'http', 'no_url_rule', 'empty'].includes(reason)) return 'falha_busca';
  return 'ilegivel';
}

function gapLine(gap, items) {
  const id = gap?.docId ?? '';
  const bits = [`ID ${id}`];
  const docPage = knownPage(gap?.pageInDoc);
  const pdfPage = knownPage(gap?.pdfPage);
  if (docPage != null) bits.push(`pág. ${docPage}`);
  if (pdfPage != null) bits.push(`pág. PDF ${pdfPage}`);
  return `- ${bits.join(', ')}: ${reasonOf(gap, items)}`;
}

function situationOf(doc, pages, gaps, items) {
  const id = String(doc?.docId);
  const readable = (pages ?? []).filter((page) => page.hasText && String(page.text ?? '').trim());
  const own = (gaps ?? []).filter((gap) => String(gap.docId) === id);
  if (readable.length && own.length) return 'parcial';
  if (readable.length) return 'lido';
  const item = (items ?? []).find((row) => String(row?.id) === id);
  if (item?.state === 'restricted') return 'restrito';
  if (item?.state === 'missing') return 'ausente';
  if (item?.state === 'failed') return 'falhou';
  return 'ilegível';
}

function passagesOf(caseResult) {
  return (caseResult?.pages ?? []).filter((page) => page.hasText && String(page.text ?? '').trim()).map((page) => ({
    docId: String(page.docId),
    tag: passageTag(page),
    text: String(page.text).trim(),
    pdfPage: knownPage(page.pdfPage),
  }));
}

function chunkDocs(blocks, maxChars) {
  const budget = maxChars > 10000 ? maxChars - 4000 : maxChars;
  const chunks = [];
  let current = [];
  let size = 0;
  for (const block of blocks) {
    if (current.length && size + block.size > budget) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(block);
    size += block.size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function scalar(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').trim() || '—';
}

export function renderCaseParts(caseResult, items = [], maxChars = PART_MAX_CHARS, meta = {}) {
  const processo = scalar(meta?.processo);
  const orgao = scalar(meta?.orgao);
  const geradoEm = stamp(meta?.geradoEm);
  const origem = meta?.origem === 'work' ? 'work' : CASE_ORIGIN;
  const documents = caseResult?.documents ?? [];
  const pages = caseResult?.pages ?? [];
  const gaps = caseResult?.gaps ?? [];
  const passages = passagesOf(caseResult);
  const rows = documents.map((doc) => {
    const id = String(doc.docId);
    const ownPages = pages.filter((page) => String(page.docId) === id);
    const date = isoDate(doc.date || (items ?? []).find((row) => String(row?.id) === id)?.date);
    return {
      id,
      tipo: tipoOf(doc.piece),
      data: date,
      paginas: pageList(ownPages),
      situacao: situationOf(doc, ownPages, gaps, items),
    };
  });
  const gapLines = gaps.map((gap) => gapLine(gap, items));
  const blocks = rows.map((row) => {
    const own = passages.filter((passage) => passage.docId === row.id);
    const size = own.reduce((sum, passage) => sum + passage.tag.length + passage.text.length + 2, 0) || 1;
    return { id: row.id, passages: own, size };
  });
  const chunks = chunkDocs(blocks, maxChars);
  const used = chunks.length ? chunks : [];
  const partTotal = used.length;
  const trechos = passages.length;
  const lacunas = gapLines.length;
  const counts = `${rows.length} documentos, ${trechos} trechos, ${lacunas} lacunas`;
  const header = {
    processo,
    orgao,
    geradoEm,
    origem,
    contagens: counts,
  };
  const head = [
    CASE_FORMAT,
    `Processo: ${processo}`,
    `Órgão: ${orgao}`,
    `Gerado em: ${geradoEm}`,
    `Origem: ${origem}`,
    `Contagens: ${counts}`,
  ];

  function bodyOf(n, ids, ownPassages) {
    const lines = [...head, '', `Parte ${n} de ${partTotal}`, `Ids: ${ids.join(', ')}`, ''];
    if (n === 1) {
      lines.push('Índice', 'ID | Tipo | Data | Págs. do documento | Situação');
      for (const row of rows) lines.push([row.id, row.tipo, row.data, row.paginas, row.situacao].join(' | '));
      lines.push('', 'Lacunas', ...(gapLines.length ? gapLines : ['- nenhuma']), '');
    }
    for (const passage of ownPassages) lines.push(passage.tag, passage.text, '');
    return lines.join('\n').replace(/\n+$/, '');
  }

  const parts = used.map((chunk, index) => {
    const n = index + 1;
    const ids = chunk.map((block) => block.id);
    const ownPassages = chunk.flatMap((block) => block.passages);
    const body = bodyOf(n, ids, ownPassages);
    const front = [
      '---',
      `formato: ${CASE_FORMAT}`,
      `processo: ${processo}`,
      `parte: ${n}`,
      `total: ${partTotal}`,
      `ids: ${ids.join(', ')}`,
      `origem: ${origem}`,
      '---',
    ].join('\n');
    return {
      n,
      total: partTotal,
      name: partFileName(n, partTotal),
      ids,
      body,
      text: `${front}\n${body}\n`,
      header,
    };
  });
  const allText = parts.map((part) => part.body).join('\n\n');
  const tags = passages;
  const sidecar = {
    formato: CASE_FORMAT,
    processo,
    orgao,
    geradoEm,
    origem,
    ocr: pages.some((page) => page.method === 'ocr') ? 'local' : 'nenhum',
    documents: rows.map((row) => ({
      id: row.id,
      tipo: row.tipo,
      data: row.data === '—' ? null : row.data,
      paginasDocumento: expandPages(row.paginas),
      paginasPdf: [...new Set([
        ...tags.filter((tag) => tag.docId === row.id && tag.pdfPage != null).map((tag) => tag.pdfPage),
        ...gaps.filter((gap) => String(gap.docId) === row.id && knownPage(gap.pdfPage) != null).map((gap) => knownPage(gap.pdfPage)),
      ])].sort((a, b) => a - b),
      situacao: row.situacao,
    })),
    parts: parts.map((part) => ({ parte: part.n, total: part.total, arquivo: part.name, ids: part.ids })),
    gaps: gaps.map((gap) => ({
      id: String(gap.docId ?? ''),
      reason: reasonOf(gap, items),
      paginaDocumento: knownPage(gap.pageInDoc),
      paginaPdf: knownPage(gap.pdfPage),
    })),
  };
  return { parts, allText, header, sidecar, documents: rows.length, gaps: lacunas };
}
