// Portuguese paste package for the user's own ChatGPT session.
// Instructions follow the default drafting method one for one. The last method
// rule forbids bracket citations because the source panel holds them. Manual mode
// has no source panel, so that rule is replaced by [Id <docId>, p. <n>].

export const ADAPTED_INSTRUCTIONS = Object.freeze([
  'Use apenas os fatos do bloco de evidências do processo. Um bloco de estilo, se alguém o colar junto, mostra só tom e estrutura: nunca tire dele um fato, nome, número ou data.',
  'Afirme um fato decisivo ou uma conclusão jurídica somente quando o texto do processo o sustentar, e cite a passagem no formato exigido abaixo.',
  'Siga a ordem das seções do tipo de peça. Não deixe seção vazia.',
  'Trate cada contradição indicada no pedido e não a deixe de fora.',
  'Sem um resultado pedido, proponha a conclusão que as evidências sustentam, com o raciocínio e as passagens em que ela se apoia.',
  'Com um resultado pedido, mantenha a evidência contrária no raciocínio e diga onde ela é incompatível com o resultado. Não a omita nem a suavize.',
  'Cite cada fato decisivo exatamente como [Id <docId>, p. <n>]. O n é a página dentro desse documento, a mesma do marcador [Id …, p. …] no arquivo. Não invente id nem página. Não use outra forma de citação.',
]);

export const DOC_TYPE_OPTIONS = Object.freeze([
  { id: 'sentenca', label: 'Sentença', sections: ['Relatório', 'Fundamentação', 'Dispositivo'] },
  { id: 'decisao', label: 'Decisão interlocutória', sections: ['Relatório', 'Fundamentação', 'Dispositivo'] },
  { id: 'despacho', label: 'Despacho', sections: ['Determinação'] },
]);

const DEFAULT_CHAR_LIMIT = 24_000;

export function inferManualDocType(request = '') {
  const folded = String(request).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (/\bsentenca\b/.test(folded)) return 'sentenca';
  if (/\bdespacho\b/.test(folded)) return 'despacho';
  if (/\bdecisao\b/.test(folded)) return 'decisao';
  return 'decisao';
}

export function resolveDocType(docType, request) {
  if (DOC_TYPE_OPTIONS.some((option) => option.id === docType)) return docType;
  return inferManualDocType(request);
}

export function gapsSummaryOf(caseResult) {
  const gaps = caseResult?.gaps ?? [];
  const lines = [];
  if (gaps.some((gap) => gap.reason === 'corrupt_file')) {
    lines.push('O arquivo PDF não pôde ser lido.');
  }
  const unread = gaps.filter((gap) => gap.reason === 'unreadable_page');
  if (!unread.length) lines.push('Nenhuma página precisa de OCR.');
  else {
    const where = unread.map((gap) => gap.page).filter((page) => page != null).join(', ');
    lines.push(`${unread.length} página(s) sem texto (precisa OCR): ${where} do PDF. O texto dessas páginas não entrou no arquivo. Não invente o conteúdo.`);
  }
  if (gaps.some((gap) => gap.reason === 'no_document_signal')) {
    lines.push('Parte do PDF não trouxe rodapé, marcador nem índice. Esses trechos ficam no documento sem-sinal.');
  }
  const conflicts = gaps.filter((gap) => gap.reason === 'footer_id_conflict');
  if (conflicts.length) {
    lines.push(`Em ${conflicts.length} página(s) as regras de rodapé divergiram. Vale o id da regra Num./Pág.`);
  }
  const unplaced = gaps.filter((gap) => gap.reason === 'index_unplaced').length;
  if (unplaced) lines.push(`O índice lista ${unplaced} id(s) sem páginas neste PDF.`);
  return lines.join('\n');
}

function renderCaseFile(caseResult) {
  const blocks = ['Arquivo do processo, texto local. Cada passagem está marcada com o id e a página dentro do documento.'];
  const passages = (caseResult?.passages ?? []).filter((passage) => passage.hasText && String(passage.text ?? '').trim());
  if (!passages.length) blocks.push('Nenhuma passagem com texto.');
  for (const passage of passages) {
    blocks.push(`[Id ${passage.docId}, p. ${passage.pageInDoc}]\nid: ${passage.id}\npágina do PDF: ${passage.pdfPage}\n${String(passage.text).trim()}`);
  }
  return blocks.join('\n\n');
}

export function splitParts(text, charLimit = DEFAULT_CHAR_LIMIT) {
  const limit = Number(charLimit);
  if (!Number.isInteger(limit) || limit < 500) throw new RangeError('charLimit must be an integer of at least 500');
  const source = String(text ?? '');
  if (source.length <= limit) return [source];
  const parts = [];
  let start = 0;
  while (start < source.length) {
    if (source.length - start <= limit) {
      parts.push(source.slice(start));
      break;
    }
    let cut = start + limit;
    const breakAt = source.slice(start, cut).lastIndexOf('\n\n[');
    if (breakAt > limit * 0.4) cut = start + breakAt;
    parts.push(source.slice(start, cut));
    start = cut;
  }
  return parts;
}

export function buildChatGPTPackage(caseResult, { docType, request = '', charLimit = DEFAULT_CHAR_LIMIT } = {}) {
  const chosen = resolveDocType(docType, request);
  const spec = DOC_TYPE_OPTIONS.find((option) => option.id === chosen);
  const gapsSummary = gapsSummaryOf(caseResult);
  const asked = String(request).trim();
  const prompt = [
    'Modo manual do Lume. Este pacote foi montado neste computador. Nada aqui chama a API, usa token ou envia o processo a um servidor do Lume.',
    'Responda em português. Use só o arquivo do processo e o que estiver neste prompt.',
    '',
    `Tipo de peça: ${spec.label}.`,
    `Seções, nesta ordem: ${spec.sections.join('; ')}.`,
    asked ? `Pedido: ${asked}` : 'Pedido: não informado.',
    '',
    'Instruções do método padrão, adaptadas para citação manual:',
    ...ADAPTED_INSTRUCTIONS.map((line, index) => `${index + 1}. ${line}`),
    '',
    'Forma da citação: [Id <docId>, p. <n>]. Exemplo: [Id 1001, p. 2]. O n é a página dentro do documento, não a página solta do arquivo PDF.',
    '',
    'Lacunas conhecidas:',
    gapsSummary,
  ].join('\n');
  const caseFile = renderCaseFile(caseResult);
  return { prompt, caseFile, parts: splitParts(caseFile, charLimit), gapsSummary };
}
