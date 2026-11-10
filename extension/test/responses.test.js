import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FORBIDDEN_PARAMS,
  MODELS_URL,
  RESPONSES_URL,
  ResponseError,
  createResponse,
  listModels,
  modelPreferenceKey,
} from '../src/responses.js';
import { getAccess } from '../src/siwc-client.js';
import { completedSse, cutSse, failedSse, incompleteSse, quotaSse } from './fixtures/sse.js';

const TOKEN = 'synthetic-access-token';

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req_test' },
  });
}

function sseResponse(text, status = 200) {
  return new Response(text, { status, headers: { 'content-type': 'text/event-stream' } });
}

function scriptedFetch(steps) {
  const calls = [];
  let index = 0;
  return {
    calls,
    async fetchImpl(url, init) {
      calls.push({ url, init });
      const step = steps[Math.min(index, steps.length - 1)];
      index += 1;
      return step(url, init);
    },
  };
}

function accessOk(token = TOKEN) {
  return async () => ({ ok: true, accessToken: token, accountId: 'acct_test', expiresAt: 1 });
}

test('getAccess asks the worker and does not take a token argument', async () => {
  const calls = [];
  const previous = globalThis.chrome;
  globalThis.chrome = {
    runtime: {
      sendMessage: async (msg) => {
        calls.push(msg);
        return { ok: false, code: 'signed_out', message: 'fora' };
      },
    },
  };
  try {
    const result = await getAccess();
    assert.deepEqual(calls, [{ type: 'lume:siwc-access' }]);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'signed_out');
  } finally {
    if (previous === undefined) delete globalThis.chrome;
    else globalThis.chrome = previous;
  }
});

test('listModels keeps server order and drops anything that is not visibility list', async () => {
  const transport = scriptedFetch([
    () => jsonResponse(200, {
      models: [
        { slug: 'slug-b', display_name: 'Modelo B', visibility: 'list' },
        { slug: 'slug-hidden', display_name: 'Oculto', visibility: 'hidden' },
        { slug: 'slug-a', display_name: 'Modelo A', visibility: 'list' },
      ],
    }),
  ]);
  const models = await listModels({ accessToken: TOKEN, fetchImpl: transport.fetchImpl });
  assert.deepEqual(models, [
    { slug: 'slug-b', displayName: 'Modelo B' },
    { slug: 'slug-a', displayName: 'Modelo A' },
  ]);
  assert.equal(transport.calls[0].url, MODELS_URL);
  assert.equal(transport.calls[0].init.method, 'GET');
  assert.equal(transport.calls[0].init.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(modelPreferenceKey('acct_test'), 'lume:model:acct_test');
});

test('an empty catalog stays empty', async () => {
  const transport = scriptedFetch([() => jsonResponse(200, { models: [] })]);
  const models = await listModels({ accessToken: TOKEN, fetchImpl: transport.fetchImpl });
  assert.deepEqual(models, []);
});

test('completed SSE is the only success, including a split chunk', async () => {
  const cut = Math.floor(completedSse.length / 2);
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(completedSse.slice(0, cut)));
      controller.enqueue(encoder.encode(completedSse.slice(cut)));
      controller.close();
    },
  });
  const deltas = [];
  const transport = scriptedFetch([
    () => new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
  ]);
  const result = await createResponse({
    model: 'slug-a',
    input: [{ role: 'user', content: 'diga olá' }],
    accessToken: TOKEN,
    fetchImpl: transport.fetchImpl,
    onDelta: (delta) => deltas.push(delta),
  });
  assert.equal(result.text, 'Olá');
  assert.deepEqual(deltas, ['Olá']);
  const body = JSON.parse(transport.calls[0].init.body);
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.equal(body.model, 'slug-a');
  assert.deepEqual(body.input, [{ role: 'user', content: 'diga olá' }]);
  assert.equal(Object.hasOwn(body, 'previous_response_id'), false);
  assert.equal(transport.calls[0].url, RESPONSES_URL);
  assert.equal(transport.calls[0].init.headers['Content-Type'], 'application/json');
  assert.equal(transport.calls[0].init.credentials, 'omit');
  assert.equal(transport.calls[0].init.headers['x-api-key'], undefined);
});

test('incomplete, failed, and cut streams are typed and are not success', async () => {
  const cases = [
    [incompleteSse, 'incomplete'],
    [failedSse, 'failed'],
    [cutSse, 'interrupted'],
  ];
  for (const [body, kind] of cases) {
    const transport = scriptedFetch([() => sseResponse(body)]);
    await assert.rejects(
      () => createResponse({
        model: 'slug-a',
        input: [{ role: 'user', content: 'oi' }],
        accessToken: TOKEN,
        fetchImpl: transport.fetchImpl,
      }),
      (error) => error instanceof ResponseError && error.kind === kind,
    );
  }
});

test('a usage limit after a delta is quota and keeps the partial callback', async () => {
  const deltas = [];
  const transport = scriptedFetch([() => sseResponse(quotaSse)]);
  await assert.rejects(
    () => createResponse({
      model: 'slug-a',
      input: [{ role: 'user', content: 'oi' }],
      accessToken: TOKEN,
      fetchImpl: transport.fetchImpl,
      onDelta: (delta) => deltas.push(delta),
    }),
    (error) => error instanceof ResponseError && error.kind === 'quota' && error.code === 'subscription_sharing_usage_limit_exceeded',
  );
  assert.deepEqual(deltas, ['parcial']);
});

