// Adapter to the #7 case store. Extraction text goes into the encrypted `extraction` record of
// its version; page images for OCR checks go into `temp` with a TTL, so they leave with the
// retention scope and with the case.
const imageName = (docId, version, page) => `page:${docId}@${version}:p${page}`;

export async function persist(caseRec, result, { imageTtlMs }) {
  const { images, ...record } = result;
  await caseRec.putExtraction(result.docId, result.version, record);
  for (const img of images ?? []) await caseRec.putTemp(imageName(result.docId, result.version, img.page), { mime: img.mime, bytes: Array.from(img.bytes) }, imageTtlMs);
}

// Parses a passage id `<docId>@<version>:p<page>:<start>-<end>`.
export function parseRef(id) {
  const m = /^(.+)@([^@:]+):p(\d+):(\d+)-(\d+)$/.exec(id);
  if (!m) throw new TypeError('invalid passage reference');
  return { docId: m[1], version: m[2], page: Number(m[3]), start: Number(m[4]), end: Number(m[5]) };
}

// Opens the source of one passage: the exact version and page, the passage text, a link to the
// original page, and the retained page image for OCR passages (or why it is not available).
export async function openSource(caseRec, passageId) {
  const ref = parseRef(passageId);
  const rec = await caseRec.get('extraction', `${ref.docId}@${ref.version}`);
  const page = rec?.pages.find((p) => p.page === ref.page);
  const passage = page?.passages.find((p) => p.id === passageId);
  if (!passage) return { found: false, ...ref };
  let image = null;
  let imageStatus = 'not_applicable';
  if (passage.method.startsWith('ocr:')) {
    const img = await caseRec.getTemp(imageName(ref.docId, ref.version, ref.page));
    image = img ? { mime: img.mime, bytes: Uint8Array.from(img.bytes) } : null;
    imageStatus = img ? 'retained' : 'expired';
  }
  return {
    found: true, ...ref, passage,
    pageText: page.text,
    link: rec.href ? `${rec.href}#page=${ref.page}` : null,
    image, imageStatus,
  };
}
