// Narrow PJe editor adapter. It reads the case identity and the editor, and sets the editor text.
// It has no save, sign, file or publish operation, and it clicks nothing.

// shortcut: these selectors are UNVERIFIED placeholders, the same status as the #4 PROFILE.
// Calibrate them against a permitted real case through the #3 route before live use.
export const EDITOR_PROFILE = Object.freeze({
  id: 'pje-minuta-v0-unverified',
  kind: 'mock',
  caseNumber: '.numero-processo',
  editor: '#editorMinuta',
});

// What a write into the PJe editor can cause outside the controller. Live transfer stays
// disabled until a maintainer measures PJe autosave on a permitted case (issue #9).
export const AUTOSAVE = Object.freeze({
  measured: false,
  assumption: 'PJe can save the editor content as soon as it changes; treat every write as saved',
  controllerWrites: 'the editor text, once per ticket',
  controllerNeverDoes: Object.freeze(['save', 'sign', 'file', 'publish']),
  recovery: 'the ticket keeps the editor text from before the write; replace can be undone from it',
});

export class TransferStop extends Error {
  constructor(reason, detail = null) {
    super(detail == null ? reason : `${reason}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    this.reason = reason;
    this.detail = detail;
  }
}

const text = (n) => (n?.textContent ?? '').replace(/\s+/g, ' ').trim();

// doc: the PJe page document (or a mock with querySelector, getAttribute and textContent).
export function domEditor(doc, p = EDITOR_PROFILE) {
  const node = () => {
    const n = doc.querySelector(p.editor);
    if (!n) throw new TransferStop('editor_missing');
    return n;
  };
  return Object.freeze({
    kind: p.kind,
    caseNumber: () => text(doc.querySelector(p.caseNumber)) || null,
    id: () => node().getAttribute('data-editor-id'),
    read: () => node().textContent,
    write: (value) => { node().textContent = value; },
  });
}
