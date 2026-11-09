// Encryption-at-rest hook. A codec turns a record into the stored form and back:
//   encode(caseId, key, value) -> stored     decode(caseId, key, stored) -> value     forget(caseId)
// plainCodec stores values as they are (tests and inspection only).
// createAesGcmCodec keeps one non-extractable AES-GCM key per case. The record key is the
// additional authenticated data, so a record copied to another case or key does not decrypt.
// forget(caseId) deletes the case key, which makes any left-over ciphertext unreadable.

export const plainCodec = Object.freeze({
  encode: async (_caseId, _key, value) => value,
  decode: async (_caseId, _key, stored) => stored,
  forget: async () => {},
});

const enc = new TextEncoder();
const dec = new TextDecoder();

export function createAesGcmCodec({ backend, subtle = globalThis.crypto.subtle }) {
  const keyName = (caseId) => `keys/${caseId}`;
  const cache = new Map();

  async function keyFor(caseId, create) {
    if (cache.has(caseId)) return cache.get(caseId);
    let key = await backend.get(keyName(caseId));
    if (!key && create) {
      key = await subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      await backend.put(keyName(caseId), key);
    }
    if (key) cache.set(caseId, key);
    return key;
  }

  return Object.freeze({
    async encode(caseId, key, value) {
      const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
      const data = enc.encode(JSON.stringify(value));
      const ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(key) }, await keyFor(caseId, true), data);
      return { iv, ct: new Uint8Array(ct) };
    },
    async decode(caseId, key, stored) {
      const k = await keyFor(caseId, false);
      if (!k) throw new Error('case key missing: record is unreadable');
      const pt = await subtle.decrypt({ name: 'AES-GCM', iv: stored.iv, additionalData: enc.encode(key) }, k, stored.ct);
      return JSON.parse(dec.decode(pt));
    },
    async forget(caseId) {
      cache.delete(caseId);
      await backend.delete(keyName(caseId));
    },
  });
}
