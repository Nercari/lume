// Lume adapter core for PJe TRF1/SJDF. Pure logic: no chrome.* calls, no imports, no navigation.
// It touches the DOM only through querySelector, querySelectorAll, getAttribute and textContent,
// so tests can use small mocks. scripts/build.mjs bundles this file into the content script.

// shortcut: these selectors and row attributes are UNVERIFIED placeholders. Nobody has seen a
// permitted real case yet. Calibrate them against one through the #3 route before live use (#4).
// An unknown page fails the layout check and stops safely instead of guessing.
export const PROFILE = {
  id: 'trf1-pje1g-v0-unverified',
  layoutMarker: '#autosDigitais',
  caseNumber: '.numero-processo',
  docList: '#listaDocumentos',
  docRow: 'tr.documento',
  openLink: 'a.abrir',
  nextPage: 'a.proxima',
  firstPage: 'a.primeira',
  pageInfo: '.paginacao',
  loginMarker: '#loginForm',
};

export const STATES = ['pending', 'processed', 'restricted', 'missing', 'unsupported', 'failed'];
const SUPPORTED_TYPES = ['application/pdf', 'text/html'];
const MAX_PAGES = 500;

export class Stop extends Error {
  constructor(reason, detail = null) {
    super(reason);
    this.reason = reason;
    this.detail = detail;
  }
}

const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const abs = (href, base) => (href ? new URL(href, base).href : null);
const isLogin = (res, p) => res.status === 401 || Boolean(res.doc?.querySelector(p.loginMarker));

// Reads one document-list page. Throws Stop for a login page or an unknown layout.
export function parseListPage(doc, url, p = PROFILE) {
  if (doc.querySelector(p.loginMarker)) throw new Stop('session_expired');
  const list = doc.querySelector(p.docList);
  const caseNumber = text(doc.querySelector(p.caseNumber));
  if (!doc.querySelector(p.layoutMarker) || !list || !caseNumber) throw new Stop('incompatible_layout', p.id);
  const items = Array.from(list.querySelectorAll(p.docRow), (row) => {
    const id = row.getAttribute('data-id');
    // A row we cannot identify would vanish from the inventory, so stop instead.
    if (!id) throw new Stop('incompatible_layout', 'document row without id');
    const pages = Number.parseInt(row.getAttribute('data-paginas') ?? '', 10);
    return {
      id,
      version: row.getAttribute('data-versao'),
      kind: row.getAttribute('data-tipo') === 'anexo' ? 'attachment' : 'document',
      parentId: row.getAttribute('data-pai'),
      expectedPages: Number.isFinite(pages) ? pages : null,
      restricted: row.getAttribute('data-sigilo') !== null,
      href: abs(row.querySelector(p.openLink)?.getAttribute('href'), url),
    };
  });
  const m = text(doc.querySelector(p.pageInfo)).match(/(\d+)\s*(?:de|of|\/)\s*(\d+)/i);
  return {
    caseNumber,
    items,
    next: abs(doc.querySelector(p.nextPage)?.getAttribute('href'), url),
    first: abs(doc.querySelector(p.firstPage)?.getAttribute('href'), url),
    pageInfo: m ? { current: Number(m[1]), total: Number(m[2]) } : null,
  };
}

export const fingerprint = (page) =>
  `${page.pageInfo?.total ?? '?'}#${page.items.map((i) => `${i.id}@${i.version}`).join('|')}`;

// What the user sees now: the case identity and a fingerprint of the navigation state.
export function visibleState(doc, url, p = PROFILE) {
  try {
    const page = parseListPage(doc, url, p);
    return { status: 'case', caseNumber: page.caseNumber, print: `${url} ${fingerprint(page)}` };
  } catch (e) {
    return { status: e instanceof Stop ? e.reason : 'error', caseNumber: null, print: url };
  }
}

export function summarize(inv) {
  const counts = Object.fromEntries(STATES.map((s) => [s, 0]));
  for (const item of inv?.items ?? []) counts[item.state]++;
  return { identified: inv?.items.length ?? 0, ...counts };
}

