import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ResponseError } from '../src/responses.js';
import {
  METHOD_FILES,
  PACKAGE_MARK,
  caseKeyOf,
  checkpointKey,
  divideIds,
  methodMessages,
  runCase,
  splitAtPassage,
  statusLine,
} from '../src/run.js';

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : null;
    },
    async set(key, value) {
      map.set(key, structuredClone(value));
    },
  };
}

function method() {
  return Object.fromEntries(METHOD_FILES.map((name) => [name, `texto do método ${name}\n`]));
}

function part({ n, total, ids, indexIds = ids, processo = 'TEST-CASE-A', passages, withIndex = false }) {
  const lines = [
    '---',
    'formato: lume-caso/1',
    `processo: ${processo}`,
    `parte: ${n}`,
    `total: ${total}`,
    `ids: ${ids.join(', ')}`,
    'origem: botao',
    '---',
    'lume-caso/1',
    `Processo: ${processo}`,
    'Órgão: —',
    'Gerado em: 2026-01-01T00:00:00Z',
    'Origem: botao',
    'Contagens: 1 documentos, 1 trechos, 0 lacunas',
    '',
    `Parte ${n} de ${total}`,
    `Ids: ${ids.join(', ')}`,
    '',
  ];
  if (withIndex) {
    lines.push('Índice', 'ID | Tipo | Data | Págs. do documento | Situação');
    for (const id of indexIds) lines.push(`${id} | outros | — | 1 | lido`);
    lines.push('', 'Lacunas', '- nenhuma', '');
  }
  for (const passage of passages) lines.push(passage.tag, passage.text, '');
  return { n, total, ids, text: `${lines.join('\n')}\n` };
}

function packOf(user) {
  const mark = `\n${PACKAGE_MARK}\n`;
  const at = user.indexOf(mark);
  assert.notEqual(at, -1);
  return user.slice(at + mark.length);
}

function noteFor(user) {
  const ids = (user.match(/Ids desta parte: (.*)/) || [])[1];
  const tags = [...user.matchAll(/^\[ID [^\]]+\]/gm)].map((match) => match[0]);
  return `${tags.join('\n')}\nIDS-LIDOS: ${ids}`;
}

function baseRequest(extra = {}) {
  return async ({ input }) => {
    const roles = input.map((item) => item.role);
    assert.equal(roles.includes('system'), false);
    assert.deepEqual(roles.slice(0, METHOD_FILES.length), METHOD_FILES.map(() => 'developer'));
    const user = input.find((item) => item.role === 'user').content;
    if (user.startsWith('Etapa: notas')) return noteFor(user);
    if (user.startsWith('Etapa: relatório')) return 'Relatório sintético.\n[ID D1, pág. 1]';
    if (user.startsWith('Etapa: minuta')) return 'Minuta sintética.\n[ID D1, pág. 1]';
    throw new Error(`etapa desconhecida ${extra.label ?? ''}`);
  };
}