test('401 refreshes access once and then stops', async () => {
  let reads = 0;
  const transport = scriptedFetch([
    () => jsonResponse(401, { error: { code: 'subscription_sharing_invalid_user', message: 'no' } }),
    () => jsonResponse(401, { error: { message: 'still no' } }),
  ]);
  await assert.rejects(
    () => createResponse({
      model: 'slug-a',
      input: [{ role: 'user', content: 'oi' }],
      getAccess: async () => {
        reads += 1;
        return { ok: true, accessToken: `${TOKEN}-${reads}` };
      },
      fetchImpl: transport.fetchImpl,
    }),
    (error) => {
      assert.equal(error instanceof ResponseError, true);
      assert.equal(error.kind, 'auth');
      assert.equal(String(error.message).includes(TOKEN), false);
      return true;
    },
  );
  assert.equal(reads, 2);
  assert.equal(transport.calls.length, 2);
  assert.equal(transport.calls[0].init.headers.Authorization, `Bearer ${TOKEN}-1`);
  assert.equal(transport.calls[1].init.headers.Authorization, `Bearer ${TOKEN}-2`);
});

test('401 then a completed stream succeeds on the single refresh', async () => {
  let reads = 0;
  const transport = scriptedFetch([
    () => jsonResponse(401, { detail: 'expired' }),
    () => sseResponse(completedSse),
  ]);
  const result = await createResponse({
    model: 'slug-a',
    input: [{ role: 'user', content: 'oi' }],
    getAccess: async () => {
      reads += 1;
      return { ok: true, accessToken: `${TOKEN}-${reads}` };
    },
    fetchImpl: transport.fetchImpl,
  });
  assert.equal(result.text, 'Olá');
  assert.equal(reads, 2);
  assert.equal(transport.calls.length, 2);
});

test('signed out never calls the API', async () => {
  let fetches = 0;
  await assert.rejects(
    () => createResponse({
      model: 'slug-a',
      input: [{ role: 'user', content: 'oi' }],
      getAccess: async () => ({ ok: false, code: 'signed_out', message: 'fora' }),
      fetchImpl: async () => { fetches += 1; return jsonResponse(200, {}); },
    }),
    (error) => error instanceof ResponseError && error.kind === 'signed_out',
  );
  assert.equal(fetches, 0);
});

test('region 403 and context length are typed', async () => {
  const region = scriptedFetch([
    () => jsonResponse(403, { detail: 'Country, region, or territory not supported' }),
  ]);
  await assert.rejects(
    () => createResponse({
      model: 'slug-a',
      input: [{ role: 'user', content: 'oi' }],
      accessToken: TOKEN,
      fetchImpl: region.fetchImpl,
    }),
    (error) => error.kind === 'region' && error.status === 403,
  );
  const context = scriptedFetch([
    () => jsonResponse(400, { error: { code: 'context_length_exceeded', message: 'maximum context length' } }),
  ]);
  await assert.rejects(
    () => createResponse({
      model: 'slug-a',
      input: [{ role: 'user', content: 'oi' }],
      accessToken: TOKEN,
      fetchImpl: context.fetchImpl,
    }),
    (error) => error.kind === 'context_too_long',
  );
});

test('forbidden route params are refused before any request', async () => {
  const refused = ['previous_response_id', 'truncation', 'max_output_tokens', 'files'];
  for (const param of refused) {
    assert.equal(FORBIDDEN_PARAMS.includes(param), true);
    let fetches = 0;
    await assert.rejects(
      () => createResponse({
        model: 'slug-a',
        input: [{ role: 'user', content: 'oi' }],
        extra: { [param]: 'no' },
        accessToken: TOKEN,
        fetchImpl: async () => { fetches += 1; return sseResponse(completedSse); },
      }),
      (error) => error instanceof ResponseError && error.kind === 'forbidden' && error.param === param,
    );
    assert.equal(fetches, 0, param);
  }
  let fetches = 0;
  await assert.rejects(
    () => createResponse({
      model: 'slug-a',
      input: [{ role: 'user', content: [{ type: 'input_file', file_id: 'file_test' }] }],
      accessToken: TOKEN,
      fetchImpl: async () => { fetches += 1; return sseResponse(completedSse); },
    }),
    (error) => error.param === 'files',
  );
  assert.equal(fetches, 0);
  await assert.rejects(
    () => createResponse({
      model: 'slug-a',
      input: [{ role: 'user', content: 'oi' }],
      extra: { apiKey: 'sk-synthetic' },
      accessToken: TOKEN,
      fetchImpl: async () => sseResponse(completedSse),
    }),
    (error) => error.kind === 'forbidden' && error.param === 'apiKey',
  );
});

test('the client source names no model and no API key', () => {
  const files = ['responses.js', 'run.js', 'study.js', 'siwc-client.js', 'study.html'];
  const banned = /gpt-\d|OPENAI_API_KEY|\bsk-[A-Za-z0-9]{8,}|billing|x-api-key|chatgpt\.com/i;
  for (const name of files) {
    const text = readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
    assert.equal(banned.test(text), false, name);
  }
});
