import { createPanelSync, panelView } from './core.js';

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
  $('status').textContent = STATUS[v.statusKey] ?? v.statusKey;
  $('status').dataset.kind = v.stop ? 'stop' : '';
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
  $('pdf-hint').hidden = v.statusKey !== 'not_pje';
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'lume:state' && sender.tab?.id === tabId) show(msg.state);
});
chrome.tabs.onActivated.addListener(bind);
// changeInfo.status needs no "tabs" permission. A load clears the inventory; when it ends, the
// panel asks the new page. Outside PJe nothing answers, so the panel shows not_pje and the PDF hint.
chrome.tabs.onUpdated.addListener(async (id, info) => {
  if (id !== tabId) return;
  if (info.status === 'loading' && sync.navigated(id)) render(panelView(null));
  if (info.status === 'complete') show(await ask('status'));
});
$('start').addEventListener('click', async () => show(await ask('start')));
$('stop').addEventListener('click', async () => show(await ask('stop')));
$('pdf-mode').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('manual/lume-pdf.html') });
});
bind();
