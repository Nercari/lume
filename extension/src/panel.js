import { summarize } from './core.js';

const $ = (id) => document.getElementById(id);
const COUNTS = { identified: 'Identificados', processed: 'Processados', pending: 'Pendentes', failed: 'Falhas', restricted: 'Restritos', missing: 'Ausentes', unsupported: 'Não suportados' };
const STATUS = {
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
let tabId = null;
let epoch = -1;

async function ask(type) {
  if (tabId == null) return null;
  try { return await chrome.tabs.sendMessage(tabId, { type }); } catch { return null; }
}

async function bind() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  epoch = -1;
  render(await ask('status'));
}

function cell(row, value) { row.insertCell().textContent = value ?? '—'; }

function render(state) {
  if (!state) {
    $('case').textContent = '—';
    $('status').textContent = 'Esta aba não mostra um processo do PJe TRF1.';
    $('counts').replaceChildren(); $('items').replaceChildren();
    return;
  }
  if (state.epoch < epoch) return;
  epoch = state.epoch;
  const { view } = state;
  // Show an inventory only if it belongs to the case that is visible now.
  const inv = state.inventory?.caseNumber === view.caseNumber ? state.inventory : null;
  $('case').textContent = view.caseNumber ?? '—';
  const key = view.status !== 'case' ? view.status : inv ? (inv.stopReason ?? inv.status) : 'case';
  $('status').textContent = STATUS[key] ?? key;
  $('status').dataset.kind = inv?.status === 'stopped' || view.status !== 'case' ? 'stop' : '';
  const counts = summarize(inv);
  $('counts').replaceChildren(...Object.entries(COUNTS).flatMap(([k, label]) => {
    const dt = document.createElement('dt'); dt.textContent = label;
    const dd = document.createElement('dd'); dd.textContent = String(counts[k]);
    return [dt, dd];
  }));
  $('items').replaceChildren();
  for (const it of inv?.items ?? []) {
    const row = $('items').insertRow();
    for (const v of [it.id, it.version, it.kind === 'attachment' ? `anexo de ${it.parentId}` : 'documento', it.expectedPages, it.state, it.detail]) cell(row, v);
  }
  $('start').disabled = view.status !== 'case' || inv?.status === 'reading';
  $('stop').disabled = inv?.status !== 'reading';
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'lume:state' && sender.tab?.id === tabId) render(msg.state);
});
chrome.tabs.onActivated.addListener(bind);
$('start').addEventListener('click', async () => render(await ask('start')));
$('stop').addEventListener('click', async () => render(await ask('stop')));
bind();
