// Case chat and side editor for one case (#8). Chat and drafting read the same case context.
// The model is an injected function and gets no write tool: every state change here comes from a
// user action handler calling a method of this class.
import { registerDraft, draftState, assertConclusive, ProvisionalDraftError } from '../../analysis/src/index.js';
import { DEFAULT_METHOD, CITATION, inferDocType } from './method.js';
import { buildContext, incompatibilities, mustAddress, sourcePanel } from './context.js';
import { merge3 } from './merge.js';

export const emptyProfile = () => ({ instructions: [], examples: [] });

const clean = (text, moved) => String(text ?? '').replace(CITATION, (m) => (moved.push(m.trim()), '')).trim();

export class CaseSession {
  // caseRec: #7 Case. ledger: #6 ledger. model: async (prompt) => output. profile: optional
  // { instructions: [string], examples: [{ text }] }, style and structure only.
  constructor({ caseRec, ledger, model, method = DEFAULT_METHOD, profile = null, conversationId = 'main' }) {
    Object.assign(this, { caseRec, ledger, model, method, conversationId });
    this.profile = profile ?? emptyProfile();
    this._ctx = null;
  }

  // The one case context. Rebuilt only when the ledger revision changes.
  context() {
    if (this._ctx?.rev !== this.ledger.rev) this._ctx = buildContext(this.ledger);
    return this._ctx;
  }

  style(corrections = []) {
    return { use: 'style and structure only; not case evidence', instructions: [...this.profile.instructions, ...corrections], examples: this.profile.examples.map((e) => ({ text: e.text })) };
  }

  async chat(text) {
    const n = await this.caseRec.appendMessage(this.conversationId, { role: 'user', text, at: Date.now() });
    const conv = await this.caseRec.get('conversation', this.conversationId);
    const prompt = { task: 'chat', system: this.method.instructions, evidence: this.context(), style: this.style(), conversation: conv.messages };
    const out = await this.caseRec.runStep(`chat.${this.conversationId}.${n}`, ({ idempotencyKey }) => this.model({ ...prompt, idempotencyKey }));
    const moved = [];
    const reply = { role: 'assistant', text: clean(out?.text, moved), sources: sourcePanel(this.context(), { sections: [{ id: 'reply', uses: out?.uses ?? [] }] }, moved) };
    await this.caseRec.appendMessage(this.conversationId, reply);
    return reply;
  }

