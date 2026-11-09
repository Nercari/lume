// fl. is the page inside the document. A footer page number wins. Without one,
// the sheet is the 1-based position of that page inside the document.
export function sheetNumber(page, indexInDoc) {
  if (page?.pageInDoc != null && Number.isFinite(Number(page.pageInDoc))) return Number(page.pageInDoc);
  return indexInDoc;
}

export function pagesByDoc(caseResult) {
  const groups = new Map();
  const add = (docId, page) => {
    if (docId == null) return;
    const key = String(docId);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(page);
  };
  const pages = caseResult?.pages ?? [];
  if (pages.length) {
    for (const page of pages) add(page.docId, page);
    return groups;
  }
  for (const passage of caseResult?.passages ?? []) {
    add(passage.docId, {
      n: passage.pdfPage,
      docId: passage.docId,
      pageInDoc: passage.pageInDoc,
      hasText: passage.hasText,
      method: passage.method,
    });
  }
  return groups;
}

export function sheetMap(caseResult) {
  const map = new Map();
  for (const [docId, pages] of pagesByDoc(caseResult)) {
    const sheets = new Map();
    pages.forEach((page, index) => {
      const sheet = sheetNumber(page, index + 1);
      sheets.set(sheet, Boolean(page.hasText) || sheets.get(sheet) === true);
    });
    map.set(docId, sheets);
  }
  return map;
}

export function formatSpan(numbers) {
  const unique = [...new Set(numbers.filter((value) => value != null))].sort((a, b) => a - b);
  if (!unique.length) return '—';
  const parts = [];
  let start = unique[0];
  let previous = unique[0];
  for (let index = 1; index <= unique.length; index += 1) {
    const value = unique[index];
    if (value === previous + 1) {
      previous = value;
      continue;
    }
    parts.push(start === previous ? String(start) : `${start}–${previous}`);
    start = value;
    previous = value;
  }
  return parts.join(', ');
}
