import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeMessage, FrameDecoder, MAX_OUTBOUND_BYTES, assertLittleEndian } from '../src/framing.js';

test('round-trips messages, including split and coalesced chunks', () => {
  const a = { id: 'r1', cmd: 'status', args: {} };
  const b = { id: 'r2', cmd: 'logout', args: {}, text: 'ação ✓' };
  const bytes = Buffer.concat([encodeMessage(a), encodeMessage(b)]);
  assert.equal(bytes.readUInt32LE(0), Buffer.byteLength(JSON.stringify(a)));
  const d = new FrameDecoder();
  const out = [];
  for (let i = 0; i < bytes.length; i += 3) out.push(...d.push(bytes.subarray(i, i + 3)));
  assert.deepEqual(out, [a, b]);
});

test('rejects oversize inbound frames from the header, before buffering the body', () => {
  const d = new FrameDecoder(16);
  const header = Buffer.alloc(4);
  header.writeUInt32LE(17);
  assert.throws(() => d.push(header), { code: 'message_too_large' });
});

test('rejects oversize outbound messages (Chrome 1 MB host limit)', () => {
  assert.throws(() => encodeMessage({ s: 'x'.repeat(MAX_OUTBOUND_BYTES) }), { code: 'message_too_large' });
});

test('rejects invalid JSON and invalid UTF-8', () => {
  const frame = (body) => Buffer.concat([Buffer.from([body.length, 0, 0, 0]), body]);
  assert.throws(() => new FrameDecoder().push(frame(Buffer.from('{nope'))), { code: 'invalid_json' });
  assert.throws(() => new FrameDecoder().push(frame(Buffer.from([0x22, 0xff, 0x22]))), { code: 'invalid_json' });
});

test('refuses big-endian platforms', () => {
  assert.throws(() => assertLittleEndian('BE'), { code: 'unsupported_endianness' });
  assertLittleEndian('LE');
});
