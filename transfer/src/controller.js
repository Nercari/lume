// User-only transfer controller (#9). It moves one reviewed, conclusive draft into the PJe editor.
// No model tool reaches it: both entry points need the #8 USER_ACTION symbol, which only the UI
// user-action handler holds. Model output and page content are data and cannot carry a Symbol.
// It never saves, signs, files or publishes, and it moves one draft per ticket.
import { USER_ACTION } from '../../chat-editor/src/index.js';
import { GateError, ProvisionalDraftError } from '../../analysis/src/index.js';
import { UNSUPPORTED_LABEL } from '../../source-panel/src/index.js';
import { AUTOSAVE, TransferStop } from './editor.js';

export const MODES = Object.freeze(['empty', 'replace', 'append']);
export const SEPARATOR = '\n\n';
// #10 entry statuses that block a transfer when the entry is decisive. 'unverified' (no human
// semantic review yet) does not block; the panel shows it to the user before the transfer.
export const BLOCKING_STATUSES = Object.freeze([...new Set([...Object.values(UNSUPPORTED_LABEL),
  'not_in_case', 'not_found', 'stale', 'quote_mismatch', 'ocr_unreliable', 'not_supported'])]);
const BLOCKING = new Set(BLOCKING_STATUSES);
const SECTION = /^[a-z_]{1,32}$/;
const key = (token) => `transfer.${token}`;

export function compose(mode, before, draft) {
  if (mode === 'empty' || mode === 'replace') return draft;
  if (mode === 'append') return `${before.replace(/\s+$/, '')}${SEPARATOR}${draft}`;
  throw new TypeError('invalid mode');
}

function userOnly(origin, ...args) {
  if (origin !== USER_ACTION) throw new GateError('a transfer needs a user action');
  // Strings only: an object from model output or page content ({ actor, command, ... }) is refused.
  for (const a of args) if (typeof a !== 'string' || !a) throw new GateError('transfer arguments must be plain strings from the UI');
}

// presented: #8 presentConclusive result. panel: #10 buildPanel result for the same draft.
export function assertSupported(presented, panel) {
  if (!panel?.entries) throw new TransferStop('no_source_panel');
  const bad = [...presented.panel.entries.filter((e) => e.verification !== 'unverified'), ...panel.entries.filter((e) => e.decisive && BLOCKING.has(e.status))];
  const unaccounted = (panel.unaccounted ?? []).length;
  // Diagnostics carry counts and section names only: finding ids contain PJe document ids.
  if (bad.length || unaccounted) throw new TransferStop('unsupported_decisive', { entries: bad.length, unaccounted, sections: [...new Set(bad.map((e) => SECTION.test(e.ref) ? e.ref : 'other'))] });
}

// #8 gate errors carry the draft view (text, finding and passage ids). Rethrow without it:
// only the state and the check names leave the controller. The UI reads details from session.view().
function clean(e) {
  if (e instanceof ProvisionalDraftError) {
    throw new ProvisionalDraftError({ state: SECTION.test(e.state?.state) ? e.state.state : 'provisional', reasons: (e.state?.reasons ?? []).map((r) => /^check [a-z_]+/.exec(r)?.[0] ?? 'gate reason') });
  }
  if (e instanceof GateError) throw new GateError('the draft did not pass the conclusive gate');
  throw e;
}

export class TransferController {
  #busy = false;

  // caseRec: #7 Case. ledger: #6 ledger. session: #8 CaseSession. editor: domEditor(). caseNumber:
  // the case identity that #4 read for this case. panelFor(draftId, presented): the #10 panel.
  constructor({ caseRec, ledger, session, editor, caseNumber, panelFor, autosave = AUTOSAVE, newToken = () => crypto.randomUUID(), now = Date.now }) {
    if (!caseNumber) throw new TypeError('caseNumber is required');
    if (typeof panelFor !== 'function') throw new TypeError('panelFor is required');
    Object.assign(this, { caseRec, ledger, session, editor, caseNumber, panelFor, autosave, newToken, now });
  }

