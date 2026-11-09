// Boundaries the model, the page, and case text do not own. Values come from the
// extension manifest and the companion command table, then stay frozen.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMANDS } from '../../companion/src/commands.js';

const manifest = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../extension/manifest.json'), 'utf8'));

// Names the harness exposes to a model. Each one is a read. Write entry points
// stay on the controller classes and are not in this list.
export const MODEL_TOOLS = Object.freeze([
  'case.readInventory',
  'case.readExtraction',
  'case.readDraft',
  'case.readLedger',
  'research.readMinimized',
]);

export const CONTROLLER_ONLY = Object.freeze([
  'transfer.review',
  'transfer.insert',
  'gap.decide',
  'citation.review',
  'store.deleteCase',
  'companion.login',
  'companion.logout',
  'permissions.grant',
  'http.post',
]);

export function createPolicy() {
  return Object.freeze({
    id: 'lume-trust-0',
    modelDestinations: Object.freeze([]),
    controllerDestinations: Object.freeze(['pje-editor-text']),
    permissions: Object.freeze([...manifest.permissions]),
    contentScriptMatches: Object.freeze(manifest.content_scripts.flatMap((s) => s.matches)),
    caseIdentitySource: 'extension-visible-case',
    nativeMessagingCommands: Object.freeze(Object.keys(COMMANDS).sort()),
  });
}

export function snapshot(policy) {
  return {
    id: policy.id,
    modelDestinations: [...policy.modelDestinations],
    controllerDestinations: [...policy.controllerDestinations],
    permissions: [...policy.permissions],
    contentScriptMatches: [...policy.contentScriptMatches],
    caseIdentitySource: policy.caseIdentitySource,
    nativeMessagingCommands: [...policy.nativeMessagingCommands],
  };
}

// Evidence is stored as bytes. Its keys are not copied onto the policy.
export function absorb(policy, evidence) {
  return { id: policy.id, evidenceBytes: Buffer.byteLength(String(evidence ?? '')) };
}

export function createToolSurface(reads) {
  const allowed = new Set(MODEL_TOOLS);
  for (const name of MODEL_TOOLS) {
    if (typeof reads[name] !== 'function') throw new TypeError(`missing read tool ${name}`);
  }
  return Object.freeze({
    modelTools: MODEL_TOOLS,
    async invoke(name, args) {
      if (!allowed.has(name)) {
        return { ok: false, code: CONTROLLER_ONLY.includes(name) ? 'controller_only' : 'unknown_tool' };
      }
      return { ok: true, result: await reads[name](args) };
    },
  });
}
