// Chrome wiring for the adapter. scripts/build.mjs puts the pure modules in front of this file.
// Requests go through the page's own fetch on the same origin, so the browser attaches the PJe
// session itself. Lume never reads cookies, credentials or certificates, and never navigates.
import { buildCalibration, describeClick } from './calibrate.js';
import { encodeBytes, splitBytes } from './chunks.js';
import { collectCase } from './collect.js';
import { failedTitle, holdCaseView, pageKey, readyTitle, STUDY_BUTTON_ID, STUDY_BUTTON_LABEL, studyingTitle } from './page-trigger.js';
import { activeProfiles } from './profile.js';

const tracker = createTracker({
  getDoc: () => document,
  getUrl: () => location.href,
  fetchPage: async (url, signal) => {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal });
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      // Inventory only checks that the document is reachable and supported; the study flow reads bytes.
      await res.body?.cancel();
      return { status: res.status, contentType, size: Number(res.headers.get('content-length')) || null, doc: null };
    }
    const html = await res.text();
    return { status: res.status, contentType, size: html.length, doc: new DOMParser().parseFromString(html, 'text/html') };
  },
  publish: (state) => chrome.runtime.sendMessage({ type: 'lume:state', state }).catch(() => {}),
});

async function fetchBytes(url, signal) {
  const started = performance.now();
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal });
  const contentType = res.headers.get('content-type') ?? '';
  const bytes = new Uint8Array(await res.arrayBuffer());
  const doc = contentType.includes('text/html')
    ? new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'text/html')
    : null;
  return { status: res.status, contentType, size: bytes.byteLength, bytes, doc, fetchMs: performance.now() - started };
}

function useStoredProfile(raw) {
  const verdict = validateStoredProfile(raw);
  setInstalledProfile(verdict.ok ? verdict.profile : null);
  tracker.refresh();
}

try {
  chrome.storage?.local?.get('lumeProfile', (got) => useStoredProfile(got?.lumeProfile));
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area !== 'local' || !Object.prototype.hasOwnProperty.call(changes, 'lumeProfile')) return;
    useStoredProfile(changes.lumeProfile.newValue);
  });
} catch { /* storage is unavailable until the permission is present */ }

let calibration = null;

function liveCalibration() {
  let resources = [];
  try {
    resources = performance.getEntriesByType('resource').map((entry) => ({
      name: entry.name,
      initiatorType: entry.initiatorType,
      transferSize: entry.transferSize,
      contentType: '',
    }));
  } catch { resources = []; }
  return buildCalibration(document, {
    resources,
    fetches: calibration?.fetches ?? [],
    clicks: calibration?.clicks ?? [],
    profiles: activeProfiles(),
  });
}

document.addEventListener('click', (event) => {
  if (!calibration) return;
  event.preventDefault();
  const before = new Set();
  try {
    for (const entry of performance.getEntriesByType('resource')) before.add(entry.name);
  } catch { /* performance is optional */ }
  const target = event.target?.closest?.('a, button, input, form') || event.target;
  const described = describeClick(target);
  if (described) calibration.clicks.push(described);
  chrome.runtime.sendMessage({ type: 'lume:calibration', state: liveCalibration() }).catch(() => {});
  setTimeout(() => {
    if (!calibration) return;
    try {
      for (const entry of performance.getEntriesByType('resource')) {
        if (before.has(entry.name)) continue;
        calibration.fetches.push({
          name: entry.name,
          initiatorType: entry.initiatorType,
          transferSize: entry.transferSize,
          contentType: '',
        });
      }
    } catch { /* the click still keeps the element shape */ }
    chrome.runtime.sendMessage({ type: 'lume:calibration', state: liveCalibration() }).catch(() => {});
  }, 800);
}, true);

function viewPartFromHash() {
  const match = /^#lume-autos(?:\/(\d+))?$/.exec(location.hash || '');
  if (!match) return 0;
  const n = match[1] ? Number(match[1]) : 1;
  return Number.isInteger(n) && n > 0 ? n : 1;
}

let heldView = null;

