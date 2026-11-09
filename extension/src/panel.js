import { calibrationFilename, calibrationReport } from './calibrate.js';
import { createPanelSync, panelView } from './core.js';
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

async function ask(type) {
  if (tabId == null) return null;
  try { return await chrome.tabs.sendMessage(tabId, { type }); } catch { return null; }
}

// A null state (no content script answered) always clears the panel.
function show(state) {
  if (state && !sync.accept(tabId, state)) return;
  render(panelView(state));
}

async function bind() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  sync.bind(tabId);
  show(await ask('status'));
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
  $('start').disabled = !v.canStart;
  $('stop').disabled = !v.canStop;
}

function note(text) { $('cal-action').textContent = text; }

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'lume:state' && sender.tab?.id === tabId) show(msg.state);
});
chrome.tabs.onActivated.addListener(bind);
// changeInfo.status needs no "tabs" permission. A load clears the panel; when it ends, the panel
// asks the new page, and a page without the content script (outside PJe) leaves it cleared.
chrome.tabs.onUpdated.addListener(async (id, info) => {
  if (id !== tabId) return;
  if (info.status === 'loading' && sync.navigated(id)) render(panelView(null));
  if (info.status === 'complete') show(await ask('status'));
});
$('start').addEventListener('click', async () => show(await ask('start')));
$('stop').addEventListener('click', async () => show(await ask('stop')));
$('calibrate').addEventListener('click', async () => {
  $('calibration').hidden = false;
  const snap = await ask('calibrate');
  if (!snap || snap.error || !Array.isArray(snap.frames)) {
    lastSnap = null;
    $('cal-summary').textContent = 'Não foi possível ler a estrutura desta aba. Abra um processo no PJe.';
    return;
  }
  lastSnap = snap;
  $('cal-summary').textContent = calibrationReport(snap);
  note('');
});
$('cal-download').addEventListener('click', (ev) => {
  if (!lastSnap) { ev.preventDefault(); note('Nada para baixar. Abra o Modo calibração de novo.'); return; }
  const blob = new Blob([JSON.stringify(lastSnap, null, 2)], { type: 'application/json' });
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(blob);
  ev.currentTarget.href = blobUrl;
  ev.currentTarget.download = calibrationFilename(new Date());
});
$('cal-copy').addEventListener('click', async () => {
  if (!lastSnap) { note('Nada para copiar. Abra o Modo calibração de novo.'); return; }
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastSnap, null, 2));
    note('JSON copiado.');
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
bind();