  async #meta(draftId) {
    return this.caseRec.get('checkpoint', `chat-editor.${draftId}`);
  }

  async #save(draftId, meta) {
    await this.caseRec.put('checkpoint', `chat-editor.${draftId}`, meta);
  }

  // request: the user's words. docType: optional explicit type. requestedOutcome: optional
  // { text, premises: [{ subject, value }] }.
  async generate(draftId, { request = '', docType, requestedOutcome = null } = {}) {
    if (docType && !this.method.docTypes[docType]) throw new TypeError(`unknown document type ${docType}`);
    const meta = (await this.#meta(draftId)) ?? { generations: 0, corrections: [] };
    meta.docType = docType ? { value: docType, basis: 'user' } : meta.docType ?? inferDocType(request, this.method);
    meta.requestedOutcome = requestedOutcome ?? meta.requestedOutcome ?? null;
    meta.request = request || meta.request || '';
    await this.#save(draftId, meta);
    return this.#run(draftId, meta);
  }

  async regenerate(draftId) {
    const meta = await this.#meta(draftId);
    if (!meta) throw new TypeError(`unknown draft ${draftId}`);
    return this.#run(draftId, meta);
  }

  // The user changes the inferred type. The next regeneration uses it.
  async setDocType(draftId, value) {
    if (!this.method.docTypes[value]) throw new TypeError(`unknown document type ${value}`);
    const meta = await this.#meta(draftId);
    meta.docType = { value, basis: 'user' };
    await this.#save(draftId, meta);
    return meta.docType;
  }

  async #run(draftId, meta) {
    const ctx = this.context();
    const outcome = meta.requestedOutcome;
    const type = this.method.docTypes[meta.docType.value];
    const env = { ctx, docType: meta.docType.value, outcome, mustAddress: mustAddress(ctx, outcome), style: this.style(meta.corrections) };
    const prompt = {
      task: 'draft', system: this.method.instructions, evidence: ctx, style: env.style,
      docType: { id: meta.docType.value, label: type.label, sections: type.sections },
      requestedOutcome: outcome, mustAddress: env.mustAddress, incompatibilities: incompatibilities(ctx, outcome),
    };
    const stepId = `draft.${draftId}.${meta.generations + 1}`;
    const out = await this.caseRec.runStep(stepId, ({ idempotencyKey }) => this.model({ ...prompt, idempotencyKey }));

    // Model output is untrusted: normalize, clean, then run the deterministic checks.
    const moved = [];
    const draft = {
      sections: (out?.sections ?? []).map((s) => ({ id: String(s.id), text: clean(s.text, moved), uses: [...(s.uses ?? [])] })),
      conclusion: out?.conclusion ? { text: clean(out.conclusion.text, moved), reasoning: clean(out.conclusion.reasoning, moved), uses: [...(out.conclusion.uses ?? [])] } : null,
      addressed: [...(out?.addressed ?? [])],
    };
    const issues = this.method.checks.flatMap((c) => c.run(draft, env).map((message) => ({ check: c.id, dimension: c.dimension, message })));
    const title = new Map(type.sections.map((s) => [s.id, s.title]));
    const text = draft.sections.map((s) => `## ${title.get(s.id) ?? s.id}\n${s.text}`).join('\n');

    // #7 keeps generated revisions apart from the user's edit. A clean merge keeps the edit;
    // otherwise the conflict stays open for review. Nothing overwrites the edit.
    const before = await this.caseRec.getDraft(draftId);
    const { rev, conflict } = await this.caseRec.addGeneratedRevision(draftId, text, { stepId });
    let review = null;
    if (conflict && before.user) {
      const base = before.generated.find((g) => g.rev === before.user.basedOn)?.text ?? '';
      const m = merge3(base, before.user.text, text);
      if (m.ok) await this.caseRec.saveUserEdit(draftId, m.text, rev);
      else review = m.conflicts;
    }

    const known = new Set(Object.keys(this.ledger.findings));
    const used = [...new Set([...draft.sections.flatMap((s) => s.uses), ...(draft.conclusion?.uses ?? []), ...draft.addressed])].filter((id) => known.has(id));
    registerDraft(this.ledger, draftId, used);
    Object.assign(meta, {
      generations: meta.generations + 1, rev, issues, review,
      conclusion: draft.conclusion, flags: prompt.incompatibilities, panel: sourcePanel(ctx, draft, moved),
    });
    await this.#save(draftId, meta);
    return this.view(draftId);
  }

  async saveEdit(draftId, text) {
    await this.caseRec.saveUserEdit(draftId, text);
    const meta = await this.#meta(draftId);
    meta.review = null;
    await this.#save(draftId, meta);
  }

  // choice: 'keep-user', 'take-generated', or { text } for a hand-merged text.
  async resolveConflict(draftId, choice) {
    if (choice?.text != null) await this.caseRec.saveUserEdit(draftId, choice.text, (await this.caseRec.getDraft(draftId)).generated.at(-1).rev);
    else await this.caseRec.resolveConflict(draftId, choice);
    const meta = await this.#meta(draftId);
    meta.review = null;
    await this.#save(draftId, meta);
  }

  // scope 'draft' (default): applies to this draft's regenerations only. scope 'future': the user
  // chose to change the profile; the caller persists the returned profile. Nothing else learns.
  async correct(draftId, instruction, { scope = 'draft' } = {}) {
    if (scope === 'future') {
      this.profile = { ...this.profile, instructions: [...this.profile.instructions, instruction] };
      return { scope, profile: this.profile };
    }
    if (scope !== 'draft') throw new TypeError(`invalid scope ${scope}`);
    const meta = await this.#meta(draftId);
    meta.corrections.push(instruction);
    await this.#save(draftId, meta);
    return { scope, corrections: meta.corrections };
  }

  // Always available, also for a provisional draft: editing and analysis continue.
  async view(draftId) {
    const meta = await this.#meta(draftId);
    const d = await this.caseRec.getDraft(draftId);
    const gate = draftState(this.ledger, draftId);
    const reasons = [...gate.reasons, ...meta.issues.map((i) => `check ${i.check}: ${i.message}`)];
    if (d.conflict) reasons.push('regeneration conflict waits for review');
    const state = gate.state === 'stale' ? 'stale' : reasons.length ? 'provisional' : 'conclusive';
    return {
      draftId, text: d.current, source: d.source, state, reasons, editable: true,
      label: state === 'conclusive' ? null : state.toUpperCase(),
      docType: meta.docType, requestedOutcome: meta.requestedOutcome, conclusion: meta.conclusion,
      flags: meta.flags, issues: meta.issues, panel: meta.panel, conflict: d.conflict ? { ...d.conflict, sections: meta.review } : null,
    };
  }

  // The only path that presents a draft as ready, and the one #9 transfer calls. It throws while
  // the #6 gate is closed, a check fails, or a regeneration conflict is open.
  async presentConclusive(draftId) {
    assertConclusive(this.ledger, draftId);
    const v = await this.view(draftId);
    if (v.state !== 'conclusive') throw new ProvisionalDraftError(v);
    return { draftId, text: v.text, panel: v.panel, docType: v.docType };
  }
}
