// Per-case local store. See docs/design.md.
//
// Key layout (one backend object store):
//   case/<caseId>/meta                 case metadata, pause state
//   case/<caseId>/<kind>/<name>        one record
//   keys/<caseId>                      per-case encryption key (owned by the codec)
// A Case handle only builds keys under its own prefix, so one case cannot read or write another.

import { plainCodec } from './codec.js';
import { redact } from './redact.js';

const CASE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const NAME = /^[A-Za-z0-9_.@:-]{1,128}$/;
export const KINDS = Object.freeze(['inventory', 'extraction', 'call', 'conversation', 'draft', 'checkpoint', 'temp']);
const DAY = 24 * 60 * 60 * 1000;

export const PAUSE_MESSAGES = Object.freeze({
  auth_expired: 'Sign-in expired. Sign in again, then resume this case.',
  quota_exhausted: 'Plan usage limit reached. Work is kept. Resume when usage is available.',
  pje_session_unavailable: 'PJe needs an open, signed-in browser tab. Open PJe and sign in, then resume.',
});

export class PausedError extends Error {
  constructor(pause) {
    super(`case paused: ${pause.reason}`);
    this.name = 'PausedError';
    this.pause = pause;
  }
}

export class StepFailedError extends Error {
  constructor(stepId, attempts) {
    super(`step ${stepId} failed after ${attempts} attempts`);
    this.name = 'StepFailedError';
    this.stepId = stepId;
  }
}

// Maps an error to a pause reason, or null for a transient error that may be retried.
// Codes align with subscription usage errors mapped in validation/ (#5 manual ChatGPT).
export function pauseReasonFor(err) {
  const code = err?.code;
  const status = err?.status;
  if (code === 'auth_expired' || code === 'subscription_sharing_invalid_user' || status === 401) return 'auth_expired';
  if (code === 'quota_exhausted' || code === 'subscription_sharing_usage_limit_exceeded' || status === 429) return 'quota_exhausted';
  if (code === 'pje_session_unavailable') return 'pje_session_unavailable';
  return null;
}

function check(re, value, what) {
  if (typeof value !== 'string' || !re.test(value)) throw new TypeError(`invalid ${what}`);
}

export class CaseStore {
  constructor({
    backend,
    codec = plainCodec,
    now = Date.now,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    caseTtlMs = 30 * DAY,
    // True only when an open browser tab has an authenticated PJe session. A queued step never
    // implies background access to PJe.
    browserSession = () => false,
  }) {
    if (!backend) throw new TypeError('backend is required');
    Object.assign(this, { backend, codec, now, sleep, caseTtlMs, browserSession });
  }

  async openCase(caseId) {
    check(CASE_ID, caseId, 'case id');
    const c = new Case(this, caseId);
    const meta = (await c._getRaw('meta')) ?? { createdAt: this.now(), pause: null };
    meta.expiresAt = this.now() + this.caseTtlMs;
    await c._putRaw('meta', meta);
    return c;
  }

  async listCases() {
    const keys = await this.backend.keys('case/');
    return keys.filter((k) => k.endsWith('/meta')).map((k) => k.split('/')[1]);
  }

  async deleteCase(caseId) {
    check(CASE_ID, caseId, 'case id');
    // Crypto-erase first: if deletion stops halfway, the remaining ciphertext is unreadable.
    await this.codec.forget(caseId);
    for (const k of await this.backend.keys(`case/${caseId}/`)) await this.backend.delete(k);
  }

  // Deletes expired cases and expired temp entries in the remaining cases.
  async expire() {
    const t = this.now();
    const removed = { cases: [], temp: 0 };
    for (const id of await this.listCases()) {
      const c = new Case(this, id);
      const meta = await c._getRaw('meta');
      if (meta.expiresAt <= t) {
        await this.deleteCase(id);
        removed.cases.push(id);
        continue;
      }
      for (const name of await c.list('temp')) {
        const rec = await c.get('temp', name);
        if (rec.expiresAt <= t) {
          await c.delete('temp', name);
          removed.temp++;
        }
      }
    }
    return removed;
  }

