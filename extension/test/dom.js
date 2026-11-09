// Tiny DOM mock: elements with attributes, children and the four calls the adapter uses.
// Selectors: one compound per call, made of tag, #id, .class, [attr] and [attr="value"].
class El {
  constructor(tag, attrs, children) {
    this.tag = tag;
    this.attrs = attrs;
    this.children = children;
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  get textContent() { return this.children.map((c) => (typeof c === 'string' ? c : c.textContent)).join(''); }
  set textContent(v) { this.children = [String(v)]; }
  matches(sel) {
    for (const [, tok, attr, val] of sel.matchAll(/([#.]?[\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)) {
      if (attr) { if (!(attr in this.attrs) || (val !== undefined && this.attrs[attr] !== val)) return false; }
      else if (tok[0] === '#') { if (this.attrs.id !== tok.slice(1)) return false; }
      else if (tok[0] === '.') { if (!(this.attrs.class ?? '').split(/\s+/).includes(tok.slice(1))) return false; }
      else if (this.tag !== tok) return false;
    }
    return true;
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => { for (const c of n.children) if (c instanceof El) { if (c.matches(sel)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
}

export const el = (tag, attrs = {}, ...children) => new El(tag, attrs, children.flat());
export const doc = (...children) => el('#document', {}, ...children);
