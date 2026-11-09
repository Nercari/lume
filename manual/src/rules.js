// Named, tolerant patterns for a merged PJe autos PDF.
// Wording varies by tribunal build; each rule accepts one signal, not a fixed sentence.
// Matching is accent-insensitive. Rules never keep a signer name.

export function fold(value) {
  return String(value ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function lastMatch(re, text) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const global = new RegExp(re.source, flags);
  let found = null;
  let match;
  while ((match = global.exec(text))) {
    found = match;
    if (match.index === global.lastIndex) global.lastIndex += 1;
  }
  return found;
}

// Bottom band of the page, where PJe prints the signature footer.
export const FOOTER_ZONE_RATIO = 0.22;

// "Num. 123 - Pág. 2", "Nº 123 – Pagina 2", and the same words without accents.
export const footerNumPag = {
  id: 'footer_num_pag',
  specific: true,
  re: /(?:num(?:ero)?\.?|n[oº°]\.?)\s*(\d{1,12})\s*[-–—]\s*pag(?:ina)?\.?\s*(\d{1,6})/iu,
};

// "Número do documento: …" — long PJe id (17–40 digits). Secondary to Num./Pág.
export const footerNumeroDocumento = {
  id: 'footer_numero_documento',
  specific: false,
  re: /numero\s+do\s+documento\s*[:\-]?\s*(\d{1,40})/iu,
};

// ".../ConsultaDocumento/listView.seam?x=…" — same long id in the URL query.
export const footerConsultaUrl = {
  id: 'footer_consulta_url',
  specific: true,
  re: /consultadocumento\/listview\.seam\?(?:[^ \n]*&)?x=(\d{1,40})/iu,
};

// Presence of an electronic-signature line. The name and the clock time are not kept.
export const footerAssinado = {
  id: 'footer_assinado',
  specific: false,
  re: /assinad[oa]\s+eletronicamente(?:\s+por\b)?/iu,
};

export const FOOTER_RULES = Object.freeze([
  footerNumPag,
  footerNumeroDocumento,
  footerConsultaUrl,
  footerAssinado,
]);

const DOC_NUMBER_RULES = new Set(['footer_numero_documento', 'footer_consulta_url']);

export function numPagMatches(text) {
  const folded = fold(text);
  const flags = footerNumPag.re.flags.includes('g') ? footerNumPag.re.flags : `${footerNumPag.re.flags}g`;
  const re = new RegExp(footerNumPag.re.source, flags);
  const out = [];
  let match;
  while ((match = re.exec(folded))) {
    out.push({ docId: match[1], pageInDoc: Number(match[2]) });
    if (match.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

export function applyFooterRules(text) {
  const folded = fold(text);
  const hits = [];
  for (const rule of FOOTER_RULES) {
    const match = lastMatch(rule.re, folded);
    if (!match) continue;
    const hit = { id: rule.id };
    if (rule.id === 'footer_num_pag') {
      hit.docId = match[1];
      hit.pageInDoc = Number(match[2]);
    } else if (DOC_NUMBER_RULES.has(rule.id)) {
      hit.docNumber = match[1];
    }
    hits.push(hit);
  }
  return hits;
}

function buildFooter(zoneHits, fullText) {
  const numPag = numPagMatches(fullText);
  const docNumbers = zoneHits.filter((hit) => hit.docNumber).map((hit) => hit.docNumber);
  const rules = zoneHits.map((hit) => hit.id);
  if (numPag.length && !rules.includes('footer_num_pag')) rules.push('footer_num_pag');

  let docId = null;
  let pageInDoc = null;
  let conflict = false;
  if (numPag.length) {
    const preferred = numPag[numPag.length - 1];
    docId = preferred.docId;
    pageInDoc = preferred.pageInDoc ?? null;
    if (new Set(numPag.map((hit) => hit.docId)).size > 1) conflict = true;
  } else if (docNumbers.length && new Set(docNumbers).size > 1) {
    conflict = true;
  }

  const docNumber = docNumbers.length ? docNumbers[docNumbers.length - 1] : null;
  if (!docId && !docNumber && !conflict) return null;

  return { docId, pageInDoc, docNumber, rules, conflict };
}

// Num./Pág. is authoritative for docId and pageInDoc. Long ids stay in docNumber only.
export function footerFromHits(hits, sourceText = '') {
  return buildFooter(hits, sourceText || '');
}

export function matchFooterText(text) {
  return buildFooter(applyFooterRules(text), text);
}

// Header row of the autos index: Id, Data, Documento/Tipo, in any separator style.
export function isIndexHeader(line) {
  const folded = fold(line).replace(/[|/.:;-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!folded || folded.length > 60) return false;
  const words = folded.split(' ');
  if (words.length > 8) return false;
  const has = (word) => words.includes(word);
  const hasId = has('id');
  const hasDoc = has('documento') || words.some((word) => word.startsWith('documento'));
  const hasTipo = has('tipo');
  const hasData = has('data');
  const groups = [hasId, hasData, hasDoc || hasTipo].filter(Boolean).length;
  return hasId && (hasDoc || hasTipo) && groups >= 2;
}

export const indexHeader = Object.freeze({ id: 'index_header', test: isIndexHeader });

function splitTitle(rest) {
  const parts = rest.split(/\s*\/\s*/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length || parts[0].length < 2) return null;
  return {
    title: parts[0],
    type: parts.length > 1 ? parts.slice(1).join(' / ') : parts[0],
  };
}

// "1001 01/02/2020 Peticao Inicial" or "1001 01/02/2020 Peticao / Inicial".
export function parseIndexRowDated(line) {
  const match = /^(\d{1,12})\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)$/u.exec(String(line).trim());
  if (!match) return null;
  const split = splitTitle(match[3]);
  if (!split) return null;
  return { rule: 'index_row_dated', docId: match[1], date: match[2], ...split };
}

export const indexRowDated = Object.freeze({ id: 'index_row_dated', parse: parseIndexRowDated });

// Same row when the date column is absent. Only used after a header, by the caller.
export function parseIndexRowIdTitle(line) {
  const match = /^(\d{1,12})\s+(\p{L}.+)$/u.exec(String(line).trim());
  if (!match) return null;
  const split = splitTitle(match[2]);
  if (!split) return null;
  return { rule: 'index_row_id_title', docId: match[1], date: null, ...split };
}

export const indexRowIdTitle = Object.freeze({ id: 'index_row_id_title', parse: parseIndexRowIdTitle });

export function parseIndexRow(line) {
  return parseIndexRowDated(line) ?? parseIndexRowIdTitle(line);
}

// "1001 - Peticao Inicial"
export function parseOutlineIdPrefix(title) {
  const match = /^(\d{1,12})\s*[-–—|:]\s*(.+)$/u.exec(String(title).trim());
  if (!match || match[2].trim().length < 2) return null;
  return { rule: 'outline_id_prefix', docId: match[1], title: match[2].trim() };
}

export const outlineIdPrefix = Object.freeze({ id: 'outline_id_prefix', parse: parseOutlineIdPrefix });

// "Peticao Inicial - 1001"
export function parseOutlineIdSuffix(title) {
  const match = /^(.+?)\s*[-–—]\s*(\d{1,12})$/u.exec(String(title).trim());
  if (!match || match[1].trim().length < 2) return null;
  return { rule: 'outline_id_suffix', docId: match[2], title: match[1].trim() };
}

export const outlineIdSuffix = Object.freeze({ id: 'outline_id_suffix', parse: parseOutlineIdSuffix });

export function parseOutlineTitle(title) {
  const raw = String(title ?? '').trim();
  if (!raw) return null;
  return parseOutlineIdPrefix(raw)
    ?? parseOutlineIdSuffix(raw)
    ?? { rule: 'outline_title', docId: null, title: raw };
}

export const outlineTitle = Object.freeze({
  id: 'outline_title',
  parse: (title) => {
    const parsed = parseOutlineTitle(title);
    return parsed?.rule === 'outline_title' ? parsed : null;
  },
});

export function headingLinesFromPage(lines, pageHeight, limit = 5) {
  const hasY = lines.some((line) => typeof line.y === 'number') && pageHeight > 0;
  const body = hasY
    ? lines.filter((line) => typeof line.y === 'number' && line.y > pageHeight * FOOTER_ZONE_RATIO)
    : lines.slice(0, Math.max(limit * 2, 12));
  const ordered = hasY ? [...body].sort((a, b) => b.y - a.y) : body;
  return ordered.map((line) => line.text).filter(Boolean).slice(0, limit);
}

// Footer band first. Distinctive id patterns may also appear in the reading order
// when the extractor did not place them in the band.
export function matchPageFooter(lines, pageHeight) {
  const texts = lines.map((line) => line.text).filter(Boolean);
  if (!texts.length) return null;
  const hasY = lines.some((line) => typeof line.y === 'number') && pageHeight > 0;
  const zone = hasY
    ? lines.filter((line) => typeof line.y === 'number' && line.y <= pageHeight * FOOTER_ZONE_RATIO).map((line) => line.text)
    : texts.slice(-8);
  const zoneText = zone.join('\n');
  const fullText = texts.join('\n');
  return buildFooter(applyFooterRules(zoneText), fullText);
}
