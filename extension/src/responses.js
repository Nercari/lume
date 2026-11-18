// ChatGPT-plan Responses client. Model slugs come from GET /v1/models.
// Success is only response.completed. A 401 refreshes access once, then stops.
// There is no API-key path and no second meter.

export const MODELS_URL = 'https://api.openai.com/v1/models';
export const RESPONSES_URL = 'https://api.openai.com/v1/responses';

export const FORBIDDEN_PARAMS = [
  'previous_response_id',
  'truncation',
  'max_output_tokens',
  'files',
  'background',
  'conversation',
  'max_tool_calls',
  'metadata',
  'moderation',
  'multi_agent',
  'prompt',
  'prompt_cache_retention',
  'safety_identifier',
  'temperature',
  'top_logprobs',
  'top_p',
  'user',
];

const FILE_TYPES = new Set(['file', 'input_file']);
const PAUSE_CODES = new Set([
  'subscription_sharing_usage_limit_exceeded',
  'subscription_sharing_usage_unavailable',
]);

export class ResponseError extends Error {
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'ResponseError';
    this.kind = kind;
    this.code = extra.code ?? null;
    this.status = extra.status ?? null;
    this.param = extra.param ?? null;
    this.requestId = extra.requestId ?? null;
  }
}

export function modelPreferenceKey(accountId) {
  const id = String(accountId ?? 'default').slice(0, 120) || 'default';
  return `lume:model:${id}`;
}

export function refuseForbidden(fields) {
  if (!fields || typeof fields !== 'object') return;
  for (const key of FORBIDDEN_PARAMS) {
    if (Object.prototype.hasOwnProperty.call(fields, key)) {
      throw new ResponseError('forbidden', `parâmetro recusado nesta rota: ${key}`, { param: key });
    }
  }
  if (fields.apiKey != null || fields.api_key != null) {
    throw new ResponseError('forbidden', 'esta rota não usa chave de API', { param: 'apiKey' });
  }
}

function refuseFileInput(input) {
  const stack = Array.isArray(input) ? input.slice() : [input];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    if (FILE_TYPES.has(item.type)) {
      throw new ResponseError('forbidden', 'parâmetro recusado nesta rota: files', { param: 'files' });
    }
    if (Array.isArray(item.content)) stack.push(...item.content);
  }
}

function accessFailure(access) {
  const code = access?.code || 'error';
  const message = typeof access?.message === 'string' && access.message
    ? access.message.slice(0, 300)
    : 'sem acesso ao plano ChatGPT';
  if (code === 'signed_out') return new ResponseError('signed_out', message, { code });
  if (code === 'not_eligible' || code === 'no_plan_scope' || code === 'expired') {
    return new ResponseError(code, message, { code });
  }
  return new ResponseError('auth', message, { code });
}

function isContext(code, message) {
  const blob = `${code ?? ''} ${message ?? ''}`.toLowerCase();
  return blob.includes('context_length')
    || blob.includes('context length')
    || blob.includes('maximum context')
    || blob.includes('context window')
    || blob.includes('string_above_max_length')
    || blob.includes('context_too_long');
}

function errorFromBody(status, body, requestId) {
  const code = body?.error?.code ?? null;
  const param = body?.error?.param ?? null;
  const raw = body?.error?.message ?? body?.detail ?? `http ${status}`;
  const message = String(raw).slice(0, 300);
  const extra = { status, code, param, requestId };
  if (isContext(code, message)) return new ResponseError('context_too_long', message, extra);
  if (code === 'subscription_sharing_usage_limit_exceeded' || status === 429) {
    return new ResponseError('quota', message, extra);
  }
  if (code === 'subscription_sharing_usage_unavailable' || status === 503) {
    return new ResponseError('usage_limit', message, extra);
  }
  if (status === 401 || code === 'subscription_sharing_invalid_user') {
    return new ResponseError('auth', message, extra);
  }
  if (code === 'subscription_sharing_user_not_eligible') {
    return new ResponseError('not_eligible', message, extra);
  }
  if (status === 403) return new ResponseError('region', message, extra);
  if (PAUSE_CODES.has(code)) return new ResponseError('quota', message, extra);
  return new ResponseError('failed', message, extra);
}

function errorFromEvent(json) {
  const response = json?.response ?? {};
  const error = response.error ?? json?.error ?? {};
  const code = error.code ?? null;
  const message = String(error.message ?? response.status ?? json?.type ?? 'falha').slice(0, 300);
  const extra = { code, param: error.param ?? null, status: null };
  if (json?.type === 'response.incomplete') return new ResponseError('incomplete', message, extra);
  if (isContext(code, message)) return new ResponseError('context_too_long', message, extra);
  if (code === 'subscription_sharing_usage_limit_exceeded') return new ResponseError('quota', message, extra);
  if (code === 'subscription_sharing_usage_unavailable') return new ResponseError('usage_limit', message, extra);
  return new ResponseError('failed', message, extra);
}

