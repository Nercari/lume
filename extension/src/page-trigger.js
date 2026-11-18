// The PJe page button and the tab-title status Work reads. No PJe selector.

export const DOCUMENT_PAUSE_MS = 300;
export const STUDY_BUTTON_ID = 'lume-estudar';
export const STUDY_BUTTON_LABEL = 'Lume: Estudar processo';

export function studyingTitle(done, total) {
  return `Lume: estudando · ${done}/${total}`;
}

export function failedTitle(reason) {
  const short = String(reason ?? 'falha').replace(/[\r\n]+/g, ' ').trim().slice(0, 60) || 'falha';
  return `Lume: falhou · ${short}`;
}

export function readyTitle({ documents = 0, gaps = 0, part = 1, total = 1 } = {}) {
  return `Lume: pronto · ${documents} docs · ${gaps} lacunas · parte ${part} de ${total}`;
}

export function pageKey(href) {
  return String(href ?? '').split('#')[0];
}

export function samePage(replyUrl, here) {
  const wanted = pageKey(here);
  const got = pageKey(replyUrl);
  return wanted !== '' && got === wanted;
}

export function holdCaseView(reply, here) {
  const got = pageKey(reply?.pageUrl);
  if (!got) return { ok: false, retry: true, reason: 'visão não chegou' };
  if (!samePage(got, here)) return { ok: false, retry: false, reason: 'outra página' };
  return {
    ok: true,
    held: {
      pageUrl: got,
      parts: Array.isArray(reply.parts) ? reply.parts : [],
      allText: reply.allText ?? '',
      documents: Number(reply.documents) || 0,
      gaps: Number(reply.gaps) || 0,
      header: reply.header ?? null,
    },
  };
}

export function createViewStore() {
  const views = new Map();
  return {
    put(view) {
      const pageUrl = pageKey(view?.pageUrl);
      if (!pageUrl) return;
      views.set(pageUrl, {
        pageUrl,
        parts: Array.isArray(view.parts) ? view.parts : [],
        allText: view.allText ?? '',
        documents: Number(view.documents) || 0,
        gaps: Number(view.gaps) || 0,
        header: view.header ?? null,
      });
    },
    take(pageUrl) {
      return views.get(pageKey(pageUrl)) ?? null;
    },
  };
}