  // Counts and states only. No record values, no draft or conversation text.
  async diagnostics() {
    const cases = [];
    for (const id of await this.listCases()) {
      const c = new Case(this, id);
      const meta = await c._getRaw('meta');
      const counts = {};
      for (const kind of KINDS) counts[kind] = (await c.list(kind)).length;
      const steps = [];
      for (const name of await c.list('call')) {
        const s = await c.get('call', name);
        steps.push({ step: name, status: s.status, attempts: s.attempts, error: s.error ? redact(s.error) : undefined });
      }
      cases.push({ caseId: id, expiresAt: meta.expiresAt, pause: meta.pause?.reason ?? null, counts, steps });
    }
    return { cases };
  }
}

export class Case {
  #store;
  #prefix;

  constructor(store, caseId) {
    this.#store = store;
    this.caseId = caseId;
    this.#prefix = `case/${caseId}/`;
  }

  #key(kind, name) {
    if (!KINDS.includes(kind)) throw new TypeError('invalid kind');
    check(NAME, name, 'record name');
    return `${this.#prefix}${kind}/${name}`;
  }

  async _getRaw(suffix) {
    const key = this.#prefix + suffix;
    const stored = await this.#store.backend.get(key);
    return stored === undefined ? undefined : this.#store.codec.decode(this.caseId, key, stored);
  }

  async _putRaw(suffix, value) {
    const key = this.#prefix + suffix;
    await this.#store.backend.put(key, await this.#store.codec.encode(this.caseId, key, value));
  }

  // Generic records: inventory, extraction versions, conversations, checkpoints.
  async get(kind, name) {
    return this._getRaw(this.#key(kind, name).slice(this.#prefix.length));
  }

  async put(kind, name, value) {
    await this._putRaw(this.#key(kind, name).slice(this.#prefix.length), value);
  }

  async delete(kind, name) {
    await this.#store.backend.delete(this.#key(kind, name));
  }

  async list(kind) {
    if (!KINDS.includes(kind)) throw new TypeError('invalid kind');
    const p = `${this.#prefix}${kind}/`;
    return (await this.#store.backend.keys(p)).map((k) => k.slice(p.length));
  }

  // Extraction versions: a new version never replaces an old one.
  async putExtraction(docId, version, value) {
    await this.put('extraction', `${docId}@${version}`, value);
  }

  async appendMessage(conversationId, message) {
    const conv = (await this.get('conversation', conversationId)) ?? { messages: [] };
    conv.messages.push(message);
    await this.put('conversation', conversationId, conv);
    return conv.messages.length;
  }

  // Temporary entries (downloads, intermediate text). They expire on their own TTL and always
  // go with the case on deletion.
  async putTemp(name, value, ttlMs) {
    await this.put('temp', name, { value, expiresAt: this.#store.now() + ttlMs });
  }

  async getTemp(name) {
    const rec = await this.get('temp', name);
    return rec && rec.expiresAt > this.#store.now() ? rec.value : undefined;
  }

  // ---- pause ----

  async pauseState() {
    return (await this._getRaw('meta'))?.pause ?? null;
  }

  async #pause(reason) {
    const meta = await this._getRaw('meta');
    meta.pause = { reason, message: PAUSE_MESSAGES[reason], at: this.#store.now() };
    await this._putRaw('meta', meta);
    return meta.pause;
  }

  // User action. Clears the pause and gives paused steps a fresh attempt budget.
  async resume() {
    const meta = await this._getRaw('meta');
    meta.pause = null;
    await this._putRaw('meta', meta);
    for (const name of await this.list('call')) {
      const s = await this.get('call', name);
      if (s.status === 'paused') await this.put('call', name, { ...s, status: 'pending', attempts: 0 });
    }
  }

  // User action. Allows a failed step to run again with a fresh attempt budget.
  async resetStep(stepId) {
    const s = await this.get('call', stepId);
    if (s && s.status !== 'done') await this.put('call', stepId, { ...s, status: 'pending', attempts: 0 });
  }

  // ---- steps (analysis calls, PJe reads) ----

  // Runs fn at most once to completion. A done step returns its stored result and never calls fn
  // again, also after a worker or browser restart. The attempt count is written before each call,
  // so the retry budget holds across restarts. fn gets a stable idempotencyKey to pass to the
  // remote side: a call that completed remotely but was not recorded here can be deduplicated.
  async runStep(stepId, fn, { maxAttempts = 3, needsBrowserSession = false, backoffMs = 500 } = {}) {
    check(NAME, stepId, 'step id');
    const paused = await this.pauseState();
    if (paused) throw new PausedError(paused);

    let rec = (await this.get('call', stepId)) ?? { status: 'pending', attempts: 0 };
    if (rec.status === 'done') return rec.result;
    if (rec.status === 'failed') throw new StepFailedError(stepId, rec.attempts);

    if (needsBrowserSession && !this.#store.browserSession()) {
      await this.put('call', stepId, { ...rec, status: 'paused' });
      throw new PausedError(await this.#pause('pje_session_unavailable'));
    }

    const idempotencyKey = `${this.caseId}:${stepId}`;
    while (rec.attempts < maxAttempts) {
      rec = { ...rec, status: 'running', attempts: rec.attempts + 1 };
      await this.put('call', stepId, rec);
      try {
        const result = await fn({ idempotencyKey, attempt: rec.attempts });
        await this.put('call', stepId, { status: 'done', attempts: rec.attempts, result, at: this.#store.now() });
        return result;
      } catch (err) {
        const reason = pauseReasonFor(err);
        rec = { ...rec, error: redact(err?.message ?? err) };
        if (reason) {
          await this.put('call', stepId, { ...rec, status: 'paused' });
          throw new PausedError(await this.#pause(reason));
        }
        await this.put('call', stepId, rec);
        if (rec.attempts < maxAttempts) await this.#store.sleep(backoffMs * 2 ** (rec.attempts - 1));
      }
    }
    await this.put('call', stepId, { ...rec, status: 'failed' });
    throw new StepFailedError(stepId, rec.attempts);
  }

  // ---- drafts ----
  // A draft keeps generated revisions and the user's edit apart. A generated revision never
  // replaces the user's edit; when it arrives after an edit, the draft carries a conflict.

  async #draft(draftId) {
    return (await this.get('draft', draftId)) ?? { generated: [], user: null, conflict: null };
  }

  async addGeneratedRevision(draftId, text, { stepId } = {}) {
    const d = await this.#draft(draftId);
    // Idempotent per step: a replayed step after restart does not add a second revision.
    const existing = stepId && d.generated.find((g) => g.stepId === stepId);
    if (existing) return { rev: existing.rev, conflict: d.conflict };
    const rev = d.generated.length + 1;
    d.generated.push({ rev, text, stepId, at: this.#store.now() });
    if (d.user && d.user.basedOn !== rev) d.conflict = { userBasedOn: d.user.basedOn, generatedRev: rev };
    await this.put('draft', draftId, d);
    return { rev, conflict: d.conflict };
  }

  async saveUserEdit(draftId, text, basedOn) {
    const d = await this.#draft(draftId);
    const latest = d.generated.at(-1)?.rev ?? 0;
    const base = basedOn ?? latest;
    d.user = { text, basedOn: base, at: this.#store.now() };
    d.conflict = base === latest ? null : { userBasedOn: base, generatedRev: latest };
    await this.put('draft', draftId, d);
  }

  async getDraft(draftId) {
    const d = await this.#draft(draftId);
    const latest = d.generated.at(-1) ?? null;
    return {
      ...d,
      current: d.user ? d.user.text : latest?.text ?? null,
      source: d.user ? 'user' : latest ? 'generated' : null,
    };
  }

  // choice: 'keep-user' rebases the edit on the latest revision; 'take-generated' drops the edit.
  async resolveConflict(draftId, choice) {
    const d = await this.#draft(draftId);
    if (!d.conflict) return;
    if (choice === 'keep-user') d.user.basedOn = d.generated.at(-1).rev;
    else if (choice === 'take-generated') d.user = null;
    else throw new TypeError('invalid choice');
    d.conflict = null;
    await this.put('draft', draftId, d);
  }
}
