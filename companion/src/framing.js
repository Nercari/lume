// Chrome Native Messaging framing: 4-byte length prefix + UTF-8 JSON.
// Chrome documents "native byte order"; every platform we target (x86-64, arm64) is little-endian,
// so the host refuses to run on a big-endian machine instead of guessing (see assertLittleEndian).
import { endianness } from 'node:os';

export const MAX_OUTBOUND_BYTES = 1024 * 1024; // Chrome limit for host -> extension (1 MB).
export const MAX_INBOUND_BYTES = 64 * 1024; // Our own cap; Chrome allows 64 MiB, our commands are tiny.

export class FramingError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function assertLittleEndian(order = endianness()) {
  if (order !== 'LE') throw new FramingError('unsupported_endianness', 'host requires a little-endian platform');
}

export function encodeMessage(value, maxBytes = MAX_OUTBOUND_BYTES) {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  if (body.length > maxBytes) throw new FramingError('message_too_large', `outbound message exceeds ${maxBytes} bytes`);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length, 0);
  return Buffer.concat([header, body]);
}

// Incremental decoder for a byte stream (stdin). Throws on oversize before buffering the body.
export class FrameDecoder {
  #buf = Buffer.alloc(0);
  constructor(maxBytes = MAX_INBOUND_BYTES) {
    this.maxBytes = maxBytes;
  }

  push(chunk) {
    this.#buf = Buffer.concat([this.#buf, chunk]);
    const out = [];
    while (this.#buf.length >= 4) {
      const len = this.#buf.readUInt32LE(0);
      if (len > this.maxBytes) throw new FramingError('message_too_large', `inbound message exceeds ${this.maxBytes} bytes`);
      if (this.#buf.length < 4 + len) break;
      const body = this.#buf.subarray(4, 4 + len);
      this.#buf = this.#buf.subarray(4 + len);
      let parsed;
      try {
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
      } catch {
        throw new FramingError('invalid_json', 'inbound message is not valid UTF-8 JSON');
      }
      out.push(parsed);
    }
    return out;
  }
}
