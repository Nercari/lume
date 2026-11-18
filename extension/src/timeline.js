// Timeline helpers for listAutosDigitais. Ids come from the row, the onclick
// argument, or the document URL. Nothing here invents a page number.

import { matchUrlRule } from './url-rules.js';

const SKIP_CALL = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return']);

export function idFromOnclick(value) {
  const src = String(value ?? '');
  const re = /([A-Za-z_$][\w$]*)\s*\(\s*(?:['"]([^'"]{1,40})['"]|(\d{1,12}))/g;
  let match = re.exec(src);
  while (match) {
    const name = match[1];
    const id = match[2] || match[3];
    if (name && !SKIP_CALL.has(name) && id && /^[A-Za-z0-9_-]{1,40}$/.test(id)) return id;
    match = re.exec(src);
  }
  return null;
}

export function onclickFunctionNames(value) {
  const src = String(value ?? '');
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  const names = [];
  let match = re.exec(src);
  while (match) {
    const name = match[1];
    if (name && !SKIP_CALL.has(name) && !names.includes(name)) names.push(name);
    match = re.exec(src);
  }
  return names.slice(0, 20);
}

export function idFromDocumentUrl(href) {
  let url;
  try { url = new URL(href, 'https://pje.invalid'); } catch { return null; }
  if (matchUrlRule(url.href)?.kind !== 'document') return null;
  const path = url.pathname.match(/\/documento\/download\/([^/]+)$/i);
  if (path) {
    try { return decodeURIComponent(path[1]); } catch { return path[1]; }
  }
  for (const [key, value] of url.searchParams) {
    if (['id', 'iddocumento', 'idbinario'].includes(key.toLowerCase()) && value) return value.slice(0, 40);
  }
  return null;
}

export function urlFromTemplate(template, id, base) {
  if (typeof template !== 'string' || !template.includes('{id}')) return null;
  if (/javascript:|https?:/i.test(template)) return null;
  const path = template.replaceAll('{id}', encodeURIComponent(id));
  try { return new URL(path, base).href; } catch { return null; }
}

export function dateToken(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
}

export function counterPattern(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length > 20) return null;
  if (/^\d+\s+de\s+\d+$/i.test(text)) return 'N de N';
  if (/^\d+\s+of\s+\d+$/i.test(text)) return 'N of N';
  if (/^\d+\s*\/\s*\d+$/.test(text)) return 'N / N';
  return null;
}
