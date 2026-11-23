// Per-case local store. See docs/design.md.
//
// Key layout (one backend object store):
//   case/<caseId>/meta                 case metadata, pause state
//   case/<caseId>/<kind>/<name>        one record
//   keys/<caseId>                      per-case encryption key (owned by the codec)
// A Case handle only builds keys under its own prefix, so one case cannot read or write another.

import { plainCodec, CorruptRecordError } from './codec.js';
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

// The side effect finished but its result could not be written. It must not run again here:
// the caller gets the result, and the record still shows the call as started.
export class StepResultNotStoredError extends Error {
  constructor(stepId, result, cause) {
    super(`step ${stepId} finished but its result was not stored`, { cause });
    this.name = 'StepResultNotStoredError';
    this.stepId = stepId;
    this.result = result;
  }
}

// The case this work started in was deleted (and maybe reopened) meanwhile. Nothing was written.
export class CaseLifetimeEndedError extends Error {
  constructor(stepId) {
    super(`case was deleted while step ${stepId} was running; nothing was written`);
    this.name = 'CaseLifetimeEndedError';
    this.stepId = stepId;
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
    this.locks = new Map();
    this.inflight = new Map();
    // Bumped when a case is deleted: work started in an earlier lifetime of a case id never
    // shares a run with, or writes into, the next lifetime.
    this.epochs = new Map();
  }

  // Runs one read-modify-write of a case at a time, so a user edit and a generated revision that
  // arrive together both survive. shortcut: in-process only; two extension contexts (panel and
  // service worker) need an IndexedDB transaction or a Web Lock, which belongs to the wiring in #4.
  lock(caseId, fn) {
    const run = (this.locks.get(caseId) ?? Promise.resolve()).then(fn);
    const tail = run.catch(() => {});
    this.locks.set(caseId, tail);
    tail.then(() => this.locks.get(caseId) === tail && this.locks.delete(caseId));
    return run;
  }

