export const DEFAULT_PROJECT_URL = 'https://chatgpt.com/';

export function projectUrlOrDefault(raw) {
  if (raw == null || raw === '') return { ok: true, url: DEFAULT_PROJECT_URL };
  let url;
  try { url = new URL(String(raw)); } catch { return { ok: false, error: 'URL inválida.' }; }
  if (url.protocol !== 'https:' || url.hostname !== 'chatgpt.com') {
    return { ok: false, error: 'Use um endereço https://chatgpt.com/ do Projeto Lume.' };
  }
  return { ok: true, url: url.href };
}
