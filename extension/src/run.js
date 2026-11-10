// One case, in memory: notes per part, then relatório, then minuta.
// Checkpoints live in chrome.storage.session and are keyed by the case.
// A mismatch, an incomplete event, or a cut stream is INCOMPLETO, never pronto.

import { ResponseError } from './responses.js';

export const SIGNED_OUT_TEXT = 'Entre com ChatGPT no painel do Lume';
export const SIGILO_TEXT = 'Marca de sigilo neste processo. O aviso não impede gerar o relatório e a minuta.';
export const METHOD_FILES = [
  'jef-director.md',
  'jef-pacote.md',
  'jef-relatorio.md',
  'jef-voto.md',
  'jef-revisao.md',
];
export const PACKAGE_MARK = 'PACOTE';

const PAUSE_KINDS = new Set(['quota', 'usage_limit']);
const STOP_KINDS = new Set(['auth', 'signed_out', 'not_eligible', 'no_plan_scope', 'expired', 'region']);

export function presentSigilo(warning, flagged) {
  if (!warning) return;
  warning.hidden = !flagged;
  warning.textContent = flagged ? SIGILO_TEXT : '';
}

export function caseHasSigilo(items) {
  return (items ?? []).some((item) => item?.sigilo === true);
}

export async function loadMethodTexts(readFile) {
  const texts = {};
  for (const name of METHOD_FILES) texts[name] = await readFile(name);
  return texts;
}

export function methodMessages(texts) {
  return METHOD_FILES.map((name) => {
    const content = texts?.[name];
    if (typeof content !== 'string' || !content.trim()) {
      throw new ResponseError('failed', `método ausente: ${name}`);
    }
    return { role: 'developer', content };
  });
}

export function partText(part) {
  if (typeof part === 'string') return part;
  return String(part?.text ?? part?.body ?? '');
}

export function declaredIds(text) {
  const match = String(text).match(/^Ids:\s*(.*)$/m);
  if (!match) return [];
  return match[1].split(',').map((item) => item.trim()).filter(Boolean);
}

export function passageIds(text) {
  const ids = [];
  const seen = new Set();
  for (const match of String(text).matchAll(/^\[ID\s+([^,\]]+)/gm)) {
    const id = match[1].trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function citedIds(text) {
  return passageIds(text);
}

export function idsLidos(text) {
  const lines = String(text).split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return null;
  const match = /^IDS-LIDOS:\s*(.*)$/.exec(lines[lines.length - 1]);
  if (!match) return null;
  return match[1].split(',').map((item) => item.trim()).filter(Boolean);
}

export function indexIds(parts) {
  const lines = (parts ?? []).map(partText).join('\n').split('\n');
  const start = lines.findIndex((line) => line.trim() === 'Índice');
  if (start < 0) return [];
  const ids = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === 'Lacunas') break;
    if (!line.includes('|')) continue;
    const id = line.split('|')[0].trim();
    if (!id || id === 'ID') continue;
    ids.push(id);
  }
  return ids;
}

export function caseKeyOf(parts) {
  const text = (parts ?? []).map(partText).join('\n');
  const processo = (text.match(/^Processo:\s*(.*)$/m) || ['', ''])[1].trim();
  return `${processo}\n${indexIds(parts).join(',')}`;
}

export function checkpointKey(caseKey) {
  return `lume:run:${caseKey}`;
}

export function splitAtPassage(text) {
  const starts = [];
  for (const match of String(text).matchAll(/^\[ID\s+[^\]]+\]/gm)) starts.push(match.index);
  const cuts = starts.filter((index) => index > 0 && index < text.length);
  if (!cuts.length) return null;
  const mid = Math.floor(text.length / 2);
  let cut = cuts[0];
  for (const index of cuts) {
    if (Math.abs(index - mid) < Math.abs(cut - mid)) cut = index;
  }
  const left = text.slice(0, cut);
  const right = text.slice(cut);
  if (!left || !right || left + right !== text) return null;
  return { left, right };
}

