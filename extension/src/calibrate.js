// Structure-only snapshot of a PJe page. No text, no field values, no query values.
import { sanitizeClassToken, sanitizeHref, sanitizeId, sanitizeToken, scrubTree, sizeBucket, urlPattern } from './sanitize.js';

export const MAX_SNAPSHOT_NODES = 5000;
const ALLOW_VALUE = new Set(['role', 'type', 'href']);

export function frameDocument(el) {
  try { return el?.contentDocument || null; } catch { return null; }
}

export function sameOriginDocuments(root) {
  const out = [];
  const seen = new Set();
  const visit = (doc) => {
    if (!doc || seen.has(doc)) return;
    seen.add(doc);
    out.push(doc);
    let frames = [];
    try { frames = Array.from(doc.querySelectorAll('iframe')); } catch { frames = []; }
    for (const frame of frames) {
      const child = frameDocument(frame);
      if (child) visit(child);
    }
  };
  visit(root);
  return out;
}

const tagOf = (el) => String(el.tagName || el.tag || '').toLowerCase();
const isDocument = (el) => el?.nodeType === 9 || tagOf(el) === '#document' || tagOf(el) === 'document';

function elementsOf(node) {
  if (!node) return [];
  const list = node.children;
  const arr = list && typeof list.length === 'number' ? [...list] : [];
  return arr.filter((c) => c && typeof c === 'object' && (c.tagName || c.tag) && !isDocument(c));
}

function attr(el, name) {
  try {
    if (typeof el.getAttribute === 'function') return el.getAttribute(name);
  } catch { /* a cross-origin edge: skip the value */ }
  return null;
}

function attrNames(el) {
  try {
    if (el.attributes && typeof el.attributes.length === 'number' && !Array.isArray(el.attributes)) {
      return [...el.attributes].map((a) => a.name);
    }
  } catch { /* ignore */ }
  return Object.keys(el.attrs ?? {});
}

function classesOf(el) {
  try {
    if (el.classList && typeof el.classList.forEach === 'function') return [...el.classList];
  } catch { /* ignore */ }
  return String(attr(el, 'class') ?? '').split(/\s+/).filter(Boolean);
}

function countRows(table) {
  let n = 0;
  const walk = (el, nested) => {
    for (const c of elementsOf(el)) {
      const t = tagOf(c);
      if (t === 'table') { walk(c, true); continue; }
      if (t === 'tr' && !nested) n++;
      walk(c, nested);
    }
  };
  walk(table, false);
  return n;
}

function record(el, depth) {
  const names = attrNames(el).map((name) => sanitizeToken(name)).filter(Boolean).slice(0, 50).sort();
  const values = {};
  for (const name of names) {
    if (!ALLOW_VALUE.has(name)) continue;
    const raw = attr(el, name);
    if (name === 'href') {
      const href = sanitizeHref(raw);
      if (href) values.href = href;
    } else {
      const token = sanitizeToken(raw);
      if (token) values[name] = token;
    }
  }
  const id = sanitizeId(attr(el, 'id'));
  return {
    tag: tagOf(el),
    id,
    class: classesOf(el).map(sanitizeClassToken).filter(Boolean).slice(0, 40),
    attrs: names,
    values,
    childCount: elementsOf(el).length,
    depth,
  };
}

export function snapshotDocument(root, opts = {}) {
  const max = opts.maxNodes ?? MAX_SNAPSHOT_NODES;
  const state = {
    max,
    nodes: 0,
    truncated: false,
    seen: new Set(),
    counts: { tables: 0, rows: 0, links: 0, iframes: 0 },
    tables: [],
    frames: [],
  };
  const walkElement = (el, depth, frame) => {
    if (state.nodes >= max) { state.truncated = true; return; }
    const tag = tagOf(el);
    state.nodes++;
    const node = record(el, depth);
    frame.nodes.push(node);
    if (tag === 'table') {
      state.counts.tables++;
      state.tables.push({ id: node.id, rows: countRows(el), frame: state.frames.indexOf(frame) });
    } else if (tag === 'tr') state.counts.rows++;
    else if (tag === 'a') state.counts.links++;
    let opened = null;
    if (tag === 'iframe') {
      state.counts.iframes++;
      opened = frameDocument(el);
      if (opened) walkFrame(opened);
      else state.frames.push({ accessible: false, nodes: [] });
    }
    if (tag === 'iframe' && opened) return;
    let shadow = null;
    try { shadow = el.shadowRoot || null; } catch { shadow = null; }
    const kids = elementsOf(el);
    if (shadow) kids.push(...elementsOf(shadow));
    for (const child of kids) {
      if (state.truncated || state.nodes >= max) { state.truncated = true; return; }
      walkElement(child, depth + 1, frame);
    }
  };
  const walkFrame = (doc) => {
    if (!doc || state.seen.has(doc)) return;
    state.seen.add(doc);
    const frame = { accessible: true, nodes: [] };
    state.frames.push(frame);
    const roots = isDocument(doc) ? elementsOf(doc) : [doc];
    for (const el of roots) {
      if (state.truncated || state.nodes >= max) { state.truncated = true; return; }
      walkElement(el, 0, frame);
    }
  };
  walkFrame(root);
  return scrubTree({
    kind: 'lume-calibration',
    version: 1,
    note: 'Somente estrutura. Sem texto, números de processo ou valores de campos.',
    truncated: state.truncated,
    nodeCount: state.nodes,
    frameCount: state.frames.length,
    counts: state.counts,
    tables: state.tables,
    frames: state.frames,
  });
}

export const CALIBRATION_DOWNLOAD_NAME = 'lume-calibracao.json';