  // Alive means a readable, unexpired meta. Only a confirmed absence, a record that is proven
  // corrupt, or an expired one is "not alive". A backend read error propagates: it must never
  // lead to a deletion.
  async #liveMeta(caseId) {
    const key = `case/${caseId}/meta`;
    const stored = await this.backend.get(key);
    if (stored === undefined) return undefined;
    let meta;
    try {
      meta = await this.codec.decode(caseId, key, stored);
    } catch (err) {
      if (err instanceof CorruptRecordError) return undefined;
      throw err;
    }
    return meta?.expiresAt > this.now() ? meta : undefined;
  }

  // Every case id that has any record or key, including the left-overs of a stopped deletion.
  async #ids() {
    const ids = new Set();
    for (const k of await this.backend.keys('case/')) ids.add(k.split('/')[1]);
    for (const k of await this.backend.keys('keys/')) ids.add(k.slice('keys/'.length));
    return [...ids].filter((id) => CASE_ID.test(id)).sort();
  }

  async openCase(caseId) {
    check(CASE_ID, caseId, 'case id');
    let c;
    await this.lock(caseId, async () => {
      let meta = await this.#liveMeta(caseId);
      // Expired, damaged or left over: nothing of it may come back to life.
      if (!meta) {
        await this.#deleteCase(caseId);
        meta = { createdAt: this.now(), pause: null };
      }
      meta.expiresAt = this.now() + this.caseTtlMs;
      // The handle belongs to the lifetime that exists at this point, under the case lock.
      c = new Case(this, caseId, this.epochs.get(caseId) ?? 0);
      await c._putRaw('meta', meta);
    });
    return c;
  }

  async listCases() {
    const keys = await this.backend.keys('case/');
    return keys.filter((k) => k.endsWith('/meta')).map((k) => k.split('/')[1]);
  }

  // The id check runs inside the lock so an invalid id rejects like every other failure.
  deleteCase(caseId) {
    return this.lock(caseId, async () => {
      check(CASE_ID, caseId, 'case id');
      await this.#deleteCase(caseId);
    });
  }

  async #deleteCase(caseId) {
    // Crypto-erase first. With the AES-GCM codec, if deletion stops halfway the remaining
    // ciphertext is unreadable. The plain codec has no key to erase: its records stay readable
    // until the deletes below finish.
    await this.codec.forget(caseId);
    // The key is gone: its lifetime ends here, even if the cleanup below fails and has to be
    // retried. With the AES-GCM codec the case is now unreadable; with the plain codec nothing is
    // unreadable until the cleanup completes, but the lifetime ends at the same point. A step write from the old lifetime is refused
    // from now on (it would recreate a key). If forget threw, the case is intact and this is
    // not reached. Step writes take the same lock, so none interleaves.
    this.epochs.set(caseId, (this.epochs.get(caseId) ?? 0) + 1);
    // The meta record goes next, so a stopped deletion leaves a case that is no longer listed;
    // expire() sweeps the rest.
    await this.backend.delete(`case/${caseId}/meta`);
    for (const k of await this.backend.keys(`case/${caseId}/`)) await this.backend.delete(k);
  }

  // Deletes expired cases and expired temp entries in the remaining cases.
  async expire() {
    const t = this.now();
    const removed = { cases: [], temp: 0 };
    const errors = [];
    for (const id of await this.#ids()) {
      // One critical section per case, shared with openCase: the liveness check and the delete
      // cannot fall between openCase's key creation and its first meta write.
      const sweep = this.lock(id, async () => {
        if (!(await this.#liveMeta(id))) {
          await this.#deleteCase(id);
          removed.cases.push(id);
          return;
        }
        const c = new Case(this, id);
        for (const name of await c.list('temp')) {
          let rec;
          try {
            rec = await c.get('temp', name);
          } catch (err) {
            if (!(err instanceof CorruptRecordError)) throw err;
          }
          if (!rec || rec.expiresAt <= t) {
            await c.delete('temp', name);
            removed.temp++;
          }
        }
      });
      await sweep.catch((err) => errors.push(err));
    }
    // A failure on one case never stops the sweep of the others, and never deletes that case.
    if (errors.length) {
      throw Object.assign(new AggregateError(errors, `expire: ${errors.length} case(s) failed (${errors[0].message}); the others were swept`), { removed });
    }
    return removed;
  }

  // Counts and states only. No record values, no draft or conversation text.
  async diagnostics() {
    const cases = [];
    for (const id of await this.#ids()) {
      const c = new Case(this, id);
      const meta = await this.#liveMeta(id);
      if (!meta) {
        cases.push({ caseId: id, damaged: true });
        continue;
      }
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
  #bound;

  // `epoch` is the case lifetime this handle belongs to. Handles made for short internal reads
  // take the current one.
  constructor(store, caseId, epoch = store.epochs.get(caseId) ?? 0) {
    this.#store = store;
    this.#bound = epoch;
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

  appendMessage(conversationId, message) {
    return this.#locked(async () => {
      const conv = (await this.get('conversation', conversationId)) ?? { messages: [] };
      conv.messages.push(message);
      await this.put('conversation', conversationId, conv);
      return conv.messages.length;
    });
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

  #locked(fn) {
    return this.#store.lock(this.caseId, fn);
  }

  // Writes the pause unless the case lifetime changed. Runs under the case lock, like deleteCase.
  #pause(reason, epoch = this.#epoch()) {
    return this.#locked(async () => {
      if (this.#current() !== epoch) return undefined;
      const meta = await this._getRaw('meta');
      meta.pause = { reason, message: PAUSE_MESSAGES[reason], at: this.#store.now() };
      await this._putRaw('meta', meta);
      return meta.pause;
    });
  }

  // The only way a step writes its record. The lifetime check and the write sit in one critical
  // section with deleteCase, so a step that began before a deletion can never write into the
  // case that was reopened with the same id. Returns false (nothing written) when stale.
  #stepPut(epoch, stepId, rec) {
    return this.#locked(async () => {
      if (this.#current() !== epoch) return false;
      await this.put('call', stepId, rec);
      return true;
    });
  }

  // User action. Clears the pause and gives paused steps a fresh attempt budget.
  resume() {
    return this.#locked(async () => {
      const meta = await this._getRaw('meta');
      meta.pause = null;
      await this._putRaw('meta', meta);
      for (const name of await this.list('call')) {
        const s = await this.get('call', name);
        if (s.status === 'paused') await this.put('call', name, { ...s, status: 'pending', attempts: 0 });
      }
    });
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
  // The same step called twice at once shares one run.
  runStep(stepId, fn, opts) {
    check(NAME, stepId, 'step id');
    // A handle from an earlier lifetime of this case id never runs a step: no callback, no write.
    if (this.#epoch() !== this.#current()) return Promise.reject(new CaseLifetimeEndedError(stepId));
    const id = `${this.caseId}:${this.#epoch()}:${stepId}`;
    const running = this.#store.inflight.get(id);
    if (running) return running;
    const p = this.#runStep(stepId, fn, opts).finally(() => this.#store.inflight.delete(id));
    this.#store.inflight.set(id, p);
    return p;
  }

  #epoch() {
    return this.#bound;
  }

  #current() {
    return this.#store.epochs.get(this.caseId) ?? 0;
  }

  async #runStep(stepId, fn, { maxAttempts = 3, needsBrowserSession = false, backoffMs = 500 } = {}) {
    const epoch = this.#epoch();
    const paused = await this.pauseState();
    if (paused) throw new PausedError(paused);

    let rec = (await this.get('call', stepId)) ?? { status: 'pending', attempts: 0 };
    if (rec.status === 'done') return rec.result;
    if (rec.status === 'failed') throw new StepFailedError(stepId, rec.attempts);

    if (needsBrowserSession && !this.#store.browserSession()) {
      if (!(await this.#stepPut(epoch, stepId, { ...rec, status: 'paused' }))) throw new CaseLifetimeEndedError(stepId);
      const pause = await this.#pause('pje_session_unavailable', epoch);
      if (!pause) throw new CaseLifetimeEndedError(stepId);
      throw new PausedError(pause);
    }

    const idempotencyKey = `${this.caseId}:${stepId}`;
    while (rec.attempts < maxAttempts) {
      rec = { ...rec, status: 'running', attempts: rec.attempts + 1 };
      // A stale step stops here: it never calls fn for a case that no longer exists.
      if (!(await this.#stepPut(epoch, stepId, rec))) throw new CaseLifetimeEndedError(stepId);
      let result;
      try {
        result = await fn({ idempotencyKey, attempt: rec.attempts });
      } catch (err) {
        const reason = pauseReasonFor(err);
        rec = { ...rec, error: redact(err?.message ?? err) };
        // A stale step reports its own error to its own caller and writes nothing.
        if (reason) {
          if (!(await this.#stepPut(epoch, stepId, { ...rec, status: 'paused' }))) throw err;
          const pause = await this.#pause(reason, epoch);
          if (!pause) throw err;
          throw new PausedError(pause);
        }
        if (!(await this.#stepPut(epoch, stepId, rec))) throw err;
        if (rec.attempts < maxAttempts) await this.#store.sleep(backoffMs * 2 ** (rec.attempts - 1));
        continue;
      }
      // Outside the try: a failed write must not retry a side effect that already happened.
      try {
        await this.#stepPut(epoch, stepId, { status: 'done', attempts: rec.attempts, result, at: this.#store.now() });
      } catch (err) {
        throw new StepResultNotStoredError(stepId, result, err);
      }
      return result; // stale (not stored): the old caller still gets its own result
    }
    if (!(await this.#stepPut(epoch, stepId, { ...rec, status: 'failed' }))) throw new CaseLifetimeEndedError(stepId);
    throw new StepFailedError(stepId, rec.attempts);
  }

  // ---- drafts ----
  // A draft keeps generated revisions and the user's edit apart. A generated revision never
  // replaces the user's edit; when it arrives after an edit, the draft carries a conflict.

  async #draft(draftId) {
    return (await this.get('draft', draftId)) ?? { generated: [], user: null, conflict: null, discarded: [] };
  }

  addGeneratedRevision(draftId, text, opts) {
    return this.#locked(() => this.#addGeneratedRevision(draftId, text, opts));
  }

  async #addGeneratedRevision(draftId, text, { stepId } = {}) {
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

  saveUserEdit(draftId, text, basedOn) {
    return this.#locked(async () => {
      const d = await this.#draft(draftId);
      const latest = d.generated.at(-1)?.rev ?? 0;
      const base = basedOn ?? latest;
      d.user = { text, basedOn: base, at: this.#store.now() };
      d.conflict = base === latest ? null : { userBasedOn: base, generatedRev: latest };
      await this.put('draft', draftId, d);
    });
  }

  async getDraft(draftId) {
    const d = await this.#draft(draftId);
    const latest = d.generated.at(-1) ?? null;
    return {
      ...d,
      discarded: d.discarded ?? [],
      current: d.user ? d.user.text : latest?.text ?? null,
      source: d.user ? 'user' : latest ? 'generated' : null,
    };
  }

  // choice: 'keep-user' rebases the edit on the latest revision; 'take-generated' sets the edit
  // aside in `discarded`, so even that user choice does not destroy the text.
  resolveConflict(draftId, choice) {
    return this.#locked(async () => {
      const d = await this.#draft(draftId);
      if (!d.conflict) return;
      if (choice === 'keep-user') d.user.basedOn = d.generated.at(-1).rev;
      else if (choice === 'take-generated') {
        d.discarded = [...(d.discarded ?? []), d.user];
        d.user = null;
      } else throw new TypeError('invalid choice');
      d.conflict = null;
      await this.put('draft', draftId, d);
    });
  }
}
