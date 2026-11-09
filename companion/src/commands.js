// Typed command schema for the Native Messaging host. The host exposes these commands only;
// there is no general-purpose local API (no fetch/proxy/exec/file commands).
//
// Request:  { id: string, cmd: <name>, args: {...} }   (no other keys)
// Response: { id, ok: true, result } | { id, ok: false, error: { code, message } }

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const EXTENSION_ID_RE = /^[a-p]{32}$/; // Chrome extension IDs: 32 chars a-p.

// Each command lists its allowed argument keys and a validator per key.
export const COMMANDS = Object.freeze({
  status: {},
  'login.start': {},
  logout: {},
});

export class CommandError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;

export function originFor(extensionId) {
  if (!EXTENSION_ID_RE.test(extensionId)) throw new CommandError('bad_config', 'extension ID is not a valid Chrome extension ID');
  return `chrome-extension://${extensionId}/`;
}

// Chrome passes the caller origin as the first argument to the host.
export function checkOrigin(callerOrigin, allowedOrigin) {
  if (typeof callerOrigin !== 'string' || callerOrigin !== allowedOrigin) {
    throw new CommandError('bad_origin', 'caller origin is not allowed');
  }
}

export function validateRequest(msg) {
  if (!isPlainObject(msg)) throw new CommandError('bad_request', 'request must be an object');
  const keys = Object.keys(msg);
  if (keys.some((k) => !['id', 'cmd', 'args'].includes(k))) throw new CommandError('bad_request', 'request has unknown keys');
  if (typeof msg.id !== 'string' || !ID_RE.test(msg.id)) throw new CommandError('bad_request', 'request id is invalid');
  if (typeof msg.cmd !== 'string' || !Object.hasOwn(COMMANDS, msg.cmd)) throw new CommandError('unknown_command', 'command is not supported');
  const args = msg.args ?? {};
  if (!isPlainObject(args)) throw new CommandError('bad_request', 'args must be an object');
  const spec = COMMANDS[msg.cmd];
  for (const [k, v] of Object.entries(args)) {
    if (!Object.hasOwn(spec, k) || !spec[k](v)) throw new CommandError('bad_args', `argument ${k} is not allowed`);
  }
  return { id: msg.id, cmd: msg.cmd, args };
}