export function calibrationFilename(date = new Date()) {
  return `lume-calibracao-${date.toISOString().replace(/[:.]/g, '-')}.json`;
}

const VERSION_RE = /\b\d{1,2}(?:\.\d{1,2}){1,3}\b/;

function queryAll(root, selector) {
  try { return [...root.querySelectorAll(selector)]; } catch { return []; }
}

function queryOne(root, selector) {
  try { return root.querySelector(selector); } catch { return null; }
}

export function describeClick(el) {
  if (!el) return null;
  const href = attr(el, 'href') || attr(el, 'action') || attr(el, 'src');
  return {
    tag: tagOf(el),
    id: sanitizeId(attr(el, 'id')),
    class: classesOf(el).map(sanitizeClassToken).filter(Boolean).slice(0, 40),
    attrs: attrNames(el).map((name) => sanitizeToken(name)).filter(Boolean).slice(0, 50).sort(),
    hrefPattern: urlPattern(href),
  };
}

export function frameTree(root) {
  const walk = (doc) => {
    const frames = queryAll(doc, 'iframe');
    return {
      accessible: true,
      iframes: frames.map((frame) => {
        const src = urlPattern(attr(frame, 'src'));
        const child = frameDocument(frame);
        if (!child) return { accessible: false, src, iframes: [] };
        return { ...walk(child), src };
      }),
    };
  };
  return walk(root);
}

export function collectUrlPatterns(root) {
  const found = [];
  const seen = new Set();
  const add = (raw) => {
    const pattern = urlPattern(raw);
    if (!pattern || seen.has(pattern)) return;
    seen.add(pattern);
    found.push(pattern);
  };
  for (const doc of sameOriginDocuments(root)) {
    for (const node of queryAll(doc, 'a[href], iframe[src], form[action]')) {
      add(attr(node, 'href') || attr(node, 'src') || attr(node, 'action'));
    }
  }
  return found;
}

export function candidateLists(root, profiles) {
  const out = [];
  for (const profile of profiles ?? []) {
    for (const doc of sameOriginDocuments(root)) {
      for (const selector of profile.docList ?? []) {
        const list = queryOne(doc, selector);
        if (!list) {
          out.push({ profileId: profile.id, selector, found: false, rows: 0, links: 0 });
          continue;
        }
        const rows = (profile.docRow ?? []).reduce((n, sel) => n + queryAll(list, sel).length, 0);
        const links = (profile.openLink ?? []).reduce((n, sel) => n + queryAll(list, sel).length, 0);
        out.push({ profileId: profile.id, selector, found: true, rows, links });
      }
    }
  }
  return out;
}

export function versionStrings(root) {
  const out = [];
  for (const doc of sameOriginDocuments(root)) {
    for (const node of queryAll(doc, 'meta[name="version"], meta[name="generator"], [data-pje-version]')) {
      const raw = attr(node, 'content') || attr(node, 'data-pje-version') || '';
      const match = String(raw).match(VERSION_RE);
      if (match && !out.includes(match[0])) out.push(match[0]);
    }
  }
  return out;
}

export function resourceRecord(entry) {
  const type = String(entry?.contentType ?? '').split(';')[0].trim().toLowerCase();
  return {
    url: urlPattern(entry?.name ?? ''),
    initiator: sanitizeToken(entry?.initiatorType ?? '') || 'other',
    sizeBucket: sizeBucket(entry?.transferSize ?? entry?.decodedBodySize ?? 0),
    contentType: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type) ? type : null,
  };
}

// Calibration v2: structure, masked URL patterns, candidate counts, bucketed
// resource sizes, version tokens. Clicks are element shapes already described.
// Nothing here copies text, names, titles or query values.
export function buildCalibration(root, extras = {}) {
  const base = snapshotDocument(root, extras);
  const clicks = (extras.clicks ?? []).map((click) => {
    const described = click && typeof click.tag === 'string' && Array.isArray(click.attrs) && typeof click.getAttribute !== 'function'
      ? click
      : describeClick(click);
    if (!described) return null;
    return {
      tag: sanitizeToken(described.tag) || String(described.tag || '').toLowerCase().slice(0, 20),
      id: sanitizeId(described.id),
      class: (described.class ?? []).map(sanitizeClassToken).filter(Boolean),
      attrs: (described.attrs ?? []).map((name) => sanitizeToken(name)).filter(Boolean),
      hrefPattern: described.hrefPattern,
    };
  }).filter(Boolean);
  return scrubTree({
    ...base,
    version: 2,
    note: 'Somente estrutura e padrões de URL. Sem texto, nomes, CPF ou número de processo.',
    frameTree: frameTree(root),
    urlPatterns: collectUrlPatterns(root),
    candidateLists: candidateLists(root, extras.profiles ?? []),
    resources: (extras.resources ?? []).map(resourceRecord),
    fetches: (extras.fetches ?? []).map(resourceRecord),
    clicks,
    versions: versionStrings(root),
  });
}

export function calibrationReport(snap) {
  const all = snap?.tables ?? [];
  const shown = all.slice(0, 12).map((t) => `${t.id || '(sem id)'} (${t.rows} linhas)`);
  const extra = all.length > shown.length ? ` e mais ${all.length - shown.length}` : '';
  const tables = shown.length ? shown.join(', ') + extra : 'nenhuma';
  const cut = snap?.truncated ? ' A captura foi interrompida no limite de nós.' : '';
  return `Nós: ${snap?.nodeCount ?? 0}. Quadros: ${snap?.frameCount ?? 0}. Tabelas: ${tables}.${cut}`;
}
