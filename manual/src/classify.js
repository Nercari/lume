// Piece labels for a PJe document title or type. First match wins.
// Certidão is tested before intimação, embargos before recurso, ato ordinatório before despacho.
// A bare "tutela" or "liminar" is not a decisão: those words also name requests.
import { fold } from './rules.js';

export const PIECES = Object.freeze([
  'petição inicial',
  'contestação',
  'réplica',
  'decisão',
  'despacho',
  'sentença',
  'ato ordinatório',
  'certidão',
  'procuração',
  'documento de identificação',
  'laudo',
  'ofício',
  'manifestação',
  'recurso/apelação',
  'embargos',
  'intimação/citação',
  'outros',
]);

const rule = (id, piece, re) => Object.freeze({ id, piece, re });

export const PIECE_RULES = Object.freeze([
  rule('peticao_inicial', 'petição inicial', /\bpeticao\s+inicial\b|\bexordial\b/u),
  rule('contestacao', 'contestação', /\bcontestacao\b|\bresposta\s+d[oa]\s+reu\b|\bdefesa\b/u),
  rule('replica', 'réplica', /\breplica\b/u),
  rule('embargos', 'embargos', /\bembargos?\b/u),
  rule('recurso', 'recurso/apelação', /\bapelacao\b|\brecurso\b|\bagravo\b/u),
  rule('sentenca', 'sentença', /\bsentenca\b/u),
  rule('ato_ordinatorio', 'ato ordinatório', /\bato\s+ordinatorio\b/u),
  rule('decisao', 'decisão', /\bdecisao\b/u),
  rule('despacho', 'despacho', /\bdespacho\b/u),
  rule('certidao', 'certidão', /\bcertidao\b/u),
  rule('intimacao_citacao', 'intimação/citação', /\bintimacao\b|\bcitacao\b|\bmandado\s+de\s+(?:citacao|intimacao)\b/u),
  rule('procuracao', 'procuração', /\bprocuracao\b|\bsubstabelecimento\b/u),
  rule('identificacao', 'documento de identificação', /\bdocumento\s+de\s+identificacao\b|\bcarteira\s+de\s+identidade\b|\bcnh\b|\brg\b/u),
  rule('laudo', 'laudo', /\blaudo\b|\bpericia\b/u),
  rule('oficio', 'ofício', /\boficio\b/u),
  rule('manifestacao', 'manifestação', /\bmanifestacao\b|\bcontrarrazoes\b/u),
]);

const PIECE_SET = new Set(PIECES);
for (const item of PIECE_RULES) {
  if (!PIECE_SET.has(item.piece)) throw new Error(`piece rule ${item.id} is outside the taxonomy`);
}

export function classifyPiece(text) {
  const folded = fold(text);
  for (const item of PIECE_RULES) {
    if (item.re.test(folded)) return item.piece;
  }
  return 'outros';
}

const EXCELENTISSIMO = /\bexcelentissim[oa]\s+senhor\b.*\bjuiz\b/u;

export function classifyFromHeadings(lines) {
  const text = lines.map((line) => String(line ?? '').trim()).filter(Boolean).join('\n');
  if (!text) return { piece: 'outros', weak: false };
  if (EXCELENTISSIMO.test(fold(text))) {
    return { piece: 'petição inicial', weak: true };
  }
  const piece = classifyPiece(text);
  return { piece, weak: false };
}

export function documentTypeSource(doc) {
  if (doc.typeSource) return doc.typeSource;
  const signals = doc.signals ?? [];
  if (signals.includes('index') && doc.type) return 'index';
  if (signals.includes('outline') && doc.title) return 'outline';
  if (signals.includes('heading')) return 'heading';
  return 'none';
}
