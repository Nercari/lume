// Bounded offline queue (#11). Each case keeps its own state, result, and error.
// An ordinary case failure is retried up to maxAttempts and does not stop other cases.
// Auth, quota, and a missing browser session pause the whole queue and do not burn an attempt.
// Cancel stops cases that have not started. Resume continues those cases and does not
// run a case that already succeeded.
import { buildComparison } from './compare.js';
import { CASE_ID, DEFAULT_MAX_ATTEMPTS, MAX_BATCH, PAUSE_MESSAGES, SHARED_REASONS } from './constants.js';
import { BatchStop, ComparisonError, SelectionError } from './errors.js';

const SHARED = new Set(SHARED_REASONS);
const DRAFT_ID = /^[a-z0-9-]{1,64}$/;
const SOURCE_ID = /^[a-z0-9-]{1,64}$/;
const LOCATOR = /^p[0-9]{1,4}$/;
const ERROR_CODE = /^[a-z0-9_]{1,40}$/;

export function sharedReason(err) {
  if (!err || typeof err !== 'object') return null;
  if (SHARED.has(err.code)) return err.code;
  if (err.status === 401) return 'auth_expired';
  if (err.status === 429) return 'quota_exhausted';
  return null;
}

function sameSet(left, right) {
  if (left.length !== right.length) return false;
  const seen = new Set(left);
  if (seen.size !== left.length) return false;
  return right.every((id) => seen.has(id));
}

function terminalError(code) {
  const err = new Error(code);
  err.code = code;
  err.retryable = false;
  return err;
}