test('a passage split is lossless and stays on a tag boundary', () => {
  const text = 'cabeça\n[ID D1, pág. 1]\naaa\n[ID D2, pág. 2]\nbbb\n';
  const split = splitAtPassage(text);
  assert.equal(split.left + split.right, text);
  assert.match(split.right, /^\[ID /);
  assert.equal(splitAtPassage('sem etiqueta\n'), null);
  const ids = divideIds(['D1', 'D2'], split.left, split.right);
  assert.deepEqual(ids.leftIds, ['D1']);
  assert.deepEqual(ids.rightIds, ['D2']);
});

test('a matching run is pronto only after notes, relatório and minuta', async () => {
  const parts = [
    part({
      n: 1,
      total: 1,
      ids: ['D1'],
      withIndex: true,
      passages: [{ tag: '[ID D1, pág. 1]', text: 'trecho sintético' }],
    }),
  ];
  const seen = [];
  const storage = memoryStorage();
  const result = await runCase({
    parts,
    model: 'slug-a',
    storage,
    loadMethod: async () => method(),
    request: async (args) => {
      const user = args.input.find((item) => item.role === 'user').content;
      seen.push(user);
      assert.equal(args.input.some((item) => item.role === 'system'), false);
      assert.deepEqual(methodMessages(method()).map((item) => item.content), args.input.filter((item) => item.role === 'developer').map((item) => item.content));
      return baseRequest()(args);
    },
  });
  assert.equal(result.status, 'pronto');
  assert.equal(statusLine(result), 'pronto');
  assert.match(seen[1], /Índice/);
  assert.match(seen[1], /Lacunas/);
  assert.match(seen[1], /IDS-LIDOS: D1/);
  assert.match(seen[2], /Relatório sintético/);
  assert.equal(seen.some((user) => user.includes('previous_response_id')), false);
  const saved = await storage.get(checkpointKey(caseKeyOf(parts)));
  assert.equal(saved.status, 'pronto');
  assert.equal(saved.caseKey, caseKeyOf(parts));
});

test('IDS-LIDOS mismatch is INCOMPLETO and does not continue', async () => {
  const parts = [
    part({
      n: 1,
      total: 1,
      ids: ['D1'],
      withIndex: true,
      passages: [{ tag: '[ID D1, pág. 1]', text: 'trecho' }],
    }),
  ];
  let calls = 0;
  const result = await runCase({
    parts,
    model: 'slug-a',
    storage: memoryStorage(),
    loadMethod: async () => method(),
    request: async () => {
      calls += 1;
      return 'nota\nIDS-LIDOS: Z9';
    },
  });
  assert.equal(result.status, 'INCOMPLETO');
  assert.equal(result.status.includes('pronto'), false);
  assert.equal(calls, 1);
});

test('a cited id outside the index is INCOMPLETO', async () => {
  const parts = [
    part({
      n: 1,
      total: 1,
      ids: ['D1'],
      withIndex: true,
      passages: [{ tag: '[ID D1, pág. 1]', text: 'trecho' }],
    }),
  ];
  const result = await runCase({
    parts,
    model: 'slug-a',
    storage: memoryStorage(),
    loadMethod: async () => method(),
    request: async (args) => {
      const user = args.input.find((item) => item.role === 'user').content;
      if (user.startsWith('Etapa: minuta')) return 'Minuta.\n[ID Z9, pág. 1]';
      return baseRequest()(args);
    },
  });
  assert.equal(result.status, 'INCOMPLETO');
  assert.equal(result.reason, 'cited');
});

test('quota pauses with the checkpoint and resume does not mix or repeat the finished part', async () => {
  const parts = [
    part({
      n: 1,
      total: 2,
      ids: ['D1'],
      indexIds: ['D1', 'D2'],
      withIndex: true,
      passages: [{ tag: '[ID D1, pág. 1]', text: 'TOKEN-PARTE-1' }],
    }),
    part({
      n: 2,
      total: 2,
      ids: ['D2'],
      withIndex: false,
      passages: [{ tag: '[ID D2, pág. 1]', text: 'TOKEN-PARTE-2' }],
    }),
  ];
  const storage = memoryStorage({ 'lume:run:OTHER\nD9': { caseKey: 'OTHER\nD9', status: 'paused', notes: [{ text: 'alheia' }] } });
  const otherBefore = structuredClone(storage.map.get('lume:run:OTHER\nD9'));
  let quota = true;
  const request = async (args) => {
    const user = args.input.find((item) => item.role === 'user').content;
    if (user.includes('TOKEN-PARTE-2') && quota) {
      const saved = await storage.get(checkpointKey(caseKeyOf(parts)));
      assert.equal(saved.notes.length, 1);
      assert.match(saved.notes[0].text, /IDS-LIDOS: D1/);
      throw new ResponseError('quota', 'subscription_sharing_usage_limit_exceeded');
    }
    return baseRequest()(args);
  };
  const paused = await runCase({
    parts,
    model: 'slug-a',
    storage,
    loadMethod: async () => method(),
    request,
  });
  assert.equal(paused.status, 'paused');
  assert.equal(paused.status.includes('pronto'), false);
  assert.equal(statusLine(paused), 'Pausado. Use Retomar.');
  quota = false;
  const sent = [];
  const resumed = await runCase({
    parts,
    model: 'slug-a',
    storage,
    resumeOnly: true,
    loadMethod: async () => method(),
    request: async (args) => {
      const user = args.input.find((item) => item.role === 'user').content;
      sent.push(user);
      return baseRequest()(args);
    },
  });
  assert.equal(resumed.status, 'pronto');
  assert.equal(sent.some((user) => user.includes('TOKEN-PARTE-1')), false);
  assert.equal(sent.some((user) => user.includes('TOKEN-PARTE-2')), true);
  assert.deepEqual(storage.map.get('lume:run:OTHER\nD9'), otherBefore);
});

test('cancel aborts and resume continues inside the same case', async () => {
  const parts = [
    part({
      n: 1,
      total: 2,
      ids: ['D1'],
      indexIds: ['D1', 'D2'],
      withIndex: true,
      passages: [{ tag: '[ID D1, pág. 1]', text: 'TOKEN-PARTE-1' }],
    }),
    part({
      n: 2,
      total: 2,
      ids: ['D2'],
      passages: [{ tag: '[ID D2, pág. 1]', text: 'TOKEN-PARTE-2' }],
    }),
  ];
  const storage = memoryStorage();
  const controller = new AbortController();
  const cancelled = await runCase({
    parts,
    model: 'slug-a',
    signal: controller.signal,
    storage,
    loadMethod: async () => method(),
    request: async (args) => {
      const user = args.input.find((item) => item.role === 'user').content;
      if (user.includes('TOKEN-PARTE-2')) {
        controller.abort();
        throw Object.assign(new Error('aborted'), { name: 'AbortError' });
      }
      return baseRequest()(args);
    },
  });
  assert.equal(cancelled.status, 'cancelled');
  assert.notEqual(cancelled.status, 'INCOMPLETO');
  assert.notEqual(cancelled.status, 'pronto');
  const resumed = await runCase({
    parts,
    model: 'slug-a',
    storage,
    resumeOnly: true,
    loadMethod: async () => method(),
    request: baseRequest(),
  });
  assert.equal(resumed.status, 'pronto');
});

test('a context error splits on a passage tag, retries, and the pieces join to the original', async () => {
  const passages = [
    { tag: '[ID D1, pág. 1]', text: 'a'.repeat(180) },
    { tag: '[ID D2, pág. 2]', text: 'b'.repeat(180) },
  ];
  const one = part({ n: 1, total: 1, ids: ['D1', 'D2'], withIndex: true, passages });
  const original = one.text;
  const packs = [];
  let contextErrors = 0;
  const result = await runCase({
    parts: [one],
    model: 'slug-a',
    storage: memoryStorage(),
    loadMethod: async () => method(),
    request: async (args) => {
      const user = args.input.find((item) => item.role === 'user').content;
      if (user.startsWith('Etapa: notas')) {
        const pack = packOf(user);
        if (pack.length >= original.length) {
          contextErrors += 1;
          throw new ResponseError('context_too_long', 'maximum context length');
        }
        packs.push(pack);
        return noteFor(user);
      }
      if (user.startsWith('Etapa: relatório')) return 'Relatório sintético.\n[ID D1, pág. 1]';
      return 'Minuta sintética.\n[ID D1, pág. 1]';
    },
  });
  assert.equal(contextErrors, 1);
  assert.equal(packs.join(''), original);
  assert.equal(result.status, 'pronto');
  const again = splitAtPassage(original);
  assert.equal(again.left + again.right, original);
});

test('a cut stream is INCOMPLETO', async () => {
  const parts = [
    part({
      n: 1,
      total: 1,
      ids: ['D1'],
      withIndex: true,
      passages: [{ tag: '[ID D1, pág. 1]', text: 'trecho' }],
    }),
  ];
  const result = await runCase({
    parts,
    model: 'slug-a',
    storage: memoryStorage(),
    loadMethod: async () => method(),
    request: async () => {
      throw new ResponseError('interrupted', 'o fluxo terminou sem response.completed');
    },
  });
  assert.equal(result.status, 'INCOMPLETO');
  assert.equal(result.reason, 'interrupted');
  assert.equal(statusLine(result), 'INCOMPLETO');
});

test('resume with no checkpoint does not send the case', async () => {
  let calls = 0;
  const result = await runCase({
    parts: [part({
      n: 1,
      total: 1,
      ids: ['D1'],
      withIndex: true,
      passages: [{ tag: '[ID D1, pág. 1]', text: 'trecho' }],
    })],
    model: 'slug-a',
    storage: memoryStorage(),
    resumeOnly: true,
    loadMethod: async () => method(),
    request: async () => { calls += 1; return 'IDS-LIDOS: D1'; },
  });
  assert.equal(result.status, 'empty');
  assert.equal(calls, 0);
});
