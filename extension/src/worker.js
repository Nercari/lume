// The side panel is available on every tab. On PJe it shows the inventory; elsewhere it offers
// the offline PDF page. The toolbar click opens the panel. If that panel cannot be armed, the
// same click opens the PDF page. The worker relays study slices and keeps each rendered case
// view in memory, keyed by the page it came from. It does not write the case to disk.
import { createViewStore } from './page-trigger.js';
const PDF_PAGE = 'manual/lume-pdf.html';
let panelClickOpensPanel = false;
let pjeTabId = null;
const relays = new Map();
const views = createViewStore();

function openPdfMode() {
  chrome.tabs.create({ url: chrome.runtime.getURL(PDF_PAGE) });
}

chrome.action.onClicked.addListener(() => {
  if (!panelClickOpensPanel) openPdfMode();
});

const sidePanel = chrome.sidePanel;
if (sidePanel?.setOptions && sidePanel?.setPanelBehavior) {
  sidePanel.setOptions({ enabled: true, path: 'panel.html' })
    .then(() => sidePanel.setPanelBehavior({ openPanelOnActionClick: true }))
    .then(() => { panelClickOpensPanel = true; })
    .catch(() => { panelClickOpensPanel = false; });
}

function slotFor(id) {
  let slot = relays.get(id);
  if (!slot) {
    slot = { queue: [], collect: null, study: null };
    relays.set(id, slot);
  }
  return slot;
}

chrome.runtime.onConnect.addListener((port) => {
  const collect = /^lume-collect:([0-9a-f-]{36})$/i.exec(port.name);
  const study = /^lume-study:([0-9a-f-]{36})$/i.exec(port.name);
  if (!collect && !study) return;
  const id = (collect || study)[1];
  const slot = slotFor(id);
  if (collect) {
    slot.collect = port;
    port.onMessage.addListener((msg) => {
      if (slot.study) slot.study.postMessage(msg);
      else slot.queue.push(msg);
    });
    if (slot.study) port.postMessage({ type: 'go' });
  } else {
    slot.study = port;
    port.onMessage.addListener((msg) => {
      if (msg?.type === 'view') {
        views.put(msg);
        return;
      }
      slot.collect?.postMessage(msg);
    });
    for (const msg of slot.queue) port.postMessage(msg);
    slot.queue = [];
    slot.collect?.postMessage({ type: 'go' });
  }
  port.onDisconnect.addListener(() => {
    if (slot.collect === port) slot.collect = null;
    if (slot.study === port) slot.study = null;
    if (!slot.collect && !slot.study) relays.delete(id);
  });
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === 'lume:state' && sender.tab?.id != null) {
    pjeTabId = sender.tab.id;
    sidePanel?.setOptions({ tabId: sender.tab.id, path: 'panel.html', enabled: true })?.catch(() => {});
  }
  if (msg?.type === 'lume:pje-tab') {
    reply({ tabId: pjeTabId });
    return true;
  }
  if (msg?.type === 'lume:study-here') {
    const tabId = sender.tab?.id;
    if (tabId == null) {
      reply({ ok: false });
      return true;
    }
    const studyId = crypto.randomUUID();
    chrome.tabs.sendMessage(tabId, { type: 'study', studyId }, () => {
      if (chrome.runtime.lastError) return;
      chrome.tabs.create({ url: chrome.runtime.getURL(`study.html?id=${studyId}&attach=0`) });
    });
    reply({ ok: true, studyId });
    return true;
  }
  if (msg?.type === 'lume:take-view') {
    const stored = views.take(msg.pageUrl);
    const parts = stored?.parts ?? [];
    const pageUrl = stored?.pageUrl ?? null;
    if (msg.all === true) {
      reply({
        allText: stored?.allText ?? '',
        total: parts.length,
        parts,
        pageUrl,
        documents: stored?.documents ?? 0,
        gaps: stored?.gaps ?? 0,
      });
      return true;
    }
    const wanted = Number(msg.part) || 1;
    const found = parts.find((item) => item.n === wanted) ?? null;
    reply({
      text: found?.text ?? '',
      part: found?.n ?? 0,
      total: parts.length,
      parts,
      allText: stored?.allText ?? '',
      pageUrl,
      documents: stored?.documents ?? 0,
      gaps: stored?.gaps ?? 0,
    });
    return true;
  }
  return false;
});
