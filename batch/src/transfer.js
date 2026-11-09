// Individual transfer gate (#11). The batch never signs, files, publishes, or inserts.
// Each review and each handoff needs the #8 USER_ACTION symbol that #9 also requires.
// Model output and page content cannot carry that symbol. The handoff is one case,
// and it rechecks the case id and the editor id. It does not write the editor.
import { GateError } from '../../analysis/src/gate.js';
import { USER_ACTION } from '../../chat-editor/src/session.js';
import { CASE_ID } from './constants.js';
import { BatchStop } from './errors.js';

function userOnly(origin, caseId) {
  if (origin !== USER_ACTION) throw new GateError('a transfer needs a user action');
  if (typeof caseId !== 'string' || !CASE_ID.test(caseId)) throw new GateError('transfer arguments must be plain strings from the UI');
}

function readEditor(editor) {
  if (!editor || typeof editor.caseNumber !== 'function' || typeof editor.id !== 'function') {
    throw new TypeError('editor required');
  }
  const caseNumber = editor.caseNumber();
  const editorId = editor.id();
  if (typeof caseNumber !== 'string' || caseNumber.length === 0 || typeof editorId !== 'string' || editorId.length === 0) {
    throw new BatchStop('editor_unreadable');
  }
  return { caseNumber, editorId };
}

export class TransferGate {
  constructor(queue) {
    if (!queue || typeof queue.report !== 'function') throw new TypeError('queue required');
    this.queue = queue;
    this.tickets = new Map();
    this.handed = new Set();
  }

  review(caseId, origin, editor) {
    userOnly(origin, caseId);
    const report = this.#ready(caseId);
    const current = readEditor(editor);
    if (current.caseNumber !== caseId) throw new BatchStop('case_changed');
    const ticket = Object.freeze({ caseId, draftId: report.draftId, editorId: current.editorId });
    this.tickets.set(caseId, ticket);
    return { status: 'reviewed', effect: 'none', ...ticket };
  }

  // command is any extra write instruction (sign, file, publish, insert, or a #9 mode).
  // The batch has no write command. The UI takes the handoff to #9 for this one case.
  handoff(caseId, origin, editor, command) {
    if (command !== undefined) throw new GateError('batch does not sign, file, publish, or insert');
    userOnly(origin, caseId);
    const ticket = this.tickets.get(caseId);
    if (!ticket) throw new BatchStop('not_reviewed');
    const current = readEditor(editor);
    if (current.caseNumber !== ticket.caseId) throw new BatchStop('case_changed');
    if (current.editorId !== ticket.editorId) throw new BatchStop('editor_changed');
    if (this.handed.has(caseId)) {
      return { status: 'already_handed_off', effect: 'none', caseId: ticket.caseId, draftId: ticket.draftId, editorId: ticket.editorId };
    }
    this.handed.add(caseId);
    return { status: 'individual_handoff', effect: 'none', caseId: ticket.caseId, draftId: ticket.draftId, editorId: ticket.editorId };
  }

  sign() {
    throw new GateError('batch does not sign');
  }

  file() {
    throw new GateError('batch does not file');
  }

  publish() {
    throw new GateError('batch does not publish');
  }

  insert() {
    throw new GateError('batch does not insert');
  }

  transferMany() {
    throw new GateError('transfer is individual');
  }

  #ready(caseId) {
    const report = this.queue.report(caseId);
    if (report.status !== 'succeeded' || typeof report.draftId !== 'string') throw new BatchStop('not_ready');
    return report;
  }
}