function paintCaseView(payload) {
  const part = payload?.part || viewPartFromHash();
  const total = payload?.total || 1;
  const text = payload?.text || 'A visão do caso ainda não chegou. Deixe a página de estudo aberta.';
  if (payload?.failed) {
    document.title = failedTitle(payload.reason);
  } else if (payload?.documents != null) {
    document.title = readyTitle({ documents: payload.documents, gaps: payload.gaps, part, total });
  }
  const header = payload?.header || heldView?.header || null;
  const root = document.createElement('article');
  root.id = 'lume-caso';
  root.dataset.formato = 'lume-caso/1';
  root.dataset.origem = header?.origem || 'botao';
  root.dataset.parte = String(part);
  root.dataset.total = String(total);
  const head = document.createElement('header');
  for (const [campo, value] of [
    ['processo', header?.processo || '—'],
    ['orgao', header?.orgao || '—'],
    ['gerado-em', header?.geradoEm || ''],
    ['origem', header?.origem || 'botao'],
    ['contagens', header?.contagens || ''],
  ]) {
    const p = document.createElement('p');
    p.dataset.campo = campo;
    p.textContent = value;
    head.append(p);
  }
  const pre = document.createElement('pre');
  pre.dataset.lumeTexto = '';
  pre.textContent = text;
  const bar = document.createElement('p');
  if (part > 1) {
    const prev = document.createElement('a');
    prev.href = part === 2 ? '#lume-autos' : `#lume-autos/${part - 1}`;
    prev.textContent = 'Parte anterior';
    bar.append(prev, document.createTextNode(' '));
  }
  if (part < total) {
    const next = document.createElement('a');
    next.href = part === 1 ? '#lume-autos/2' : `#lume-autos/${part + 1}`;
    next.textContent = 'Parte seguinte';
    bar.append(next, document.createTextNode(' '));
  }
  const copyPart = document.createElement('button');
  copyPart.type = 'button';
  copyPart.id = 'lume-copiar-parte';
  copyPart.textContent = `Copiar parte ${part}`;
  copyPart.addEventListener('click', () => {
    if (!navigator.clipboard?.writeText) return;
    navigator.clipboard.writeText(text).then(() => { copyPart.textContent = 'Copiado'; }).catch(() => {});
  });
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.id = 'lume-copiar';
  copy.textContent = 'Copiar tudo';
  copy.addEventListener('click', () => {
    const value = heldView?.allText || text;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(() => { copy.textContent = 'Copiado'; }).catch(() => {});
  });
  bar.append(copyPart, document.createTextNode(' '), copy);
  root.append(head, bar, pre);
  document.body.replaceChildren(root);
}

function paintHeld(part) {
  const found = heldView.parts.find((item) => item.n === part) ?? heldView.parts[0] ?? null;
  paintCaseView({
    text: found?.text || '',
    part: found?.n || part,
    total: heldView.parts.length || 1,
    documents: heldView.documents,
    gaps: heldView.gaps,
    header: heldView.header,
  });
}

function requestCaseView(attempt) {
  const part = viewPartFromHash();
  if (!part) return;
  const here = pageKey(location.href);
  if (heldView && heldView.pageUrl === here) {
    paintHeld(part);
    return;
  }
  chrome.runtime.sendMessage({ type: 'lume:take-view', pageUrl: here }, (res) => {
    const decision = holdCaseView(res, location.href);
    if (!decision.ok) {
      if (!decision.retry || attempt >= 20) {
        document.title = failedTitle(decision.reason);
        if (decision.retry) paintCaseView({ failed: true, reason: decision.reason, text: 'A visão do caso ainda não chegou. Deixe a página de estudo aberta.' });
        return;
      }
      setTimeout(() => requestCaseView(attempt + 1), 300);
      return;
    }
    if (!decision.held.parts.length) {
      if (attempt < 20) {
        setTimeout(() => requestCaseView(attempt + 1), 300);
        return;
      }
      document.title = failedTitle('visão não chegou');
      paintCaseView({ failed: true, reason: 'visão não chegou', text: 'A visão do caso ainda não chegou. Deixe a página de estudo aberta.' });
      return;
    }
    heldView = decision.held;
    paintHeld(part);
  });
}

function ensureStudyButton() {
  if (document.getElementById(STUDY_BUTTON_ID)) return;
  const button = document.createElement('button');
  button.id = STUDY_BUTTON_ID;
  button.type = 'button';
  button.textContent = STUDY_BUTTON_LABEL;
  button.style.position = 'fixed';
  button.style.top = '12px';
  button.style.right = '12px';
  button.style.zIndex = '2147483647';
  button.addEventListener('click', () => {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = studyingTitle(0, 0);
    document.title = button.textContent;
    chrome.runtime.sendMessage({ type: 'lume:study-here' });
  });
  (document.documentElement || document.body).append(button);
}

function showStudyLabel(text) {
  const button = document.getElementById(STUDY_BUTTON_ID);
  if (button) button.textContent = text;
  document.title = text;
}