export class BatchQueue {
  constructor({
    runner,
    shared = () => null,
    browserSession = () => true,
    maxAttempts = DEFAULT_MAX_ATTEMPTS,
    limit = MAX_BATCH,
  } = {}) {
    if (typeof runner !== 'function') throw new TypeError('runner required');
    if (typeof shared !== 'function') throw new TypeError('shared required');
    if (typeof browserSession !== 'function') throw new TypeError('browserSession required');
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new TypeError('maxAttempts must be a positive integer');
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) throw new TypeError('limit must be from 1 to MAX_BATCH');
    this.runner = runner;
    this.shared = shared;
    this.browserSession = browserSession;
    this.maxAttempts = maxAttempts;
    this.limit = limit;
    this.status = 'idle';
    this.pause = null;
    this.auth = null;
    this.order = [];
    this.included = [];
    this.slots = new Map();
    this.comparisons = [];
    this.seen = new Set();
    this.generation = 0;
  }

  load(selectionValue, auth) {
    if (this.status !== 'idle') throw new BatchStop('already_loaded');
    if (selectionValue?.status !== 'confirmed') throw new SelectionError('not_confirmed');
    if (selectionValue.caseIds.length === 0) throw new SelectionError('empty_selection');
    if (selectionValue.caseIds.length > this.limit) throw new SelectionError('batch_limit');
    if (!auth || typeof auth.id !== 'string' || typeof auth.provider !== 'string' || typeof auth.data !== 'string' || !Array.isArray(auth.caseIds)) {
      throw new TypeError('authorization required');
    }
    if (!sameSet(auth.caseIds, selectionValue.caseIds)) throw new SelectionError('auth_mismatch');
    this.auth = auth;
    this.order = [...selectionValue.caseIds];
    this.included = selectionValue.included.map((row) => ({ id: row.id, title: row.title, labels: [...row.labels] }));
    for (const id of this.order) {
      if (!CASE_ID.test(id)) throw new TypeError('invalid case id');
      this.slots.set(id, {
        id,
        status: 'pending',
        attempts: 0,
        error: null,
        draftId: null,
        draft: null,
        evidence: [],
        permissions: Object.freeze({ caseId: id, data: auth.data }),
      });
    }
    this.status = 'ready';
    return this.progress();
  }

  async run() {
    if (this.status !== 'ready') throw new BatchStop(this.status === 'paused' || this.status === 'cancelled' ? 'use_resume' : 'not_ready');
    this.status = 'running';
    await this.#drain();
    return this.progress();
  }

  cancel() {
    if (this.status === 'idle' || this.status === 'ready') throw new BatchStop('nothing_to_cancel');
    if (this.status === 'done') throw new BatchStop('already_finished');
    if (this.status === 'cancelled') return this.progress();
    this.generation += 1;
    this.status = 'cancelled';
    this.pause = null;
    for (const slot of this.slots.values()) {
      if (slot.status === 'pending') slot.status = 'cancelled';
    }
    return this.progress();
  }

  async resume() {
    if (this.status !== 'paused' && this.status !== 'cancelled') throw new BatchStop('not_resumable');
    const reason = this.#probe();
    if (reason) {
      this.#pause(reason);
      return this.progress();
    }
    this.pause = null;
    for (const slot of this.slots.values()) {
      if (slot.status === 'cancelled') slot.status = 'pending';
    }
    this.status = 'running';
    await this.#drain();
    return this.progress();
  }

  progress() {
    return {
      status: this.status,
      pause: this.pause,
      authId: this.auth?.id ?? null,
      prompts: this.auth?.prompts ?? 0,
      included: this.included.map((row) => ({ id: row.id, title: row.title, labels: [...row.labels] })),
      cases: this.order.map((id) => {
        const slot = this.slots.get(id);
        return { id, status: slot.status, attempts: slot.attempts, error: slot.error?.code ?? null };
      }),
    };
  }

  report(caseId) {
    const slot = this.#slot(caseId);
    return {
      caseId: slot.id,
      status: slot.status,
      attempts: slot.attempts,
      error: slot.error?.code ?? null,
      draftId: slot.draftId,
      draft: slot.draft,
      evidence: slot.evidence.map((source) => ({ ...source })),
      permissions: { ...slot.permissions },
    };
  }

  // options is rejected so a comparison cannot be asked to rewrite drafts.
  compare(question, caseIds = [...this.order], options) {
    if (options !== undefined) throw new ComparisonError('comparisons_do_not_change_drafts');
    if (typeof question !== 'string' || question.trim() === '' || question.length > 200) throw new TypeError('question required');
    const drafts = new Map([...this.slots].map(([id, slot]) => [id, slot.draft]));
    const reports = new Map([...this.slots].map(([id, slot]) => [id, {
      status: slot.status,
      evidence: slot.evidence.map((source) => ({ ...source })),
    }]));
    const context = buildComparison(reports, { question, caseIds });
    for (const [id, draft] of drafts) {
      if (this.slots.get(id).draft !== draft) throw new ComparisonError('draft_mutated');
    }
    this.comparisons.push(context);
    return context;
  }

  #slot(caseId) {
    if (typeof caseId !== 'string' || !this.slots.has(caseId)) throw new BatchStop('unknown_case');
    return this.slots.get(caseId);
  }

  #probe() {
    if (this.browserSession() !== true) return 'pje_session_unavailable';
    const reason = this.shared();
    if (reason == null) return null;
    if (!SHARED.has(reason)) throw new TypeError('invalid pause reason');
    return reason;
  }

  #pause(reason) {
    this.status = 'paused';
    this.pause = Object.freeze({ reason, message: PAUSE_MESSAGES[reason] });
  }

  async #drain() {
    const generation = this.generation;
    for (const id of this.order) {
      if (this.generation !== generation || this.status !== 'running') return;
      const slot = this.slots.get(id);
      if (slot.status !== 'pending') continue;
      await this.#runOne(slot, generation);
      if (this.generation !== generation || this.status !== 'running') return;
    }
    if (this.status === 'running' && this.generation === generation) this.status = 'done';
  }

  async #runOne(slot, generation) {
    while (slot.attempts < this.maxAttempts) {
      if (this.generation !== generation || this.status !== 'running') return;
      const reason = this.#probe();
      if (reason) {
        slot.status = 'pending';
        this.#pause(reason);
        return;
      }
      slot.attempts += 1;
      slot.status = 'running';
      const idempotencyKey = `${this.auth.id}:${slot.id}:${slot.attempts}`;
      if (this.seen.has(idempotencyKey)) throw new BatchStop('duplicate_work');
      this.seen.add(idempotencyKey);
      try {
        const result = await this.runner(Object.freeze({
          caseId: slot.id,
          attempt: slot.attempts,
          idempotencyKey,
          authId: this.auth.id,
        }));
        this.#commit(slot, result);
        return;
      } catch (err) {
        const shared = sharedReason(err);
        if (shared) {
          this.seen.delete(idempotencyKey);
          slot.attempts -= 1;
          slot.status = 'pending';
          slot.error = null;
          this.#pause(shared);
          return;
        }
        const code = typeof err?.code === 'string' && ERROR_CODE.test(err.code) ? err.code : 'case_failed';
        slot.error = Object.freeze({ code });
        const stop = err?.retryable === false || code === 'case_mixing' || slot.attempts >= this.maxAttempts;
        slot.status = stop ? 'failed' : 'pending';
        if (stop) return;
      }
    }
  }

  #commit(slot, result) {
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw terminalError('case_failed');
    if (result.caseId !== slot.id) throw terminalError('case_mixing');
    if (typeof result.draftId !== 'string' || !DRAFT_ID.test(result.draftId)) throw terminalError('case_failed');
    if (typeof result.draft !== 'string' || result.draft.length === 0 || result.draft.length > 200) throw terminalError('case_failed');
    if (!Array.isArray(result.evidence) || result.evidence.length === 0) throw terminalError('case_failed');
    const evidence = [];
    for (const source of result.evidence) {
      if (!source || typeof source.sourceId !== 'string' || !SOURCE_ID.test(source.sourceId)) throw terminalError('case_failed');
      if (typeof source.locator !== 'string' || !LOCATOR.test(source.locator)) throw terminalError('case_failed');
      if (source.caseId != null && source.caseId !== slot.id) throw terminalError('case_mixing');
      evidence.push(Object.freeze({ caseId: slot.id, sourceId: source.sourceId, locator: source.locator }));
    }
    slot.draftId = result.draftId;
    slot.draft = result.draft;
    slot.evidence = evidence;
    slot.error = null;
    slot.status = 'succeeded';
  }
}
