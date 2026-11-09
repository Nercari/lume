// Redaction for diagnostics and stored error text. Diagnostics carry no case content, so this
// only has to remove credentials and tokens that can appear in error messages.

const RULES = [
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]'],
  [/\beyJ[\w-]+\.[\w-]+(\.[\w-]*)?/g, '[REDACTED-JWT]'],
  [/\bsk-[A-Za-z0-9_-]{8,}/g, '[REDACTED-KEY]'],
  [
    /\b(access_token|refresh_token|id_token|token|password|passwd|secret|client_secret|cookie|set-cookie|authorization|session|jsessionid|api[_-]?key)\b(\s*[:=]\s*)"?[^\s"&;,]+"?/gi,
    '$1$2[REDACTED]',
  ],
  [/\b[A-Za-z0-9+/_-]{32,}={0,2}/g, '[REDACTED-OPAQUE]'],
];

const MAX = 200;

export function redact(text) {
  let s = String(text ?? '');
  for (const [re, sub] of RULES) s = s.replace(re, sub);
  return s.length > MAX ? `${s.slice(0, MAX)}…[truncated]` : s;
}