async function documentPauseMs() {
  try {
    const stored = await chrome.storage.local.get('lumePauseMs');
    if (stored && Object.prototype.hasOwnProperty.call(stored, 'lumePauseMs')) {
      const n = Number(stored.lumePauseMs);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  } catch { /* the default pause stays on */ }
  return 300;
}

function publishState(left = 8) {
  chrome.runtime.sendMessage({ type: 'lume:state', state: tracker.status() }).catch(() => {
    if (left > 0) setTimeout(() => publishState(left - 1), 300);
  });
}

let pending = null;
const viewingCase = viewPartFromHash() > 0;
if (viewingCase) {
  requestCaseView(0);
  addEventListener('hashchange', () => {
    if (viewPartFromHash()) requestCaseView(0);
  });
} else {
new MutationObserver(() => {
  clearTimeout(pending);
  pending = setTimeout(() => {
    ensureStudyButton();
    watchFrames(document);
    tracker.refresh();
  }, 250);
}).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
addEventListener('popstate', () => tracker.refresh());
addEventListener('hashchange', () => tracker.refresh());

function watchFrames(doc) {
  let frames = [];
  try { frames = [...doc.querySelectorAll('iframe')]; } catch { frames = []; }
  for (const frame of frames) {
    if (frame.dataset?.lumeWatch === '1') continue;
    if (frame.dataset) frame.dataset.lumeWatch = '1';
    frame.addEventListener('load', () => {
      try { if (frame.contentDocument) watchFrames(frame.contentDocument); } catch { /* cross-origin frame */ }
      tracker.refresh();
    });
    try { if (frame.contentDocument) watchFrames(frame.contentDocument); } catch { /* cross-origin frame */ }
  }
}
watchFrames(document);
ensureStudyButton();
}

const STUDY_ID = /^[0-9a-f-]{36}$/i;

async function runStudy(studyId) {
  if (!STUDY_ID.test(studyId)) return;
  const ctrl = new AbortController();
  const port = chrome.runtime.connect({ name: `lume-collect:${studyId}` });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), 20000);
    port.onMessage.addListener((msg) => {
      if (msg?.type === 'go') {
        clearTimeout(timer);
        resolve();
      }
      if (msg?.type === 'cancel') ctrl.abort('user');
    });
    port.onDisconnect.addListener(() => ctrl.abort('disconnect'));
  });
  try {
    await ready;
  } catch {
    showStudyLabel(failedTitle('página de estudo'));
    const stuck = document.getElementById(STUDY_BUTTON_ID);
    if (stuck) stuck.disabled = false;
    try { port.postMessage({ type: 'error', detail: 'a página de estudo não conectou' }); } catch { /* port already closed */ }
    return;
  }
  let index = 0;
  const pauseMs = await documentPauseMs();
  const result = await collectCase({
    startDoc: document,
    startUrl: location.href,
    fetchBytes,
    pauseMs,
    signal: ctrl.signal,
    isCurrent: () => {
      const before = tracker.status().view.caseNumber;
      tracker.refresh();
      const view = tracker.status().view;
      return view.status === 'case' && view.caseNumber === before;
    },
    onDocument: async (doc) => {
      showStudyLabel(studyingTitle(doc.index, doc.total));
      const chunks = splitBytes(doc.bytes);
      for (const chunk of chunks) {
        port.postMessage({
          type: 'chunk',
          index,
          seq: chunk.seq,
          totalChunks: chunk.total,
          bytes: encodeBytes(chunk.bytes),
          id: doc.id,
          version: doc.version,
          contentType: doc.contentType,
          date: doc.date ?? null,
          fetchMs: doc.fetchMs ?? null,
          source: doc.source,
          rule: doc.rule,
          docIndex: doc.index,
          docTotal: doc.total,
        });
      }
      port.postMessage({ type: 'doc-end', index, id: doc.id, docIndex: doc.index, docTotal: doc.total });
      index += 1;
    },
  });
  if (result.status === 'stopped') {
    const reason = typeof result.stopDetail === 'string' && result.stopDetail ? result.stopDetail : (result.stopReason || 'falha');
    showStudyLabel(failedTitle(reason));
  }
  const button = document.getElementById(STUDY_BUTTON_ID);
  if (button) button.disabled = false;
  try {
    port.postMessage({
      type: 'done',
      mode: result.mode,
      caseNumber: result.caseNumber,
      status: result.status,
      stopReason: result.stopReason ?? null,
      pageUrl: String(location.href || '').split('#')[0],
      items: (result.items ?? []).map((item) => ({ id: item.id, state: item.state, detail: item.detail, rule: item.rule, kind: item.kind, date: item.date ?? null })),
      misses: result.misses ?? [],
    });
  } catch { /* the study page closed */ }
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type === 'start') tracker.start();
  else if (msg?.type === 'stop') tracker.stop();
  else if (msg?.type === 'calibrate') {
    calibration = { clicks: [], fetches: [] };
    try { reply(liveCalibration()); }
    catch { reply({ error: 'snapshot_failed' }); }
    return true;
  } else if (msg?.type === 'study') {
    reply({ ok: true, studyId: msg.studyId });
    runStudy(msg.studyId);
    return true;
  } else if (msg?.type === 'status') {
    reply(tracker.status());
    return true;
  }
  return false;
});

if (!viewingCase) publishState();