export function parseSseBlock(block) {
  let eventName = '';
  const dataLines = [];
  for (const line of String(block).split(/\r?\n/)) {
    if (!line || line.startsWith(':')) continue;
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    const raw = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
    if (field === 'event') eventName = raw;
    else if (field === 'data') dataLines.push(raw);
  }
  const data = dataLines.join('\n');
  if (!data || data === '[DONE]') return { eventName, data, done: data === '[DONE]', json: null };
  try {
    return { eventName, data, done: false, json: JSON.parse(data) };
  } catch {
    return { eventName, data, done: false, json: null };
  }
}

function textFromResponse(response) {
  const chunks = [];
  for (const item of response?.output ?? []) {
    for (const part of item?.content ?? []) {
      if (typeof part?.text === 'string') chunks.push(part.text);
    }
  }
  return chunks.join('');
}

async function readSse(response, { onDelta, signal }) {
  if (!response.body) throw new ResponseError('interrupted', 'resposta sem corpo');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let completed = null;
  const take = async (block) => {
    if (!block.trim()) return;
    const event = parseSseBlock(block);
    const type = event.json?.type || event.eventName;
    if (type === 'response.output_text.delta') {
      const delta = typeof event.json?.delta === 'string' ? event.json.delta : '';
      text += delta;
      if (delta) onDelta?.(delta);
      return;
    }
    if (type === 'response.completed') {
      const finalText = textFromResponse(event.json?.response);
      completed = { text: finalText || text, response: event.json?.response ?? null };
      return;
    }
    if (type === 'response.failed' || type === 'response.incomplete') throw errorFromEvent(event.json);
  };
  try {
    while (completed == null) {
      if (signal?.aborted) throw new ResponseError('cancelled', 'cancelado');
      const step = await reader.read();
      if (step.done) break;
      buffer += decoder.decode(step.value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        await take(part);
        if (completed) break;
      }
    }
    if (completed == null) {
      buffer += decoder.decode();
      if (buffer.trim()) await take(buffer);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (signal?.aborted) throw new ResponseError('cancelled', 'cancelado');
    throw error;
  }
  await reader.cancel().catch(() => {});
  if (completed == null) throw new ResponseError('interrupted', 'o fluxo terminou sem response.completed');
  return completed;
}

async function tokenFrom(getAccess) {
  if (typeof getAccess !== 'function') throw new ResponseError('auth', 'sem acesso');
  let access;
  try {
    access = await getAccess();
  } catch {
    throw new ResponseError('auth', 'sem acesso');
  }
  if (!access?.ok || typeof access.accessToken !== 'string' || !access.accessToken) throw accessFailure(access);
  return access.accessToken;
}

async function fetchAuthed({ url, accessToken, getAccess, fetchImpl, signal, init }) {
  if (typeof fetchImpl !== 'function') throw new ResponseError('failed', 'fetch ausente');
  let token = accessToken || await tokenFrom(getAccess);
  let refreshed = false;
  while (true) {
    if (signal?.aborted) throw new ResponseError('cancelled', 'cancelado');
    const response = await fetchImpl(url, {
      ...init,
      signal,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${token}`,
      },
    });
    if (response.status === 401 && !refreshed) {
      refreshed = true;
      await response.body?.cancel?.().catch(() => {});
      token = await tokenFrom(getAccess);
      continue;
    }
    return response;
  }
}

async function readError(response) {
  const requestId = response.headers?.get?.('x-request-id') ?? null;
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return errorFromBody(response.status, body, requestId);
}

export async function listModels({ accessToken, getAccess, fetchImpl, signal } = {}) {
  const response = await fetchAuthed({
    url: MODELS_URL,
    accessToken,
    getAccess,
    fetchImpl,
    signal,
    init: { method: 'GET' },
  });
  if (response.status === 401) throw await readError(response);
  if (!response.ok) throw await readError(response);
  const body = await response.json();
  const models = Array.isArray(body?.models) ? body.models : [];
  const listed = [];
  for (const model of models) {
    if (model?.visibility !== 'list' || typeof model.slug !== 'string' || !model.slug) continue;
    const displayName = typeof model.display_name === 'string' && model.display_name
      ? model.display_name
      : model.slug;
    listed.push({ slug: model.slug, displayName });
  }
  return listed;
}

export function buildResponsesBody({ model, input, instructions }) {
  refuseFileInput(input);
  const body = {
    model,
    input,
    store: false,
    stream: true,
  };
  if (instructions) body.instructions = instructions;
  refuseForbidden(body);
  return body;
}

export async function createResponse({
  model,
  input,
  instructions,
  extra,
  accessToken,
  getAccess,
  fetchImpl,
  signal,
  onDelta,
} = {}) {
  if (typeof model !== 'string' || !model.trim()) throw new ResponseError('failed', 'modelo ausente');
  refuseForbidden(extra);
  if (extra && typeof extra === 'object') {
    for (const key of Object.keys(extra)) {
      if (FORBIDDEN_PARAMS.includes(key) || key === 'apiKey' || key === 'api_key') {
        throw new ResponseError('forbidden', `parâmetro recusado nesta rota: ${key}`, { param: key });
      }
    }
  }
  const body = buildResponsesBody({ model, input, instructions });
  const response = await fetchAuthed({
    url: RESPONSES_URL,
    accessToken,
    getAccess,
    fetchImpl,
    signal,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  });
  if (!response.ok) throw await readError(response);
  return readSse(response, { onDelta, signal });
}
