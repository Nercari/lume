// Small technical mocks of a PJe-like document list. They hold no legal content and no real
// identifiers: case numbers are TEST-CASE-* labels and document IDs are short codes.
import { doc, el } from './dom.js';

export const ORIGIN = 'https://pje1g.trf1.jus.br';
export const PAGE1 = `${ORIGIN}/pje/autos?p=1`;
export const PAGE2 = `${ORIGIN}/pje/autos?p=2`;

export const row = (id, attrs = {}, href = `/pje/doc?id=${id}`) =>
  el('tr', { class: 'documento', 'data-id': id, 'data-versao': '1', ...attrs }, href ? el('a', { class: 'abrir', href }, 'abrir') : 'sem link');

export const listPage = ({ caseNumber = 'TEST-CASE-A', rows, current = 1, total = 2, next = null, first = null }) =>
  doc(el('div', { id: 'autosDigitais' },
    el('span', { class: 'numero-processo' }, caseNumber),
    el('table', { id: 'listaDocumentos' }, ...rows),
    el('span', { class: 'paginacao' }, `Página ${current} de ${total}`),
    next ? el('a', { class: 'proxima', href: next }, 'próxima') : '',
    first ? el('a', { class: 'primeira', href: first }, 'primeira') : ''));

// Page 1: a document with an attachment, a sigilo-marked row (still read when linked). Page 2: unsupported, missing, failed, no link.
export const page1 = (over = {}) => listPage({
  rows: [
    row('D1', { 'data-paginas': '3' }),
    row('D1A', { 'data-tipo': 'anexo', 'data-pai': 'D1', 'data-paginas': '1' }),
    row('D2', { 'data-sigilo': '' }),
  ],
  next: '/pje/autos?p=2',
  ...over,
});
export const page2 = (over = {}) => listPage({
  current: 2,
  rows: [row('D3', { 'data-paginas': '10' }), row('D4'), row('D5'), row('D6'), row('D7', {}, null)],
  ...over,
});

export const loginPage = () => doc(el('form', { id: 'loginForm' }, el('input', { name: 'usuario' })));
export const unknownLayout = () => doc(el('div', { class: 'novo-layout' }, el('h1', {}, 'Outro sistema')));

// Fake transport. Returns per-URL responses and records every request it receives.
export function transport(overrides = {}) {
  const calls = [];
  const routes = {
    [PAGE1]: () => ({ status: 200, contentType: 'text/html', doc: page1() }),
    [PAGE2]: () => ({ status: 200, contentType: 'text/html', doc: page2() }),
    [`${ORIGIN}/pje/doc?id=D1`]: () => ({ status: 200, contentType: 'application/pdf', size: 1000 }),
    [`${ORIGIN}/pje/doc?id=D1A`]: () => ({ status: 200, contentType: 'application/pdf; charset=binary', size: 200 }),
    [`${ORIGIN}/pje/doc?id=D2`]: () => ({ status: 200, contentType: 'application/pdf', size: 400 }),
    [`${ORIGIN}/pje/doc?id=D3`]: () => ({ status: 200, contentType: 'text/html', doc: doc(el('p', {}, 'conteúdo técnico')) }),
    [`${ORIGIN}/pje/doc?id=D4`]: () => ({ status: 200, contentType: 'video/mp4', size: 5 }),
    [`${ORIGIN}/pje/doc?id=D5`]: () => ({ status: 404 }),
    [`${ORIGIN}/pje/doc?id=D6`]: () => ({ status: 500 }),
    ...overrides,
  };
  const fetchPage = async (url) => {
    calls.push(url);
    const r = routes[url];
    if (!r) throw new Error(`unexpected request ${url}`);
    return r(calls.length);
  };
  return { fetchPage, calls };
}
