// Tiny DOM mock. Selectors: tag, #id, .class, [attr], [attr="value"], [attr*="value"],
// descendant whitespace, and comma groups. The content script uses the real DOM.

function parseCompound(sel) {
  const re = /([a-zA-Z*][\w-]*)|#([\w:-]+)|\.([\w:-]+)|\[([\w:-]+)(?:([*^$~|])?="([^"]*)")?\]/g;
  const parts = [];
  let last = 0;
  for (const m of sel.matchAll(re)) {
    if (m.index !== last) return null;
    last = m.index + m[0].length;
    if (m[1]) parts.push({ kind: 'tag', value: m[1] });
    else if (m[2] !== undefined) parts.push({ kind: 'id', value: m[2] });
    else if (m[3] !== undefined) parts.push({ kind: 'class', value: m[3] });
    else parts.push({ kind: 'attr', name: m[4], op: m[5] || (m[6] !== undefined ? '=' : 'has'), value: m[6] });
  }
  if (last !== sel.length || parts.length === 0) return null;
  return parts;
}

function matchCompound(el, parts) {
  for (const part of parts) {
    if (part.kind === 'tag' && part.value !== '*' && el.tag !== part.value) return false;
    if (part.kind === 'id' && el.attrs.id !== part.value) return false;
    if (part.kind === 'class' && !(el.attrs.class ?? '').split(/\s+/).filter(Boolean).includes(part.value)) return false;
    if (part.kind === 'attr') {
      if (!Object.prototype.hasOwnProperty.call(el.attrs, part.name)) return false;
      const value = String(el.attrs[part.name] ?? '');
      if (part.op === '=' && value !== part.value) return false;
      if (part.op === '*' && !value.includes(part.value)) return false;
      if (part.op === '^' && !value.startsWith(part.value)) return false;
      if (part.op === '$' && !value.endsWith(part.value)) return false;
      if (part.op === '~' && !value.split(/\s+/).includes(part.value)) return false;
      if (part.op === '|' && value !== part.value && !value.startsWith(`${part.value}-`)) return false;
    }
  }
  return true;
}

function matchChain(el, compounds) {
  if (!matchCompound(el, compounds[compounds.length - 1])) return false;
  let node = el.parent;
  for (let i = compounds.length - 2; i >= 0; i--) {
    while (node && !matchCompound(node, compounds[i])) node = node.parent;
    if (!node) return false;
    node = node.parent;
  }
  return true;
}

function splitTop(sel, sep) {
  const out = [];
  let cur = '';
  let quote = false;
  let bracket = 0;
  for (const ch of sel) {
    if (ch === '"') quote = !quote;
    else if (!quote && ch === '[') bracket++;
    else if (!quote && ch === ']' && bracket) bracket--;
    if (!quote && bracket === 0 && ch === sep) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function queryAll(root, sel) {
  if (typeof sel !== 'string' || !sel.trim()) return [];
  const out = [];
  for (const group of splitTop(sel, ',')) {
    const compounds = splitTop(group, ' ').filter((part) => part !== '>' && part !== '+' && part !== '~').map(parseCompound);
    if (compounds.some((part) => !part)) throw new Error(`bad selector ${sel}`);
    const walk = (n) => {
      for (const child of n.children) {
        if (!(child instanceof El)) continue;
        if (matchChain(child, compounds) && !out.includes(child)) out.push(child);
        walk(child);
      }
    };
    walk(root);
  }
  return out;
}

class El {
  constructor(tag, attrs, children) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = children;
    this.parent = null;
    for (const child of children) if (child instanceof El) child.parent = this;
  }
  getAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null; }
  get textContent() { return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
  set textContent(v) { this.children = [String(v)]; }
  querySelectorAll(sel) { return queryAll(this, sel); }
  querySelector(sel) { return queryAll(this, sel)[0] ?? null; }
}

export const el = (tag, attrs = {}, ...children) => new El(tag, attrs, children.flat());
export const doc = (...children) => el('#document', {}, ...children);