// Reads the whole document inventory of the case shown in startDoc, one request at a time.
// fetchPage(url, signal) -> { status, contentType, size, doc } must use the page's own session.
// isCurrent() must return false as soon as the visible case or navigation state changes.
export async function readCase({ startDoc, startUrl, fetchPage, isCurrent = () => true, signal, onProgress = () => {}, profile: p = PROFILE }) {
  const origin = new URL(startUrl).origin;
  const inv = { caseNumber: null, profile: p.id, status: 'reading', stopReason: null, stopDetail: null, segments: [], items: [] };
  const emit = () => onProgress(structuredClone(inv));
  const guard = () => {
    if (signal?.aborted) throw new Stop(signal.reason === 'user' ? 'stopped_by_user' : 'invalidated');
    if (!isCurrent()) throw new Stop('invalidated');
  };
  const get = async (url) => {
    if (new URL(url).origin !== origin) throw new Stop('incompatible_layout', 'cross-origin link refused');
    let res;
    try {
      res = await fetchPage(url, signal);
    } catch (e) {
      guard(); // an abort reports as invalidated or stopped_by_user, not as a network error
      throw e;
    }
    guard();
    return res;
  };
  const loadList = async (url) => {
    const res = await get(url);
    if (isLogin(res, p)) throw new Stop('session_expired');
    if (res.status < 200 || res.status > 299 || !res.doc) return null;
    const page = parseListPage(res.doc, url, p);
    if (page.caseNumber !== inv.caseNumber) throw new Stop('invalidated', 'list belongs to another case');
    return page;
  };

  try {
    let page = parseListPage(startDoc, startUrl, p);
    inv.caseNumber = page.caseNumber;
    let url = startUrl;
    if (page.pageInfo && page.pageInfo.current !== 1) {
      if (!page.first) throw new Stop('incompatible_layout', 'no link to the first list page');
      url = page.first;
      page = await loadList(url);
      if (!page) throw new Stop('incompatible_layout', 'first list page unreadable');
    }
    const firstUrl = url;
    const startPrint = fingerprint(page);
    const total = page.pageInfo?.total ?? null;
    const seen = new Set([url]);
    const ids = new Set();

    for (let n = 1; ; n++) {
      if ((page.pageInfo?.total ?? null) !== total) throw new Stop('inventory_changed', 'page count changed');
      for (const it of page.items) {
        if (ids.has(it.id)) throw new Stop('inventory_changed', 'document listed twice');
        ids.add(it.id);
        const { restricted, ...rest } = it;
        inv.items.push({ ...rest, state: restricted ? 'restricted' : 'pending', detail: restricted ? 'marked restricted in list' : null });
      }
      inv.segments.push({ n, status: 'read', rows: page.items.length });
      emit();
      if (!page.next) break;
      if (seen.has(page.next) || n >= MAX_PAGES) throw new Stop('incompatible_layout', 'pagination loop');
      seen.add(page.next);
      const nextPage = await loadList(page.next);
      if (!nextPage) {
        inv.segments.push({ n: n + 1, status: 'failed', rows: 0 });
        break;
      }
      page = nextPage;
    }
    // Record list pages we expected but could not reach, so a short traversal stays visible.
    for (let n = inv.segments.length + 1; total && n <= total; n++) inv.segments.push({ n, status: 'unread', rows: 0 });

    for (const item of inv.items) {
      if (item.state !== 'pending') continue;
      guard();
      Object.assign(item, await fetchItem(item, get, p));
      emit();
    }

    const again = await loadList(firstUrl);
    if (!again || fingerprint(again) !== startPrint) throw new Stop('inventory_changed', 'list differs from the start of reading');
    inv.status = inv.segments.every((s) => s.status === 'read') ? 'complete' : 'incomplete';
  } catch (e) {
    inv.status = 'stopped';
    inv.stopReason = e instanceof Stop ? e.reason : 'error';
    inv.stopDetail = e instanceof Stop ? e.detail : String(e?.message ?? e);
  }
  emit();
  return structuredClone(inv);
}

