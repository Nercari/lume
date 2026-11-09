// Aggregates for a private eval run. The writer may emit only these fields.
// Piece names are the fixed taxonomy. Counts are numbers. Labels are case-01, case-02, …
import { PIECES } from './classify.js';

const COUNT_KEYS = [
  'pages',
  'pagesWithTextPct',
  'pagesNeedingOcr',
  'documentsFound',
  'footerProvenanceCoveragePct',
  'timingMs',
];

const SIGNALS = ['footer', 'outline', 'index'];

export function labelFor(index) {
  return `case-${String(index + 1).padStart(2, '0')}`;
}

export function summarizeCase(label, result, timingMs) {
  const pages = result?.pages ?? [];
  const pageCount = pages.length;
  const withText = pages.filter((page) => page.hasText).length;
  const needingOcr = (result?.gaps ?? []).filter((gap) => gap.reason === 'unreadable_page').length;
  const signals = new Set();
  const pieceTypeCounts = {};
  for (const doc of result?.documents ?? []) {
    for (const signal of doc.signals ?? []) if (SIGNALS.includes(signal)) signals.add(signal);
    const piece = PIECES.includes(doc.piece) ? doc.piece : 'outros';
    pieceTypeCounts[piece] = (pieceTypeCounts[piece] ?? 0) + 1;
  }
  const withFooter = pages.filter((page) => page.footer?.docId).length;
  return {
    label,
    pages: pageCount,
    pagesWithTextPct: pageCount ? Math.round((100 * withText) / pageCount) : 0,
    pagesNeedingOcr: needingOcr,
    documentsFound: (result?.documents ?? []).length,
    signalsUsed: SIGNALS.filter((signal) => signals.has(signal)),
    pieceTypeCounts,
    footerProvenanceCoveragePct: pageCount ? Math.round((100 * withFooter) / pageCount) : 0,
    timingMs: Math.max(0, Math.round(Number(timingMs) || 0)),
    readable: !(result?.gaps ?? []).some((gap) => gap.reason === 'corrupt_file'),
  };
}

export function emptySummary(label, timingMs) {
  return summarizeCase(label, { pages: [], documents: [], gaps: [{ reason: 'corrupt_file' }] }, timingMs);
}

export function renderReportMarkdown(report) {
  const lines = [
    '# Relatório agregado',
    '',
    'Contagens por arquivo rotulado. Sem nomes, números de documento ou trechos.',
    '',
  ];
  for (const file of report.files) {
    const pieces = Object.entries(file.pieceTypeCounts).map(([piece, count]) => `${piece} ${count}`).join(', ') || 'nenhum';
    lines.push(
      `## ${file.label}`,
      '',
      `- Páginas: ${file.pages}`,
      `- Páginas com texto: ${file.pagesWithTextPct}%`,
      `- Páginas que precisam de OCR: ${file.pagesNeedingOcr}`,
      `- Documentos: ${file.documentsFound}`,
      `- Sinais: ${file.signalsUsed.join(', ') || 'nenhum'}`,
      `- Tipos: ${pieces}`,
      `- Cobertura de proveniência por rodapé: ${file.footerProvenanceCoveragePct}%`,
      `- Tempo: ${file.timingMs} ms`,
      `- Leitura: ${file.readable ? 'sim' : 'não'}`,
      '',
    );
  }
  return lines.join('\n');
}

export function countFieldValues(report) {
  const values = new Set();
  for (const file of report.files ?? []) {
    for (const key of COUNT_KEYS) values.add(String(file[key]));
    for (const count of Object.values(file.pieceTypeCounts ?? {})) values.add(String(count));
  }
  return values;
}
