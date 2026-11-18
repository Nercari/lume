// Synthetic PJe+R exports. Ids, names and the CNJ are invented.
export const SYNTHETIC_CNJ = '0000001-00.2024.4.01.0000';
export const SEPARATOR = '-'.repeat(72);

const FIELD_SETS = [
  ['Petição Inicial', 'Parte Autora Fictícia'],
  ['10', 'Contestação', 'Réu Fictício'],
  ['Anexo', 'Terceiro Fictício'],
  ['Sentença', 'Juízo Fictício'],
  ['Despacho', 'Parte Autora Fictícia'],
  ['Laudo', 'Perito Fictício'],
  ['Certidão', 'Cartório Fictício'],
  ['Ofício', 'Órgão Fictício'],
];

export function juntadaLine({
  processNumber = SYNTHETIC_CNJ,
  when = '01/02/2024 10:00:00',
  signer = 'Fulano Fictício',
  bodyId,
} = {}) {
  return [
    'Seção Judiciária Fictícia Xª Vara Federal (Xº Juizado) e cartório fictício.',
    `O documento a seguir foi juntado aos autos do processo de número ${processNumber} em ${when} por ${signer}.`,
    `Documento assinado por: - ${signer}`,
    'Consulte este documento em: https://pje.example.invalid/consulta usando o código: 00000000000000000000000000000.',
    `ID do documento: ${bodyId}`,
  ].join(' ');
}

export function scatterNuls(text) {
  let out = '';
  for (let index = 0; index < text.length; index += 1) {
    out += text[index];
    if (index % 2 === 1) out += '\u0000';
  }
  return out;
}

export function controlBlob(token = '') {
  return `${token}${'\u0001'.repeat(24)}${'A'.repeat(40)}`;
}

export function symbolBlob(token = '') {
  return `${token}${'$'.repeat(64)}`;
}

function expectedPages(piece) {
  const raw = piece.raw ?? [];
  if (piece.paginated) {
    return raw.map((page, index) => ({
      pageInDoc: index + 1,
      text: piece.gap ? '' : String(page ?? '').replaceAll('\u0000', '').trim(),
    }));
  }
  return [{
    pageInDoc: null,
    text: piece.gap ? '' : raw.join('\n').replaceAll('\u0000', '').trim(),
  }];
}

export function makePjeExport({ processNumber = SYNTHETIC_CNJ, pieces, lineEnding = '\n' } = {}) {
  const lines = [`Processo: ${processNumber}`, ''];
  const expected = [];
  for (const piece of pieces) {
    const fields = piece.fields ?? [];
    lines.push(`Documento: ${piece.id} - ${fields.join(' - ')}`);
    if (piece.juntada !== false) {
      lines.push(juntadaLine({
        processNumber,
        when: piece.when,
        signer: piece.signer,
        bodyId: piece.bodyId ?? piece.id,
      }));
    }
    const raw = piece.raw ?? [];
    if (piece.paginated) {
      raw.forEach((page, index) => {
        const text = String(page ?? '').trim();
        lines.push(`Página ${index + 1} de ${raw.length}${text ? ` ${text}` : ''}`);
      });
    } else {
      lines.push(...raw);
    }
    lines.push(SEPARATOR);
    expected.push({ id: piece.id, pages: expectedPages(piece) });
  }
  return {
    text: lines.join(lineEnding),
    expected,
    processNumber,
    headers: pieces.length,
  };
}

export function makeForty() {
  const pieces = [];
  const kinds = ['empty', 'control', 'symbol', 'nul', 'pages', 'plain'];
  for (let index = 0; index < 40; index += 1) {
    const id = String(100000001 + index);
    const kind = kinds[index % kinds.length];
    const piece = {
      id,
      fields: FIELD_SETS[index % FIELD_SETS.length],
      signer: 'Fulano Fictício',
    };
    if (index === 7) piece.bodyId = '100000099';
    if (index === 11) piece.juntada = false;
    if (kind === 'empty') {
      piece.raw = [];
      piece.gap = 'image';
    } else if (kind === 'control') {
      piece.raw = [controlBlob(`CTL${id}`)];
      piece.gap = 'binary';
    } else if (kind === 'symbol') {
      piece.raw = [symbolBlob(`SYM${id}`)];
      piece.gap = 'binary';
    } else if (kind === 'nul') {
      const clean = `Texto sintetico da peca ${id} com nulos espalhados no corpo ficticio.`;
      piece.raw = [scatterNuls(clean)];
    } else if (kind === 'pages') {
      piece.paginated = true;
      piece.raw = [
        `Texto da primeira folha da peca ${id}.`,
        `Texto da segunda folha da peca ${id}.`,
        `Texto da terceira folha da peca ${id}.`,
      ];
    } else {
      piece.raw = [
        `Texto corrido da peca ${id}, longo o bastante para nao ser lacuna.`,
        'Num. 9999 - Pág. 1 permanece no corpo.',
        'ID do documento: 888888888 tambem permanece.',
      ];
    }
    pieces.push(piece);
  }
  return makePjeExport({ pieces });
}

export function makeLarge(count = 300) {
  const body = `${'Texto sintetico da peca ficticia. '.repeat(340)}`;
  const pieces = [];
  for (let index = 0; index < count; index += 1) {
    const id = String(200000001 + index);
    const fields = index % 2 === 0
      ? ['Petição Inicial', 'Parte Autora Fictícia']
      : ['10', 'Contestação', 'Réu Fictício'];
    if (index % 30 === 0) pieces.push({ id, fields, raw: [], gap: 'image' });
    else if (index % 30 === 1) pieces.push({ id, fields, raw: [controlBlob()], gap: 'binary' });
    else pieces.push({ id, fields, raw: [body] });
  }
  return makePjeExport({ pieces });
}
