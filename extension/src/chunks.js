// Bytes move from the content script to the study page on a chrome.runtime.Port,
// in order, one slice at a time.
//
// A single runtime message has to structured-clone the whole PDF. Large clones
// fail quietly or stall the service worker, and the study page cannot show
// progress or cancel in the middle. A port keeps one stream per study: each
// slice names its document index, sequence and total, so a missing slice is an
// error instead of a short file. The worker only forwards slices. It does not
// write them to disk.
//
// Each slice is base64, not a Uint8Array. The worker forwards the same message
// on a second port, and Chrome detaches an ArrayBuffer on that hop, so the
// study page would receive an empty file. A string is copied both times.

export const CHUNK_BYTES = 64 * 1024;

export function splitBytes(bytes, size = CHUNK_BYTES) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  const limit = size > 0 ? size : CHUNK_BYTES;
  if (input.byteLength === 0) return [{ seq: 0, total: 1, bytes: new Uint8Array() }];
  const total = Math.ceil(input.byteLength / limit);
  const out = [];
  for (let seq = 0; seq < total; seq += 1) {
    const start = seq * limit;
    out.push({ seq, total, bytes: input.slice(start, start + limit) });
  }
  return out;
}

export function encodeBytes(bytes) {
  const input = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes ?? []);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < input.length; i += step) {
    binary += String.fromCharCode(...input.subarray(i, i + step));
  }
  return btoa(binary);
}

export function decodeBytes(value) {
  if (value instanceof Uint8Array) return new Uint8Array(value);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  const binary = atob(String(value ?? ''));
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function joinChunks(parts) {
  if (!Array.isArray(parts) || parts.length === 0) throw new Error('nenhum bloco');
  const ordered = [...parts].sort((a, b) => a.seq - b.seq);
  const total = ordered[0].total;
  if (!Number.isInteger(total) || ordered.length !== total) {
    throw new Error(`blocos ${ordered.length} de ${total}`);
  }
  let length = 0;
  for (let seq = 0; seq < ordered.length; seq += 1) {
    if (ordered[seq].seq !== seq || ordered[seq].total !== total) throw new Error(`bloco ${seq} ausente`);
    const slice = decodeBytes(ordered[seq].bytes);
    ordered[seq] = { ...ordered[seq], bytes: slice };
    length += slice.byteLength;
  }
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of ordered) {
    out.set(part.bytes, offset);
    offset += part.bytes.byteLength;
  }
  return out;
}