export function divideIds(ids, left, right) {
  const rightTags = new Set(passageIds(right));
  const leftTags = new Set(passageIds(left));
  const leftIds = [];
  const rightIds = [];
  for (const id of ids ?? []) {
    if (rightTags.has(id) && !leftTags.has(id)) rightIds.push(id);
    else leftIds.push(id);
  }
  return { leftIds, rightIds };
}

function sectionText(text, startLabel, stop) {
  const lines = String(text).split('\n');
  const start = lines.findIndex((line) => line.trim() === startLabel);
  if (start < 0) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (stop && (line.trim() === stop || line.startsWith(stop))) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

function firstPartText(parts) {
  const found = (parts ?? []).find((part) => Number(part?.n) === 1) ?? parts?.[0];
  return partText(found);
}

function expectedOf(part) {
  const declared = declaredIds(partText(part));
  if (declared.length) return declared;
  if (Array.isArray(part?.ids)) return part.ids.map(String);
  return passageIds(partText(part));
}

function sameList(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

function sameSet(left, right) {
  if (left.length !== right.length) return false;
  const seen = new Set(right);
  if (seen.size !== right.length) return false;
  return left.every((id) => seen.has(id));
}

function notesContent(item) {
  return [
    'Etapa: notas desta parte do pacote lume-caso/1.',
    'Escreva notas com etiquetas [ID x, pág. y] apenas para os ids desta parte.',
    `Ids desta parte: ${item.expectedIds.join(', ')}`,
    'A última linha deve ser IDS-LIDOS: seguida desses ids, na mesma ordem, separados por vírgula.',
    PACKAGE_MARK,
    item.text,
  ].join('\n');
}

function relatorioContent(parts, notes) {
  const source = firstPartText(parts);
  return [
    'Etapa: relatório.',
    'Use somente as notas, o Índice e as Lacunas abaixo.',
    'Índice',
    sectionText(source, 'Índice', 'Lacunas'),
    'Lacunas',
    sectionText(source, 'Lacunas', '[ID'),
    'Notas',
    notes.map((note) => note.text).join('\n\n'),
  ].join('\n');
}

function minutaContent(relatorio, notes) {
  return [
    'Etapa: minuta.',
    'Redija a minuta a partir do relatório e das notas. Não invente id.',
    relatorio,
    notes.map((note) => note.text).join('\n\n'),
  ].join('\n');
}

export function statusLine(result) {
  if (result?.status === 'pronto') return 'pronto';
  if (result?.status === 'INCOMPLETO') return 'INCOMPLETO';
  if (result?.status === 'signed_out' || result?.status === 'auth') return SIGNED_OUT_TEXT;
  if (result?.status === 'cancelled') return 'Cancelado. Use Retomar.';
  if (result?.status === 'paused') return 'Pausado. Use Retomar.';
  if (result?.status === 'region') return 'A região da conta bloqueou o pedido.';
  if (result?.status === 'not_eligible' || result?.status === 'no_plan_scope') {
    return 'Esta conta não pode usar o plano ChatGPT aqui.';
  }
  if (result?.status === 'expired') return 'A sessão do ChatGPT expirou. Entre de novo no painel do Lume.';
  if (result?.status === 'empty') return 'Nada para retomar.';
  return 'INCOMPLETO';
}

export function chromeSessionStorage(storage = globalThis.chrome?.storage?.session) {
  return {
    async get(key) {
      const bag = await storage.get(key);
      return bag?.[key] ?? null;
    },
    async set(key, value) {
      await storage.set({ [key]: value });
    },
  };
}

function piece(item, text, expectedIds) {
  return {
    partN: item.partN,
    text,
    expectedIds,
  };
}

export async function runCase({
  parts,
  model,
  signal,
  onProgress,
  onDelta,
  storage,
  request,
  loadMethod,
  resumeOnly = false,
} = {}) {
  const caseKey = caseKeyOf(parts);
  const storageKey = checkpointKey(caseKey);
  const index = indexIds(parts);
  let stored = null;
  if (storage) stored = await storage.get(storageKey);
  if (stored && stored.caseKey !== caseKey) stored = null;
  if (!stored && resumeOnly) return { status: 'empty', caseKey };
  if (stored?.status === 'pronto') {
    return {
      status: 'pronto',
      caseKey,
      notes: stored.notes ?? [],
      relatorio: stored.relatorio ?? null,
      minuta: stored.minuta ?? null,
    };
  }

  const method = await loadMethod();
  const developer = methodMessages(method);
  const work = stored?.queue
    ? stored.queue.map((item) => ({ ...item, expectedIds: item.expectedIds.slice() }))
    : (parts ?? []).map((part) => piece({ partN: part?.n ?? 1 }, partText(part), expectedOf(part)));
  let cursor = stored?.cursor ?? 0;
  const notes = (stored?.notes ?? []).map((note) => ({ ...note }));
  let relatorio = stored?.relatorio ?? null;
  let minuta = stored?.minuta ?? null;
  let phase = stored?.phase ?? 'parts';
  let maxChars = stored?.maxChars ?? null;
  let splits = stored?.splits ?? 0;

  const snapshot = (status, reason) => ({
    caseKey,
    model,
    cursor,
    notes: notes.map((note) => ({ ...note })),
    relatorio,
    minuta,
    phase,
    maxChars,
    splits,
    status,
    reason: reason ?? status,
    queue: work.map((item) => ({ ...item, expectedIds: item.expectedIds.slice() })),
  });

  const save = async (status, reason) => {
    const checkpoint = snapshot(status, reason);
    if (storage) await storage.set(storageKey, structuredClone(checkpoint));
    return checkpoint;
  };

  const inputFor = (user) => [...developer, { role: 'user', content: user }];

  const fail = async (reason, message) => {
    await save('INCOMPLETO', reason);
    return { status: 'INCOMPLETO', reason, message: message ?? null, caseKey, notes, relatorio, minuta };
  };

  try {
    if (signal?.aborted) {
      await save('paused', 'cancelled');
      return { status: 'cancelled', caseKey, notes, relatorio, minuta };
    }

    if (phase === 'parts') {
      while (cursor < work.length) {
        if (signal?.aborted) {
          await save('paused', 'cancelled');
          return { status: 'cancelled', caseKey, notes, relatorio, minuta };
        }
        const item = work[cursor];
        if (maxChars != null && item.text.length > maxChars) {
          const split = splitAtPassage(item.text);
          if (split && split.left.length < item.text.length && split.right.length < item.text.length && splits < 64) {
            const ids = divideIds(item.expectedIds, split.left, split.right);
            splits += 1;
            work.splice(cursor, 1, piece(item, split.left, ids.leftIds), piece(item, split.right, ids.rightIds));
            continue;
          }
        }
        onProgress?.({ phase: 'parts', part: item.partN, index: cursor + 1, total: work.length });
        let text;
        try {
          const result = await request({
            model,
            input: inputFor(notesContent(item)),
            signal,
            onDelta,
          });
          text = typeof result === 'string' ? result : result?.text ?? '';
        } catch (error) {
          if (signal?.aborted || error?.name === 'AbortError' || error?.kind === 'cancelled') {
            await save('paused', 'cancelled');
            return { status: 'cancelled', caseKey, notes, relatorio, minuta };
          }
          if (error?.kind === 'context_too_long') {
            const split = splitAtPassage(item.text);
            if (!split || splits >= 64) return fail('context', error.message);
            const ids = divideIds(item.expectedIds, split.left, split.right);
            splits += 1;
            maxChars = Math.min(split.left.length, split.right.length);
            work.splice(cursor, 1, piece(item, split.left, ids.leftIds), piece(item, split.right, ids.rightIds));
            continue;
          }
          if (PAUSE_KINDS.has(error?.kind)) {
            await save('paused', error.kind);
            return { status: 'paused', reason: error.kind, caseKey, notes, relatorio, minuta };
          }
          if (STOP_KINDS.has(error?.kind)) {
            await save('paused', error.kind);
            return { status: error.kind, message: error.message, caseKey, notes, relatorio, minuta };
          }
          if (error?.kind === 'incomplete' || error?.kind === 'interrupted' || error?.kind === 'failed') {
            return fail(error.kind, error.message);
          }
          return fail(error?.kind || 'error', error?.message);
        }
        const lidos = idsLidos(text);
        if (!lidos || !sameList(lidos, item.expectedIds)) return fail('ids-lidos');
        notes.push({ partN: item.partN, text, idsLidos: lidos, expectedIds: item.expectedIds.slice() });
        maxChars = maxChars == null ? item.text.length : Math.min(maxChars, item.text.length);
        cursor += 1;
        await save('running', 'parts');
      }
      const processed = notes.flatMap((note) => note.expectedIds);
      if (!sameSet(processed, index)) return fail('index');
      phase = 'relatorio';
      await save('running', 'relatorio');
    }

    if (phase === 'relatorio') {
      if (signal?.aborted) {
        await save('paused', 'cancelled');
        return { status: 'cancelled', caseKey, notes, relatorio, minuta };
      }
      onProgress?.({ phase: 'relatorio', part: null, index: 0, total: work.length });
      try {
        const result = await request({
          model,
          input: inputFor(relatorioContent(parts, notes)),
          signal,
          onDelta,
        });
        relatorio = typeof result === 'string' ? result : result?.text ?? '';
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError' || error?.kind === 'cancelled') {
          await save('paused', 'cancelled');
          return { status: 'cancelled', caseKey, notes, relatorio, minuta };
        }
        if (PAUSE_KINDS.has(error?.kind)) {
          await save('paused', error.kind);
          return { status: 'paused', reason: error.kind, caseKey, notes, relatorio, minuta };
        }
        if (STOP_KINDS.has(error?.kind)) {
          await save('paused', error.kind);
          return { status: error.kind, message: error.message, caseKey, notes, relatorio, minuta };
        }
        return fail(error?.kind || 'interrupted', error?.message);
      }
      phase = 'minuta';
      await save('running', 'minuta');
    }

    if (phase === 'minuta') {
      if (signal?.aborted) {
        await save('paused', 'cancelled');
        return { status: 'cancelled', caseKey, notes, relatorio, minuta };
      }
      onProgress?.({ phase: 'minuta', part: null, index: 0, total: work.length });
      try {
        const result = await request({
          model,
          input: inputFor(minutaContent(relatorio ?? '', notes)),
          signal,
          onDelta,
        });
        minuta = typeof result === 'string' ? result : result?.text ?? '';
      } catch (error) {
        if (signal?.aborted || error?.name === 'AbortError' || error?.kind === 'cancelled') {
          await save('paused', 'cancelled');
          return { status: 'cancelled', caseKey, notes, relatorio, minuta };
        }
        if (PAUSE_KINDS.has(error?.kind)) {
          await save('paused', error.kind);
          return { status: 'paused', reason: error.kind, caseKey, notes, relatorio, minuta };
        }
        if (STOP_KINDS.has(error?.kind)) {
          await save('paused', error.kind);
          return { status: error.kind, message: error.message, caseKey, notes, relatorio, minuta };
        }
        return fail(error?.kind || 'interrupted', error?.message);
      }
      const cited = citedIds([notes.map((note) => note.text).join('\n'), relatorio, minuta].join('\n'));
      const known = new Set(index);
      if (cited.some((id) => !known.has(id))) return fail('cited');
      phase = 'done';
      await save('pronto', 'done');
      return { status: 'pronto', caseKey, notes, relatorio, minuta };
    }
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError' || error?.kind === 'cancelled') {
      await save('paused', 'cancelled');
      return { status: 'cancelled', caseKey, notes, relatorio, minuta };
    }
    return fail(error?.kind || 'error', error?.message);
  }
  return fail('phase');
}
