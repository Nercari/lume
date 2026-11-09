// OCR error measurement. Ground truth is a human-checked excerpt of one page:
// { docId, version, page, truth, checkedBy }. The hypothesis is Lume's text for that page.
// Normalization: whitespace runs collapse to one space and ends are trimmed. Case and accents count.

const norm = (s) => s.replace(/\s+/g, ' ').trim();

export function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export function errorRates(truth, hypothesis) {
  const t = norm(truth);
  const h = norm(hypothesis);
  const tw = t ? t.split(' ') : [];
  const hw = h ? h.split(' ') : [];
  const chars = editDistance([...t], [...h]);
  const words = editDistance(tw, hw);
  return { chars, charTotal: [...t].length, words, wordTotal: tw.length, cer: chars / Math.max(1, [...t].length), wer: words / Math.max(1, tw.length) };
}

// results: extraction results. Returns per-excerpt rates and micro-averaged totals.
// An excerpt whose page has no text counts as fully wrong (CER 1), never as skipped.
export function measure(excerpts, results) {
  const items = excerpts.map((x) => {
    if (!x.checkedBy) throw new TypeError('excerpt is not human-checked');
    const page = results.find((r) => r.docId === x.docId && r.version === x.version)?.pages.find((p) => p.page === x.page);
    const hypothesis = x.start != null ? (page?.text ?? '').slice(x.start, x.end) : (page?.text ?? '');
    return { docId: x.docId, version: x.version, page: x.page, method: page?.method ?? null, found: Boolean(page), ...errorRates(x.truth, hypothesis) };
  });
  const sum = (k) => items.reduce((s, i) => s + i[k], 0);
  return {
    excerpts: items.length,
    cer: sum('chars') / Math.max(1, sum('charTotal')),
    wer: sum('words') / Math.max(1, sum('wordTotal')),
    items,
  };
}
