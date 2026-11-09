// Synthetic, non-legal technical fixtures only. No real case content, names or numbers.
import { CaseStore, MemoryBackend, createAesGcmCodec } from '../src/index.js';

export const CASE_A = 'fixture-alpha';
export const CASE_B = 'fixture-beta';

export function clock(start = 1_000_000) {
  const c = { t: start, now: () => c.t, advance: (ms) => (c.t += ms) };
  return c;
}

// One backend models the browser's persistent IndexedDB. A new CaseStore on the same backend
// models a worker restart or a browser restart (all in-memory state is gone).
export function env({ encrypted = true } = {}) {
  const backend = new MemoryBackend();
  const c = clock();
  const session = { open: true };
  const make = () =>
    new CaseStore({
      backend,
      codec: encrypted ? createAesGcmCodec({ backend }) : undefined,
      now: c.now,
      sleep: async () => {},
      browserSession: () => session.open,
    });
  return { backend, clock: c, session, make };
}

export const FAKE_TOKENS = [
  'Bearer synthetic.FAKE.bearer-0123456789abcdef',
  'eyJhbGciOiJub25lIn0.eyJzdWIiOiJmaXh0dXJlIn0.c2lnbmF0dXJl',
  'refresh_token=FAKErefreshTOKENvalue0123456789',
  'JSESSIONID=FAKEsession0123456789ABCDEF',
  'sk-FAKEsyntheticKEY0123456789',
];

// Anything shaped like a credential or token.
export const TOKEN_SHAPE =
  /Bearer\s+(?!\[REDACTED)\S+|eyJ[\w-]+\.[\w-]+|\bsk-[A-Za-z0-9_-]{8,}|(token|session|cookie|password|secret)\w*\s*[:=]\s*(?!\[REDACTED)\S+|FAKE[A-Za-z0-9]{8,}/i;
