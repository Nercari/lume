import { CALIBRATION_DOWNLOAD_NAME, calibrationReport } from './calibrate.js';
import { createPanelSync, panelView } from './core.js';
import { DOCUMENT_PAUSE_MS } from './page-trigger.js';
import { CALIBRATION_HINT, ERROR_COPY, validateStoredProfile } from './profile.js';
const $ = (id) => document.getElementById(id);
const COUNTS = { identified: 'Identificados', processed: 'Processados', pending: 'Pendentes', failed: 'Falhas', restricted: 'Restritos', missing: 'Ausentes', unsupported: 'Não suportados' };
const STATUS = {
  not_pje: 'Esta aba não mostra um processo do PJe TRF1.',
  case: 'Pronto para ler.',
  session_expired: 'Sessão do PJe expirada. Entre novamente no PJe e reinicie a leitura.',
  incompatible_layout: 'Layout do PJe não reconhecido. A leitura parou com segurança.',
  error: 'Página não reconhecida.',
  reading: 'Lendo…',
  complete: 'Inventário completo.',
  incomplete: 'Inventário incompleto: há páginas da lista não lidas.',
  invalidated: 'O processo ou a navegação mudou. O trabalho anterior foi descartado.',
  inventory_changed: 'A lista de documentos mudou durante a leitura. Reinicie a leitura.',
  stopped_by_user: 'Leitura interrompida.',
};
const sync = createPanelSync();
let tabId = null;
let lastSnap = null;
let blobUrl = null;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ask(type, extra = {}) {
  if (tabId == null) return null;
  try { return await chrome.tabs.sendMessage(tabId, { type, ...extra }); } catch { return null; }
}

function show(state) {
  if (state && !sync.accept(tabId, state)) return;
  render(panelView(state));
}

async function bind() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const known = await chrome.runtime.sendMessage({ type: 'lume:pje-tab' }).catch(() => null);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeId = tab?.id ?? null;
    const candidates = [];
    if (activeId != null) candidates.push(activeId);
    if (known?.tabId != null && known.tabId !== activeId) candidates.push(known.tabId);
    for (const id of candidates) {
      try {
        const state = await chrome.tabs.sendMessage(id, { type: 'status' });
        if (state) {
          tabId = id;
          sync.bind(id);
          show(state);
          return;
        }
      } catch { /* this tab has no content script yet */ }
    }
    await delay(250);
  }
  tabId = null;
  show(null);
}

function cell(row, value) { row.insertCell().textContent = value ?? '—'; }

function render(v) {
  $('case').textContent = v.caseNumber ?? '—';
  const specific = v.failedRole ? ERROR_COPY[v.failedRole] : null;
  $('status').textContent = specific || STATUS[v.statusKey] || v.statusKey;
  $('status').dataset.kind = v.stop ? 'stop' : '';
  $('hint').hidden = !v.showHint;
  if (v.showHint) $('hint').textContent = CALIBRATION_HINT;
  $('unverified').hidden = !v.unverified;
  $('counts').replaceChildren(...Object.entries(COUNTS).flatMap(([k, label]) => {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = String(v.counts[k]);
    return [dt, dd];
  }));
  $('items').replaceChildren();
  for (const it of v.items) {
    const row = $('items').insertRow();
    for (const x of [it.id, it.version, it.kind === 'attachment' ? `anexo de ${it.parentId}` : 'documento', it.expectedPages, it.state, it.detail]) cell(row, x);
  }
  $('study').disabled = !v.canStart;
  $('start').disabled = !v.canStart;
  $('stop').disabled = !v.canStop;
  $('pdf-hint').hidden = v.statusKey !== 'not_pje';
}

function note(text) { $('cal-action').textContent = text; }

function armDownload() {
  if (!lastSnap) return;
  const blob = new Blob([JSON.stringify(lastSnap, null, 2)], { type: 'application/json' });
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(blob);
  $('cal-download').href = blobUrl;
  $('cal-download').download = CALIBRATION_DOWNLOAD_NAME;
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'lume:state' && sender.tab?.id === tabId) show(msg.state);
  if (msg?.type === 'lume:calibration') {
    lastSnap = msg.state;
    $('cal-summary').textContent = calibrationReport(lastSnap);
    armDownload();
  }
});
chrome.tabs.onActivated.addListener(bind);
chrome.tabs.onUpdated.addListener(async (id, info) => {
  if (id !== tabId) return;
  if (info.status === 'loading' && sync.navigated(id)) render(panelView(null));
  if (info.status === 'complete') show(await ask('status'));
});
$('study').addEventListener('click', async () => {
  const studyId = crypto.randomUUID();
  const ack = await ask('study', { studyId });
  if (!ack?.ok) {
    note('Não foi possível iniciar o estudo nesta aba.');
    return;
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL(`study.html?id=${studyId}&attach=0`) });
});
$('start').addEventListener('click', async () => show(await ask('start')));
$('stop').addEventListener('click', async () => show(await ask('stop')));
$('package-mode').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('manual/lume-pdf.html') });
});
$('calibrate').addEventListener('click', async (ev) => {
  ev.preventDefault();
  $('calibration').hidden = false;
  $('cal-send').hidden = true;
  const snap = await ask('calibrate');
  if (!snap || snap.error || !Array.isArray(snap.frames)) {
    lastSnap = null;
    $('cal-summary').textContent = 'Não foi possível ler a estrutura desta aba. Abra um processo no PJe.';
    return;
  }
  lastSnap = snap;
  $('cal-summary').textContent = calibrationReport(snap);
  armDownload();
  note('Clique um documento e, se existir, o botão de baixar os autos. Depois salve.');
});
$('cal-download').addEventListener('click', (ev) => {
  if (!lastSnap) {
    ev.preventDefault();
    note('Nada para baixar. Abra Calibrar PJe de novo.');
    return;
  }
  armDownload();
  $('cal-send').hidden = false;
  note('envie este arquivo ao Grok');
});
$('cal-copy').addEventListener('click', async () => {
  if (!lastSnap) { note('Nada para copiar. Abra Calibrar PJe de novo.'); return; }
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastSnap, null, 2));
    note('JSON copiado. envie este arquivo ao Grok');
  } catch {
    note('Não foi possível copiar.');
  }
});
$('cal-profile').addEventListener('change', async () => {
  const file = $('cal-profile').files?.[0];
  $('cal-profile').value = '';
  if (!file) return;
  if (file.size > 100_000) { note('Arquivo grande demais.'); return; }
  let parsed;
  try { parsed = JSON.parse(await file.text()); }
  catch { note('JSON inválido.'); return; }
  const verdict = validateStoredProfile(parsed);
  if (!verdict.ok) { note(verdict.error); return; }
  try {
    await chrome.storage.local.set({ lumeProfile: verdict.profile });
    note('Perfil carregado. Ele passa a ser o primeiro candidato.');
  } catch {
    note('Não foi possível guardar o perfil.');
  }
});
async function loadPause() {
  try {
    const stored = await chrome.storage.local.get('lumePauseMs');
    $('pausa').checked = stored?.lumePauseMs == null || Number(stored.lumePauseMs) > 0;
  } catch {
    $('pausa').checked = true;
  }
}

$('pausa').addEventListener('change', () => {
  chrome.storage.local.set({ lumePauseMs: $('pausa').checked ? DOCUMENT_PAUSE_MS : 0 }).catch(() => {});
});
loadPause();
bind();
