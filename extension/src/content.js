// Chrome wiring for the adapter. scripts/build.mjs puts the pure modules in front of this file.
// Requests go through the page's own fetch on the same origin, so the browser attaches the PJe
// session itself. Lume never reads cookies, credentials or certificates, and never navigates.
import { buildCalibration, describeClick } from './calibrate.js';
import { encodeBytes, splitBytes } from './chunks.js';
import { collectCase } from './collect.js';
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
  const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store', signal });
  const contentType = res.headers.get('content-type') ?? '';
  const bytes = new Uint8Array(await res.arrayBuffer());
  const doc = contentType.includes('text/html')
    ? new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'text/html')
    : null;
  return { status: res.status, contentType, size: bytes.byteLength, bytes, doc };
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
  const target = event.target?.closest?.('a, button, input, form') || event.target;
  const described = describeClick(target);
  if (described) calibration.clicks.push(described);
  const snap = liveCalibration();
  chrome.runtime.sendMessage({ type: 'lume:calibration', state: snap }).catch(() => {});
}, true);

function publishState(left = 8) {
  chrome.runtime.sendMessage({ type: 'lume:state', state: tracker.status() }).catch(() => {
    if (left > 0) setTimeout(() => publishState(left - 1), 300);
  });
}

let pending = null;
new MutationObserver(() => {
  clearTimeout(pending);
  pending = setTimeout(() => {
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
    try { port.postMessage({ type: 'error', detail: 'a página de estudo não conectou' }); } catch { /* port already closed */ }
    return;
  }
  let index = 0;
  const result = await collectCase({
    startDoc: document,
    startUrl: location.href,
    fetchBytes,
    signal: ctrl.signal,
    isCurrent: () => {
      const before = tracker.status().view.caseNumber;
      tracker.refresh();
      const view = tracker.status().view;
      return view.status === 'case' && view.caseNumber === before;
    },
    onDocument: async (doc) => {
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
  try {
    port.postMessage({
      type: 'done',
      mode: result.mode,
      caseNumber: result.caseNumber,
      status: result.status,
      stopReason: result.stopReason ?? null,
      items: (result.items ?? []).map((item) => ({ id: item.id, state: item.state, detail: item.detail, rule: item.rule, kind: item.kind })),
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

publishState();