async function fetchItem(item, get, p) {
  if (!item.href) return { state: 'missing', detail: 'no link in list' };
  let res;
  try {
    res = await get(item.href);
  } catch (e) {
    if (e instanceof Stop) throw e;
    return { state: 'failed', detail: 'network error' };
  }
  if (isLogin(res, p)) throw new Stop('session_expired');
  if (res.status === 403) return { state: 'restricted', detail: 'http 403' };
  if (res.status === 404 || res.status === 410) return { state: 'missing', detail: `http ${res.status}` };
  if (res.status < 200 || res.status > 299) return { state: 'failed', detail: `http ${res.status}` };
  const type = (res.contentType ?? '').split(';')[0].trim().toLowerCase();
  if (!SUPPORTED_TYPES.includes(type)) return { state: 'unsupported', detail: type || 'unknown type' };
  return { state: 'processed', detail: null, contentType: type, bytes: res.size ?? null };
}

// Binds reading to the visible case. Any change of case or navigation state starts a new epoch,
// aborts the run, and drops its inventory, so no case ever reuses another case's context.
// load identifies one content-script instance (one page load); the epoch counts only inside it.
export function createTracker({ getDoc, getUrl, fetchPage, publish, profile: p = PROFILE, load = crypto.randomUUID() }) {
  let epoch = 0;
  let view = visibleState(getDoc(), getUrl(), p);
  let run = null;
  let inventory = null;
  const status = () => ({ load, epoch, view: { status: view.status, caseNumber: view.caseNumber }, inventory });
  const refresh = () => {
    const next = visibleState(getDoc(), getUrl(), p);
    if (next.status === view.status && next.caseNumber === view.caseNumber && next.print === view.print) return false;
    epoch++;
    view = next;
    inventory = null;
    run?.abort('navigation');
    run = null;
    publish(status());
    return true;
  };
  const start = () => {
    refresh();
    if (run || view.status !== 'case') return Promise.resolve(null);
    const mine = epoch;
    const ctrl = new AbortController();
    run = ctrl;
    inventory = null;
    return readCase({
      startDoc: getDoc(),
      startUrl: getUrl(),
      fetchPage,
      signal: ctrl.signal,
      profile: p,
      isCurrent: () => (refresh(), epoch === mine),
      onProgress: (inv) => {
        if (epoch !== mine) return;
        inventory = inv;
        publish(status());
      },
    }).finally(() => {
      if (run === ctrl) run = null;
    });
  };
  return { status, refresh, start, stop: () => run?.abort('user') };
}

// Panel side: decides which tracker states to show. A full page load starts a new tracker whose
// epoch restarts at 0, so epochs are compared only inside one load. A tab navigation unbinds.
export function createPanelSync() {
  let tabId = null;
  let load = null;
  let epoch = -1;
  const reset = (id) => { tabId = id; load = null; epoch = -1; };
  return {
    bind: reset,
    navigated: (id) => (id === tabId ? (reset(id), true) : false),
    accept(id, state) {
      if (id !== tabId || !state) return false;
      if (state.load === load && state.epoch < epoch) return false;
      load = state.load;
      epoch = state.epoch;
      return true;
    },
  };
}

// What the panel shows for a tracker state, or for no state (the tab is not a PJe case page).
export function panelView(state) {
  if (!state) return { caseNumber: null, statusKey: 'not_pje', stop: false, counts: summarize(null), items: [], canStart: false, canStop: false };
  const { view } = state;
  // Show an inventory only if it belongs to the case that is visible now.
  const inv = state.inventory?.caseNumber === view.caseNumber ? state.inventory : null;
  return {
    caseNumber: view.caseNumber,
    statusKey: view.status !== 'case' ? view.status : inv ? (inv.stopReason ?? inv.status) : 'case',
    stop: inv?.status === 'stopped' || view.status !== 'case',
    counts: summarize(inv),
    items: inv?.items ?? [],
    canStart: view.status === 'case' && inv?.status !== 'reading',
    canStop: inv?.status === 'reading',
  };
}
