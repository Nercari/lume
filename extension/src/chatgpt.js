// Runs on chatgpt.com. Puts the part files on the composer input and fills the
// prompt. It does not press send.

export const CHATGPT_SELECTORS = Object.freeze({
  root: '[data-lume-composer]',
  file: 'input[type="file"]',
  prompt: 'textarea',
  send: '[data-lume-send]',
});

export function studyPrompt(count) {
  const n = Number(count) || 0;
  return `Estudo integral: leia todas as ${n} partes anexadas antes de qualquer minuta.`;
}

export function composerTargets(doc) {
  const root = doc.querySelector(CHATGPT_SELECTORS.root);
  if (!root) return null;
  const file = root.querySelector(CHATGPT_SELECTORS.file);
  const prompt = root.querySelector(CHATGPT_SELECTORS.prompt);
  if (!file || !prompt) return null;
  return { root, file, prompt, send: root.querySelector(CHATGPT_SELECTORS.send) };
}

export function attachToComposer(doc, parts, createTransfer = () => new DataTransfer()) {
  const targets = composerTargets(doc);
  if (!targets) return { ok: false, reason: 'composer-missing', sent: false, files: 0 };
  const transfer = createTransfer();
  for (const part of parts) {
    transfer.items.add(new File([part.text ?? ''], part.name, { type: 'text/markdown' }));
  }
  targets.file.files = transfer.files;
  targets.file.dispatchEvent(new Event('change', { bubbles: true }));
  try {
    targets.file.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  } catch { /* a missing drop constructor still leaves the file list on the input */ }
  targets.prompt.value = studyPrompt(parts.length);
  targets.prompt.dispatchEvent(new Event('input', { bubbles: true }));
  return { ok: true, reason: null, sent: false, files: transfer.files?.length ?? parts.length };
}

function report(result) {
  try { document.documentElement.dataset.lumeAttach = result.ok ? 'attached' : (result.reason || 'failed'); } catch { /* the page may already be gone */ }
  chrome.runtime.sendMessage({ type: 'lume:attached', ok: result.ok, reason: result.reason, files: result.files, sent: false });
}

function take(attempt) {
  chrome.runtime.sendMessage({ type: 'lume:take-parts' }, (res) => {
    const parts = res?.parts ?? [];
    if (!parts.length) {
      if (attempt < 20) setTimeout(() => take(attempt + 1), 300);
      else report({ ok: false, reason: 'no-parts', files: 0 });
      return;
    }
    if (!composerTargets(document)) {
      if (attempt < 20) setTimeout(() => take(attempt + 1), 300);
      else report({ ok: false, reason: 'composer-missing', files: 0 });
      return;
    }
    try {
      report(attachToComposer(document, parts));
    } catch {
      report({ ok: false, reason: 'attach-threw', files: 0 });
    }
  });
}

if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
  try { document.documentElement.dataset.lumeAttach = 'started'; } catch { /* not a document yet */ }
  take(0);
}
