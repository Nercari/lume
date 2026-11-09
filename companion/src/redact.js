// Redaction layer: secrets are wrapped in Secret so that string conversion, JSON and
// util.inspect never show the value. redact() is a second net for free text (logs, diagnostics).
import { inspect } from 'node:util';

const REDACTED = '[REDACTED]';
const known = new Set(); // values of every live Secret; process-local, never persisted.

export class Secret {
  #value;
  constructor(value) {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError('secret must be a non-empty string');
    this.#value = value;
    if (value.length >= 8) known.add(value);
  }
  reveal() {
    return this.#value;
  }
  forget() {
    known.delete(this.#value);
  }
  toString() {
    return REDACTED;
  }
  toJSON() {
    return REDACTED;
  }
  [inspect.custom]() {
    return REDACTED;
  }
}

const PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, // JWT
  /\b(access_token|refresh_token|id_token|code|code_verifier|client_secret)=[^&\s"]+/gi,
  /"(access_token|refresh_token|id_token|code_verifier)"\s*:\s*"[^"]*"/gi,
];

export function redact(text) {
  let out = String(text);
  for (const v of known) out = out.split(v).join(REDACTED);
  for (const re of PATTERNS) {
    out = out.replace(re, (m, key) => (typeof key === 'string' ? m.replace(/([=:]\s*"?)[^&\s"]+/, `$1${REDACTED}`) : REDACTED));
  }
  return out;
}

// Logger that redacts every line. Diagnostics must go through this, never console directly.
export function createLogger(sink = (line) => process.stderr.write(line + '\n')) {
  const fmt = (args) => redact(args.map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 4 }))).join(' '));
  return {
    info: (...a) => sink(fmt(['info', ...a])),
    warn: (...a) => sink(fmt(['warn', ...a])),
    error: (...a) => sink(fmt(['error', ...a])),
  };
}