  async #gate(draftId) {
    const presented = await this.session.presentConclusive(draftId).catch(clean); // #8 + #6 gate; throws if provisional
    assertSupported(presented, await this.panelFor(draftId, presented));
    return presented;
  }

  #editorState() {
    if (this.editor.kind !== 'mock' && !this.autosave.measured) throw new TransferStop('autosave_unmeasured');
    if (this.editor.caseNumber() !== this.caseNumber) throw new TransferStop('case_changed', 'the open PJe case is not this case');
    return { editorId: this.editor.id(), text: this.editor.read() ?? '' };
  }

  // Step 1, after a user click: check everything, then offer the modes for the current editor.
  async review(draftId, origin) {
    userOnly(origin, draftId);
    const presented = await this.#gate(draftId);
    const ed = this.#editorState();
    const modes = ed.text.trim() ? ['replace', 'append'] : ['empty'];
    const ticket = {
      token: this.newToken(), draftId, ledgerRev: this.ledger.rev, draftText: presented.text,
      editorId: ed.editorId, before: ed.text, modes, state: 'reviewed', mode: null, at: this.now(),
    };
    await this.caseRec.put('checkpoint', key(ticket.token), ticket);
    return {
      token: ticket.token, draftId, modes, draftText: presented.text, editorText: ed.text, effects: this.autosave,
      previews: Object.fromEntries(modes.map((m) => [m, compose(m, ed.text, presented.text)])),
    };
  }

  // Step 2, after a second user click on one offered mode. Repeat calls with the same token are
  // safe: a finished ticket never writes again, and an interrupted one inspects the editor first.
  async transfer(token, mode, origin) {
    userOnly(origin, token, mode);
    if (this.#busy) throw new TransferStop('transfer_in_progress');
    this.#busy = true;
    try { return await this.#transfer(token, mode); } finally { this.#busy = false; }
  }

  async #save(t) {
    await this.caseRec.put('checkpoint', key(t.token), t);
  }

  async #transfer(token, mode) {
    const t = await this.caseRec.get('checkpoint', key(token));
    if (!t) throw new TransferStop('unknown_ticket');
    if (t.mode && t.mode !== mode) throw new TransferStop('mode_changed');
    if (!t.modes.includes(mode)) throw new TransferStop('mode_not_offered'); // no echo: the mode string comes from the caller
    if (t.state === 'done') return { status: 'already_done', token, mode, wrote: false };
    if (t.state === 'uncertain') throw new TransferStop('uncertain_editor_state', 'review the editor and start a new review');

    if (this.ledger.rev !== t.ledgerRev) throw new TransferStop('case_changed', 'the case record changed after review');
    const presented = await this.#gate(t.draftId);
    if (presented.text !== t.draftText) throw new TransferStop('draft_changed');
    const ed = this.#editorState();
    if (ed.editorId !== t.editorId) throw new TransferStop('editor_changed', 'another editor is open');
    const after = compose(mode, t.before, t.draftText);

    if (t.state === 'writing') {
      // An earlier write was interrupted. Inspect the editor; never repeat the write blindly.
      if (ed.text === after) return this.#finish(t, false);
      if (ed.text !== t.before) {
        t.state = 'uncertain';
        await this.#save(t);
        throw new TransferStop('uncertain_editor_state', 'the editor has neither the old nor the new text');
      }
    } else if (ed.text !== t.before) throw new TransferStop('editor_changed', 'the editor text changed after review');

    // Persist the intent (and the old editor text) before the write, so a crash can resume.
    Object.assign(t, { state: 'writing', mode, after });
    await this.#save(t);
    this.editor.write(after);
    if (this.editor.read() !== after) {
      t.state = 'uncertain';
      await this.#save(t);
      throw new TransferStop('uncertain_editor_state', 'the editor does not show the written text');
    }
    return this.#finish(t, true);
  }

  async #finish(t, wrote) {
    Object.assign(t, { state: 'done', doneAt: this.now() });
    await this.#save(t);
    return { status: wrote ? 'inserted' : 'verified_after_interruption', token: t.token, mode: t.mode, wrote, effects: this.autosave };
  }
}
