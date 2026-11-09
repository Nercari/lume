// Section-level three-way merge for regeneration (#8). Sections are `## ` heading blocks.
// A section only the user changed keeps the user's text; a section only the regeneration changed
// takes the new text; a section both changed differently is a conflict for the user to review.

export function split(text) {
  const out = [{ head: '', body: [] }];
  for (const line of String(text ?? '').split('\n')) {
    if (line.startsWith('## ')) out.push({ head: line, body: [] });
    else out.at(-1).body.push(line);
  }
  return out.map((s) => ({ head: s.head, body: s.body.join('\n') }));
}

const join = (secs) => secs.map((s) => (s.head ? `${s.head}\n${s.body}` : s.body)).join('\n').replace(/^\n+/, '');

export function merge3(base, user, generated) {
  const [b, u, g] = [base, user, generated].map(split);
  const heads = (x) => x.map((s) => s.head).join('\n');
  // The structure changed (for example a new document type): the whole text is one conflict.
  if (heads(b) !== heads(u) || heads(b) !== heads(g)) return { ok: false, conflicts: [{ section: null, base, user, generated }] };
  const merged = [];
  const conflicts = [];
  b.forEach((bs, i) => {
    const us = u[i].body, gs = g[i].body;
    if (us === bs.body) merged.push(g[i]);
    else if (gs === bs.body || gs === us) merged.push(u[i]);
    else {
      conflicts.push({ section: bs.head.slice(3) || null, base: bs.body, user: us, generated: gs });
      merged.push(u[i]);
    }
  });
  return conflicts.length ? { ok: false, conflicts } : { ok: true, text: join(merged) };
}
